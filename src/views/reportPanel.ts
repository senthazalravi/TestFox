import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { ManualTestTracker } from '../manual/manualTestTracker';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { TEST_CATEGORIES, CATEGORY_GROUPS, TestCase, TestResult, SecurityFinding } from '../types';
import { DefectTracker, Defect } from '../tracking/defectTracker';
import { IssueCreator } from '../core/issueCreator';
import { GitIntegration } from '../core/gitIntegration';

/**
 * Interactive webview report panel
 */
export class ReportPanel {
    public static currentPanel: ReportPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(
        extensionUri: vscode.Uri,
        testStore: TestStore,
        manualTestTracker: ManualTestTracker,
        defectTracker?: DefectTracker,
        issueCreator?: IssueCreator
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ReportPanel.currentPanel) {
            ReportPanel.currentPanel._panel.reveal(column);
            ReportPanel.currentPanel.updateContent(testStore, manualTestTracker);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'testfoxReport',
            'TestFox Report',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ReportPanel.currentPanel = new ReportPanel(panel, extensionUri, testStore, manualTestTracker, defectTracker, issueCreator);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        testStore: TestStore,
        manualTestTracker: ManualTestTracker,
        private defectTracker?: DefectTracker,
        private issueCreator?: IssueCreator
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set initial content
        this.updateContent(testStore, manualTestTracker);

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'exportHtml':
                        await this.exportReportAsHtml(testStore, manualTestTracker);
                        break;
                    case 'refresh':
                        this.updateContent(testStore, manualTestTracker);
                        break;
                    case 'openTest':
                        vscode.commands.executeCommand('testfox.showTestDetails', message.testId);
                        break;
                case 'createGitHubIssue':
                        await this.createIssue('github', message.testId, message.defectId);
                        break;
                case 'createJiraIssue':
                        await this.createIssue('jira', message.testId, message.defectId);
                        break;
                case 'copyIssue':
                        await this.copyIssueContent(message.testId, message.defectId);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async createIssue(platform: 'github' | 'jira', testId: string, defectId?: string): Promise<void> {
        if (!this.issueCreator) {
            vscode.window.showErrorMessage('TestFox: Issue creation is not available. Please configure Git integration.');
            return;
        }

        const command = platform === 'github' ? 'testfox.createGitHubIssue' : 'testfox.createJiraIssue';
        await vscode.commands.executeCommand(command, testId);
    }

    private async copyIssueContent(testId: string, defectId?: string): Promise<void> {
        if (!this.issueCreator) {
            vscode.window.showErrorMessage('TestFox: Issue creation is not available.');
            return;
        }

        const test = this.testStore?.getTest(testId);
        if (!test) {
            vscode.window.showErrorMessage('TestFox: Test not found.');
            return;
        }

        const result = this.testStore?.getTestResult(testId);
        if (!result || result.status !== 'failed') {
            vscode.window.showWarningMessage('TestFox: Test did not fail. Cannot create issue content.');
            return;
        }

        try {
            const issueContent = await this.issueCreator.generateIssueContent({
                platform: 'github',
                test,
                result,
                runId: `run-${Date.now()}`,
                logs: Array.isArray(result.logs) ? result.logs.join('\n') : undefined,
                stackTrace: result.error
            });

            // Format issue content for copying
            const issueText = `# ${issueContent.title}

${issueContent.description}

## Test Information
- **Test Name**: ${issueContent.references.test_name}
- **Category**: ${issueContent.references.test_category}
- **Defect ID**: ${defectId || 'N/A'}
- **Run ID**: ${issueContent.references.run_id}
${issueContent.references.commit ? `- **Commit**: ${issueContent.references.commit}` : ''}
${issueContent.severity ? `- **Severity**: ${issueContent.severity}` : ''}

## Error Details
\`\`\`
${result.error || 'No error details available'}
\`\`\`

${result.logs && result.logs.length > 0 ? `## Logs
\`\`\`
${result.logs.join('\n')}
\`\`\`` : ''}

## Labels
${issueContent.labels.map(l => `- ${l}`).join('\n') || 'None'}

---
*Generated by TestFox Extension*`;

            await vscode.env.clipboard.writeText(issueText);
            vscode.window.showInformationMessage('TestFox: Issue content copied to clipboard!');
        } catch (error) {
            vscode.window.showErrorMessage(`TestFox: Failed to generate issue content - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private testStore?: TestStore;

    public async updateContent(testStore: TestStore, manualTestTracker: ManualTestTracker): Promise<void> {
        this.testStore = testStore;
        const tests = testStore.getAllTests();
        const results = testStore.getTestResults();
        const projectInfo = testStore.getProjectInfo();
        const stats = testStore.getStatistics();

        // Gather comprehensive execution metadata
        const executionMetadata = await this.gatherExecutionMetadata(tests, results);

        // Get Git information
        const gitInfo = await this.gatherGitInformation();

        // Calculate performance metrics
        const performanceMetrics = this.calculatePerformanceMetrics(tests, results);

        // Get trend data from defect tracker if available
        let trendData = null;
        if (this.defectTracker) {
            trendData = this.defectTracker.getImprovementMetrics();
        }

        // Try to get AI recommendations
        let aiSummary: { summary: string; recommendations: string[]; riskLevel: string; releaseReady: boolean } | null = null;
        const openRouter = getOpenRouterClient();
        
        if (openRouter.isEnabled() && tests.length > 0) {
            try {
                const failedTests = tests.filter(t => {
                    const result = results.find(r => r.testId === t.id);
                    return result?.status === 'failed' || result?.status === 'manual_fail';
                });

                const securityTests = tests.filter(t => t.category === 'security');
                const failedSecurityTests = securityTests.filter(t => {
                    const result = results.find(r => r.testId === t.id);
                    return result?.status === 'failed';
                });

                const summaryResponse = await openRouter.generateReportSummary({
                    totalTests: stats.total,
                    passed: stats.passed + stats.manualPass,
                    failed: stats.failed + stats.manualFail,
                    passRate: stats.total > 0 ? Math.round((stats.passed + stats.manualPass) / stats.total * 100) : 0,
                    securityIssues: failedSecurityTests.map(t => t.name),
                    performanceMetrics: performanceMetrics,
                    failedTests: failedTests.map(t => t.name).slice(0, 10)
                });

                aiSummary = JSON.parse(summaryResponse);
            } catch (error) {
                console.error('Failed to generate AI summary:', error);
            }
        }

        this._panel.webview.html = this.getEnhancedHtmlContent(tests, results, stats, projectInfo, aiSummary, executionMetadata, gitInfo, performanceMetrics, trendData);
    }

    /**
     * Gather comprehensive execution metadata
     */
    private async gatherExecutionMetadata(tests: TestCase[], results: TestResult[]): Promise<any> {
        const startTime = new Date();
        let earliestResult = startTime;
        let latestResult = new Date(0);

        // Calculate execution times
        results.forEach(result => {
            if (result.startTime) {
                const start = new Date(result.startTime);
                if (start < earliestResult) earliestResult = start;
            }
            if (result.endTime) {
                const end = new Date(result.endTime);
                if (end > latestResult) latestResult = end;
            }
        });

        const totalDuration = latestResult > earliestResult ? latestResult.getTime() - earliestResult.getTime() : 0;

        // Calculate average execution time
        const completedResults = results.filter(r => r.startTime && r.endTime);
        const avgExecutionTime = completedResults.length > 0
            ? completedResults.reduce((sum, r) => {
                const duration = r.endTime && r.startTime ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime() : 0;
                return sum + duration;
            }, 0) / completedResults.length
            : 0;

        // Get test environment information
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const nodeVersion = process.version;
        const platform = process.platform;

        return {
            executionStart: earliestResult.toISOString(),
            executionEnd: latestResult.toISOString(),
            totalDuration,
            averageExecutionTime: avgExecutionTime,
            environment: {
                nodeVersion,
                platform,
                workspace: workspaceFolder?.name || 'Unknown',
                vscodeVersion: vscode.version
            },
            testRunId: `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
    }

    /**
     * Gather Git repository information
     */
    private async gatherGitInformation(): Promise<any> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { available: false };
            }

            const gitIntegration = new GitIntegration(workspaceFolder.uri.fsPath);
            const currentCommit = await gitIntegration.getCurrentCommit();

            // Get branch information
            let branch = 'unknown';
            let remoteUrl = '';
            try {
                const gitExtension = vscode.extensions.getExtension('vscode.git');
                if (gitExtension && gitExtension.isActive) {
                    const git = gitExtension.exports.getAPI(1);
                    const repositories = git.repositories;

                    if (repositories.length > 0) {
                        const repo = repositories[0];
                        branch = repo.state.HEAD?.name || 'HEAD';
                        const remote = repo.state.remotes.find(r => r.name === 'origin');
                        remoteUrl = remote?.fetchUrl || '';
                    }
                }
            } catch (error) {
                console.log('Could not get Git branch info:', error);
            }

            return {
                available: true,
                currentCommit: currentCommit || null,
                branch,
                remoteUrl,
                commitShort: currentCommit ? currentCommit.substring(0, 7) : null
            };
        } catch (error) {
            console.log('Git information gathering failed:', error);
            return { available: false, error: error.message };
        }
    }

    /**
     * Calculate performance metrics
     */
    private calculatePerformanceMetrics(tests: TestCase[], results: TestResult[]): any {
        const completedResults = results.filter(r => r.startTime && r.endTime && r.status === 'passed');

        if (completedResults.length === 0) {
            return { avgTime: 0, minTime: 0, maxTime: 0, slowTests: [] };
        }

        const durations = completedResults.map(r => {
            const duration = r.endTime && r.startTime ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime() : 0;
            return { duration, testId: r.testId };
        });

        const avgTime = durations.reduce((sum, d) => sum + d.duration, 0) / durations.length;
        const minTime = Math.min(...durations.map(d => d.duration));
        const maxTime = Math.max(...durations.map(d => d.duration));

        // Find slowest tests
        const slowTests = durations
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 5)
            .map(d => {
                const test = tests.find(t => t.id === d.testId);
                return {
                    name: test?.name || 'Unknown',
                    duration: d.duration,
                    category: test?.category || 'unknown'
                };
            });

        return {
            avgTime,
            minTime,
            maxTime,
            slowTests,
            totalCompleted: completedResults.length
        };
    }

    private getEnhancedHtmlContent(
        tests: TestCase[],
        results: TestResult[],
        stats: any,
        projectInfo: any,
        aiSummary: { summary: string; recommendations: string[]; riskLevel: string; releaseReady: boolean } | null,
        executionMetadata: any,
        gitInfo: any,
        performanceMetrics: any,
        trendData: any
    ): string {
        const passRate = stats.total > 0 ? Math.round((stats.passed + stats.manualPass) / stats.total * 100) : 0;
        
        // Enhanced data processing
        const categoryStats = TEST_CATEGORIES.map(cat => {
            const categoryTests = tests.filter(t => t.category === cat.id);
            const categoryResults = categoryTests.map(t => {
                const result = results.find(r => r.testId === t.id);
                return { test: t, status: result?.status || 'pending' };
            });
            
            return {
                ...cat,
                total: categoryTests.length,
                passed: categoryResults.filter(r => r.status === 'passed' || r.status === 'manual_pass').length,
                failed: categoryResults.filter(r => r.status === 'failed' || r.status === 'manual_fail').length,
                pending: categoryResults.filter(r => r.status === 'pending' || r.status === 'not_tested').length
            };
        }).filter(c => c.total > 0);

        // Enhanced failed tests with defect tracking
        const failedTests = tests.filter(t => {
            const result = results.find(r => r.testId === t.id);
            return result?.status === 'failed' || result?.status === 'manual_fail';
        }).map(t => {
            const result = results.find(r => r.testId === t.id);
            const defect = this.defectTracker?.findDefectByTestId(t.id);
            return {
                test: t,
                error: result?.error || 'Test failed',
                duration: result?.startTime && result?.endTime ?
                    new Date(result.endTime).getTime() - new Date(result.startTime).getTime() : 0,
                defectId: defect?.id || null,
                severity: defect?.severity || (t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'high' : 'medium')
            };
        });

        // Enhanced security findings
        const securityTests = tests.filter(t => t.category === 'security');
        const securityFindings = securityTests.map(t => {
            const result = results.find(r => r.testId === t.id);
            return {
                test: t,
                status: result?.status || 'pending',
                severity: t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'high' : 'medium',
                vulnerability: t.securityType || 'unknown'
            };
        }).filter(f => f.status === 'failed');

        // Prepare chart data
        const chartData = this.prepareChartData(categoryStats, trendData, performanceMetrics, executionMetadata);

        // Format execution time
        const formatDuration = (ms: number): string => {
            if (ms < 1000) return `${ms}ms`;
            if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
            return `${(ms / 60000).toFixed(1)}m`;
        };

        // Format timestamp
        const formatTimestamp = (isoString: string): string => {
            return new Date(isoString).toLocaleString();
        };

        return this.generateEnhancedHtml(tests, results, stats, projectInfo, aiSummary, executionMetadata, gitInfo, performanceMetrics, trendData, chartData, categoryStats, failedTests, securityFindings, passRate, formatDuration, formatTimestamp);
    }

    /**
     * Prepare comprehensive chart data
     */
    private prepareChartData(categoryStats: any[], trendData: any, performanceMetrics: any, executionMetadata: any): any {
        // Category distribution chart
        const categoryChartData = {
            labels: categoryStats.map(c => c.name),
            datasets: [{
                label: 'Passed',
                data: categoryStats.map(c => c.passed),
                backgroundColor: 'rgba(76, 175, 80, 0.8)',
                borderColor: 'rgba(76, 175, 80, 1)',
                borderWidth: 1
            }, {
                label: 'Failed',
                data: categoryStats.map(c => c.failed),
                backgroundColor: 'rgba(244, 67, 54, 0.8)',
                borderColor: 'rgba(244, 67, 54, 1)',
                borderWidth: 1
            }, {
                label: 'Pending',
                data: categoryStats.map(c => c.pending),
                backgroundColor: 'rgba(255, 152, 0, 0.8)',
                borderColor: 'rgba(255, 152, 0, 1)',
                borderWidth: 1
            }]
        };

        // Test status pie chart
        const totalTests = categoryStats?.reduce((sum, c) => sum + (c?.total || 0), 0) || 0;
        const totalPassed = categoryStats?.reduce((sum, c) => sum + (c?.passed || 0), 0) || 0;
        const totalFailed = categoryStats?.reduce((sum, c) => sum + (c?.failed || 0), 0) || 0;
        const totalPending = categoryStats?.reduce((sum, c) => sum + (c?.pending || 0), 0) || 0;

        const statusChartData = {
            labels: ['Passed', 'Failed', 'Pending'],
            datasets: [{
                data: [totalPassed, totalFailed, totalPending],
                backgroundColor: [
                    'rgba(76, 175, 80, 0.8)',
                    'rgba(244, 67, 54, 0.8)',
                    'rgba(255, 152, 0, 0.8)'
                ],
                borderColor: [
                    'rgba(76, 175, 80, 1)',
                    'rgba(244, 67, 54, 1)',
                    'rgba(255, 152, 0, 1)'
                ],
                borderWidth: 2
            }]
        };

        // Performance chart data
        const performanceChartData = {
            labels: performanceMetrics.slowTests?.map((t: any) => t.name.substring(0, 15) + '...') || [],
            datasets: [{
                label: 'Execution Time (ms)',
                data: performanceMetrics.slowTests?.map((t: any) => t.duration) || [],
                backgroundColor: 'rgba(33, 150, 243, 0.8)',
                borderColor: 'rgba(33, 150, 243, 1)',
                borderWidth: 1
            }]
        };

        // Trend data for line charts
        const trendChartData = trendData ? {
            passRate: {
                labels: trendData.runLabels || [],
                datasets: [{
                    label: 'Pass Rate %',
                    data: trendData.passRateTrend || [],
                    borderColor: 'rgba(76, 175, 80, 1)',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            defectTrend: {
                labels: trendData.runLabels || [],
                datasets: [{
                    label: 'Open Defects',
                    data: trendData.defectTrend || [],
                    borderColor: 'rgba(244, 67, 54, 1)',
                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            }
        } : null;

        return {
            categoryChart: categoryChartData,
            statusChart: statusChartData,
            performanceChart: performanceChartData,
            trendChart: trendChartData
        };
    }

    /**
     * Generate the comprehensive enhanced HTML report
     */
    private generateEnhancedHtml(
        tests: TestCase[], results: TestResult[], stats: any, projectInfo: any,
        aiSummary: any, executionMetadata: any, gitInfo: any, performanceMetrics: any,
        trendData: any, chartData: any, categoryStats: any[], failedTests: any[],
        securityFindings: any[], passRate: number,
        formatDuration: (ms: number) => string, formatTimestamp: (iso: string) => string
    ): string {

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Enhanced Report - ${executionMetadata.testRunId}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
    <style>
        :root {
            --bg-primary: #0f0f23;
            --bg-secondary: #1a1a2e;
            --bg-tertiary: #16213e;
            --bg-card: #0f3460;
            --bg-hover: #1a1a2e;
            --text-primary: #e94560;
            --text-secondary: #a8a8a8;
            --text-muted: #666;
            --accent: #e94560;
            --accent-hover: #ff6b6b;
            --success: #4ecdc4;
            --success-bg: rgba(78, 205, 196, 0.1);
            --warning: #ffd93d;
            --warning-bg: rgba(255, 217, 61, 0.1);
            --error: #ff6b6b;
            --error-bg: rgba(255, 107, 107, 0.1);
            --info: #4ea8ff;
            --info-bg: rgba(78, 168, 255, 0.1);
            --border: #2a2a4e;
            --border-light: #3a3a5e;
            --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
            --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --animation-speed: 0.3s;
        }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
        }

        @keyframes bounceIn {
            0% { opacity: 0; transform: scale(0.3); }
            50% { transform: scale(1.05); }
            70% { transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-secondary);
            line-height: 1.6;
            background-image:
                radial-gradient(circle at 25% 25%, rgba(233, 69, 96, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, rgba(78, 205, 196, 0.1) 0%, transparent 50%);
            min-height: 100vh;
        }

        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }

        .header {
            background: var(--gradient);
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 32px;
            box-shadow: var(--shadow-lg);
            animation: fadeInUp 0.6s ease-out;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="rgba(255,255,255,0.03)"/><circle cx="75" cy="75" r="1" fill="rgba(255,255,255,0.03)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.5;
        }

        .header-content {
            position: relative;
            z-index: 1;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 2.5rem;
            font-weight: 700;
            color: white;
            margin: 0;
        }

        .header .logo { font-size: 3rem; animation: bounceIn 0.8s ease-out; }
        .header .title { display: flex; flex-direction: column; gap: 4px; }
        .header .subtitle { font-size: 1rem; font-weight: 400; opacity: 0.9; }

        .header-actions { display: flex; gap: 12px; align-items: center; }

        .metric-badge {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 50px;
            padding: 8px 16px;
            font-size: 0.9rem;
            font-weight: 500;
            color: white;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideIn 0.6s ease-out 0.2s both;
        }

        .nav-menu {
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 4px;
            margin-bottom: 32px;
            box-shadow: var(--shadow);
            animation: fadeInUp 0.6s ease-out 0.3s both;
            position: sticky;
            top: 20px;
            z-index: 100;
        }

        .nav-links { display: flex; gap: 4px; }

        .nav-link {
            background: none;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            color: var(--text-secondary);
            font-weight: 500;
            cursor: pointer;
            transition: all var(--animation-speed) ease;
        }

        .nav-link:hover { color: var(--accent); background: var(--bg-hover); }
        .nav-link.active { background: var(--gradient); color: white; }

        .btn {
            background: var(--gradient);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all var(--animation-speed) ease;
            box-shadow: var(--shadow);
        }

        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4); }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
        }

        .metric-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            transition: all var(--animation-speed) ease;
            animation: fadeInUp 0.6s ease-out both;
            box-shadow: var(--shadow);
        }

        .metric-card:nth-child(1) { animation-delay: 0.1s; }
        .metric-card:nth-child(2) { animation-delay: 0.2s; }
        .metric-card:nth-child(3) { animation-delay: 0.3s; }
        .metric-card:nth-child(4) { animation-delay: 0.4s; }
        .metric-card:nth-child(5) { animation-delay: 0.5s; }
        .metric-card:nth-child(6) { animation-delay: 0.6s; }

        .metric-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-lg);
            border-color: var(--accent);
        }

        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--gradient);
        }

        .metric-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            margin-bottom: 16px;
        }

        .metric-passed .metric-icon { background: var(--success-bg); color: var(--success); }
        .metric-failed .metric-icon { background: var(--error-bg); color: var(--error); }
        .metric-pending .metric-icon { background: var(--warning-bg); color: var(--warning); }
        .metric-total .metric-icon { background: var(--info-bg); color: var(--info); }
        .metric-duration .metric-icon { background: linear-gradient(135deg, #a8edea, #fed6e3); color: #667eea; }
        .metric-rate .metric-icon { background: linear-gradient(135deg, #ffecd2, #fcb69f); color: #ff6b35; }

        .metric-title { font-size: 0.9rem; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .metric-value { font-size: 2.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
        .metric-subtitle { font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8; }

        .section { margin-bottom: 32px; animation: fadeInUp 0.6s ease-out both; }
        .section:nth-child(2) { animation-delay: 0.1s; }
        .section:nth-child(3) { animation-delay: 0.2s; }
        .section:nth-child(4) { animation-delay: 0.3s; }

        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }

        .section-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .section-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--gradient);
            color: white;
        }

        .chart-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: var(--shadow);
        }

        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .chart-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .chart-legend {
            display: flex;
            gap: 16px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: var(--bg-secondary);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: var(--shadow);
        }

        th, td {
            padding: 16px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }

        th {
            background: var(--bg-tertiary);
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        tr:hover { background: var(--bg-hover); }

        .status-badge, .severity-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
        }

        .status-passed { background: var(--success-bg); color: var(--success); }
        .status-failed { background: var(--error-bg); color: var(--error); }
        .status-pending { background: var(--warning-bg); color: var(--warning); }

        .severity-critical { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
        .severity-high { background: rgba(255, 107, 107, 0.15); color: #ff8a80; }
        .severity-medium { background: var(--warning-bg); color: var(--warning); }
        .severity-low { background: var(--info-bg); color: var(--info); }

        .execution-info {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
        }

        .execution-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }

        .execution-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .execution-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .execution-value {
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            font-family: 'Monaco', 'Menlo', monospace;
        }

        .tab-content { display: none; }
        .tab-content.active { display: block; }

        @media (max-width: 768px) {
            .container { padding: 16px; }
            .header { padding: 24px; }
            .header h1 { font-size: 2rem; }
            .summary-cards { grid-template-columns: 1fr; }
            .nav-links { flex-direction: column; }
        }
    </style>
    <style>
        :root {
            --bg-primary: #0f0f23;
            --bg-secondary: #1a1a2e;
            --bg-tertiary: #16213e;
            --bg-card: #0f3460;
            --bg-hover: #1a1a2e;
            --text-primary: #e94560;
            --text-secondary: #a8a8a8;
            --text-muted: #666;
            --accent: #e94560;
            --accent-hover: #ff6b6b;
            --success: #4ecdc4;
            --success-bg: rgba(78, 205, 196, 0.1);
            --warning: #ffd93d;
            --warning-bg: rgba(255, 217, 61, 0.1);
            --error: #ff6b6b;
            --error-bg: rgba(255, 107, 107, 0.1);
            --info: #4ea8ff;
            --info-bg: rgba(78, 168, 255, 0.1);
            --border: #2a2a4e;
            --border-light: #3a3a5e;
            --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
            --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --animation-speed: 0.3s;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateX(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes bounceIn {
            0% {
                opacity: 0;
                transform: scale(0.3);
            }
            50% {
                transform: scale(1.05);
            }
            70% {
                transform: scale(0.9);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html {
            scroll-behavior: smooth;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-secondary);
            line-height: 1.6;
            background-image:
                radial-gradient(circle at 25% 25%, rgba(233, 69, 96, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 75% 75%, rgba(78, 205, 196, 0.1) 0%, transparent 50%);
            min-height: 100vh;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: var(--gradient);
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 32px;
            box-shadow: var(--shadow-lg);
            animation: fadeInUp 0.6s ease-out;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="rgba(255,255,255,0.03)"/><circle cx="75" cy="75" r="1" fill="rgba(255,255,255,0.03)"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
            opacity: 0.5;
        }

        .header-content {
            position: relative;
            z-index: 1;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 2.5rem;
            font-weight: 700;
            color: white;
            margin: 0;
            font-size: 24px;
            color: var(--accent);
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            background: var(--gradient);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all var(--animation-speed) ease;
            box-shadow: var(--shadow);
            position: relative;
            overflow: hidden;
        }

        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.5s ease;
        }

        .btn:hover::before {
            left: 100%;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
        }

        .btn:active {
            transform: translateY(0);
        }

        .btn-secondary {
            background: var(--bg-card);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background: var(--bg-hover);
            border-color: var(--accent);
        }

        .btn-success {
            background: linear-gradient(135deg, #4ecdc4, #44a08d);
        }

        .btn-danger {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        }

        .btn:hover {
            background: var(--accent);
            border-color: var(--accent);
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-bottom: 40px;
        }

        .metric-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            position: relative;
            overflow: hidden;
            transition: all var(--animation-speed) ease;
            animation: fadeInUp 0.6s ease-out both;
            box-shadow: var(--shadow);
        }

        .metric-card:nth-child(1) { animation-delay: 0.1s; }
        .metric-card:nth-child(2) { animation-delay: 0.2s; }
        .metric-card:nth-child(3) { animation-delay: 0.3s; }
        .metric-card:nth-child(4) { animation-delay: 0.4s; }
        .metric-card:nth-child(5) { animation-delay: 0.5s; }
        .metric-card:nth-child(6) { animation-delay: 0.6s; }

        .metric-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-lg);
            border-color: var(--accent);
        }

        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--gradient);
        }

        .metric-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            margin-bottom: 16px;
        }

        .metric-passed .metric-icon {
            background: var(--success-bg);
            color: var(--success);
        }

        .metric-failed .metric-icon {
            background: var(--error-bg);
            color: var(--error);
        }

        .metric-pending .metric-icon {
            background: var(--warning-bg);
            color: var(--warning);
        }

        .metric-total .metric-icon {
            background: var(--info-bg);
            color: var(--info);
        }

        .metric-duration .metric-icon {
            background: linear-gradient(135deg, #a8edea, #fed6e3);
            color: #667eea;
        }

        .metric-rate .metric-icon {
            background: linear-gradient(135deg, #ffecd2, #fcb69f);
            color: #ff6b35;
        }

        .metric-title {
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .metric-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 4px;
        }

        .metric-subtitle {
            font-size: 0.85rem;
            color: var(--text-secondary);
            opacity: 0.8;
        }

        .metric-trend {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.8rem;
            margin-top: 8px;
        }

        .trend-up { color: var(--success); }
        .trend-down { color: var(--error); }
        .trend-neutral { color: var(--text-muted); }

        .card-subtitle {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }

        .tab {
            padding: 12px 20px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 14px;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
        }

        .tab:hover { color: var(--text-primary); }
        .tab.active {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .section {
            margin-bottom: 24px;
        }

        .section-title {
            font-size: 16px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }

        th {
            background: var(--bg-tertiary);
            font-weight: 500;
            font-size: 12px;
            text-transform: uppercase;
            color: var(--text-secondary);
        }

        tr:hover {
            background: var(--bg-tertiary);
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .status-passed { background: rgba(76, 175, 80, 0.2); color: var(--success); }
        .status-failed { background: rgba(244, 67, 54, 0.2); color: var(--error); }
        .status-pending { background: rgba(255, 152, 0, 0.2); color: var(--warning); }

        .severity-critical { color: #ff1744; }
        .severity-high { color: var(--error); }
        .severity-medium { color: var(--warning); }
        .severity-low { color: var(--info); }

        .progress-bar {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }

        .progress-fill {
            height: 100%;
            background: var(--success);
            transition: width 0.3s ease;
        }

        .ai-summary {
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));
            border: 1px solid var(--accent);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
        }

        .ai-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            color: var(--accent);
        }

        .risk-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .risk-low { background: rgba(76, 175, 80, 0.2); color: var(--success); }
        .risk-medium { background: rgba(255, 152, 0, 0.2); color: var(--warning); }
        .risk-high { background: rgba(244, 67, 54, 0.2); color: var(--error); }
        .risk-critical { background: rgba(255, 23, 68, 0.3); color: #ff1744; }

        .recommendations {
            margin-top: 12px;
        }

        .recommendations li {
            margin: 8px 0;
            padding-left: 20px;
            position: relative;
        }

        .recommendations li::before {
            content: "→";
            position: absolute;
            left: 0;
            color: var(--accent);
        }

        .empty-state {
            text-align: center;
            padding: 48px;
            color: var(--text-secondary);
        }

        .empty-state h3 {
            margin-bottom: 8px;
        }

        .collapsible {
            cursor: pointer;
        }

        .collapsible::after {
            content: " ▸";
            color: var(--text-secondary);
        }

        .collapsible.open::after {
            content: " ▾";
        }

        .collapse-content {
            display: none;
            padding: 12px;
            background: var(--bg-tertiary);
            margin-top: 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }

        .collapse-content.show {
            display: block;
        }

        @media print {
            body { background: white; color: black; }
            .btn { display: none; }
            .card { border: 1px solid #ddd; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-content">
                <h1>
                    <i class="fas fa-rocket logo"></i>
                    <div class="title">
                        <div>TestFox Enhanced Report</div>
                        <div class="subtitle">${executionMetadata.testRunId}</div>
                    </div>
            </h1>
            <div class="header-actions">
                    <div class="metric-badge">
                        <i class="fas fa-code-branch"></i>
                        ${gitInfo.available ? `${gitInfo.branch} (${gitInfo.commitShort || 'latest'})` : 'Local'}
                    </div>
                    <div class="metric-badge">
                        <i class="fas fa-clock"></i>
                        ${formatTimestamp(executionMetadata.executionStart)}
                    </div>
                    <button class="btn btn-secondary" onclick="refreshReport()">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                    <button class="btn" onclick="exportReport()">
                        <i class="fas fa-download"></i> Export HTML
                    </button>
                    <button class="btn btn-secondary" onclick="window.print()">
                        <i class="fas fa-print"></i> Print
                    </button>
                </div>
            </div>
        </header>

        <nav class="nav-menu">
            <div class="nav-links">
                <button class="nav-link active" onclick="showTab('overview')">
                    <i class="fas fa-tachometer-alt"></i> Overview
                </button>
                <button class="nav-link" onclick="showTab('execution')">
                    <i class="fas fa-play-circle"></i> Execution
                </button>
                <button class="nav-link" onclick="showTab('results')">
                    <i class="fas fa-chart-bar"></i> Results
                </button>
                <button class="nav-link" onclick="showTab('performance')">
                    <i class="fas fa-bolt"></i> Performance
                </button>
                <button class="nav-link" onclick="showTab('defects')">
                    <i class="fas fa-bug"></i> Defects
                </button>
                <button class="nav-link" onclick="showTab('insights')">
                    <i class="fas fa-brain"></i> Insights
                </button>
            </div>
        </nav>

        <div class="execution-info">
            <div class="execution-grid">
                <div class="execution-item">
                    <div class="execution-label">Test Run ID</div>
                    <div class="execution-value">${executionMetadata.testRunId}</div>
                </div>
                <div class="execution-item">
                    <div class="execution-label">Execution Time</div>
                    <div class="execution-value">${formatTimestamp(executionMetadata.executionStart)} - ${formatTimestamp(executionMetadata.executionEnd)}</div>
                </div>
                <div class="execution-item">
                    <div class="execution-label">Duration</div>
                    <div class="execution-value">${formatDuration(executionMetadata.totalDuration)}</div>
                </div>
                <div class="execution-item">
                    <div class="execution-label">Environment</div>
                    <div class="execution-value">${executionMetadata.environment.nodeVersion} on ${executionMetadata.environment.platform}</div>
                </div>
                <div class="execution-item">
                    <div class="execution-label">Git Branch</div>
                    <div class="execution-value">${gitInfo.available ? `${gitInfo.branch} (${gitInfo.commitShort || 'latest'})` : 'Not available'}</div>
                </div>
                <div class="execution-item">
                    <div class="execution-label">Project</div>
                    <div class="execution-value">${projectInfo?.name || executionMetadata.environment.workspace}</div>
                </div>
            </div>
        </div>

        <div class="summary-cards">
            <div class="metric-card metric-total">
                <div class="metric-icon">
                    <i class="fas fa-flask"></i>
                </div>
                <div class="metric-title">Total Tests</div>
                <div class="metric-value">${stats.total}</div>
                <div class="metric-subtitle">${categoryStats.length} categories executed</div>
            </div>

            <div class="metric-card metric-passed">
                <div class="metric-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="metric-title">Tests Passed</div>
                <div class="metric-value">${stats.passed + stats.manualPass}</div>
                <div class="metric-subtitle">${stats.manualPass > 0 ? `${stats.manualPass} manual passes` : 'All automated'}</div>
            </div>

            <div class="metric-card metric-failed">
                <div class="metric-icon">
                    <i class="fas fa-times-circle"></i>
                </div>
                <div class="metric-title">Tests Failed</div>
                <div class="metric-value">${stats.failed + stats.manualFail}</div>
                <div class="metric-subtitle">${failedTests.length} unique failures</div>
            </div>

            <div class="metric-card metric-rate">
                <div class="metric-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="metric-title">Pass Rate</div>
                <div class="metric-value">${passRate}%</div>
                <div class="metric-subtitle">${passRate >= 80 ? 'Excellent' : passRate >= 60 ? 'Good' : 'Needs attention'}</div>
            </div>

            <div class="metric-card metric-duration">
                <div class="metric-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="metric-title">Avg Duration</div>
                <div class="metric-value">${formatDuration(performanceMetrics.avgTime)}</div>
                <div class="metric-subtitle">per test execution</div>
            </div>

            <div class="metric-card metric-pending">
                <div class="metric-icon">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <div class="metric-title">Pending Tests</div>
                <div class="metric-value">${stats.pending}</div>
                <div class="metric-subtitle">Not yet executed</div>
            </div>
        </div>

        <!-- Overview Tab -->
        <div id="overview" class="tab-content active">
        ${aiSummary ? `
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-brain"></i>
            </div>
                        AI Analysis & Insights
                    </h2>
                </div>
                <div class="ai-summary" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                        <i class="fas fa-robot" style="font-size: 2rem; color: var(--accent);"></i>
                        <div>
                            <h3 style="margin: 0; color: var(--text-primary); font-size: 1.2rem;">TestFox AI Analysis</h3>
                            <div style="display: flex; gap: 8px; margin-top: 4px;">
                                <span class="status-badge risk-${aiSummary.riskLevel.toLowerCase()}" style="font-size: 0.8rem;">
                                    ${aiSummary.riskLevel} Risk
                                </span>
                                ${aiSummary.releaseReady ?
                                    '<span class="status-badge status-passed" style="font-size: 0.8rem;">✓ Release Ready</span>' :
                                    '<span class="status-badge status-failed" style="font-size: 0.8rem;">⚠ Not Release Ready</span>'}
                            </div>
                        </div>
                    </div>
                    <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">${aiSummary.summary}</p>
            ${aiSummary.recommendations.length > 0 ? `
                    <div style="border-top: 1px solid var(--border); padding-top: 16px;">
                        <h4 style="color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-lightbulb"></i> Recommendations
                        </h4>
                        <ul style="list-style: none; padding: 0;">
                            ${aiSummary.recommendations.map(r => `<li style="padding: 8px 0; border-bottom: 1px solid var(--border-light); color: var(--text-secondary);"><i class="fas fa-arrow-right" style="color: var(--accent); margin-right: 8px;"></i>${r}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
                </div>
        </div>
        ` : ''}

            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-chart-pie"></i>
            </div>
                        Test Distribution
                    </h2>
            </div>
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">Test Status Overview</h3>
                        <div class="chart-legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: rgba(78, 205, 196, 0.8);"></div>
                                Passed (${totalPassed})
            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: rgba(244, 67, 54, 0.8);"></div>
                                Failed (${totalFailed})
                </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: rgba(255, 152, 0, 0.8);"></div>
                                Pending (${totalPending})
                            </div>
                        </div>
                    </div>
                    <canvas id="statusChart" height="300"></canvas>
            </div>
        </div>

            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-tags"></i>
                        </div>
                        Category Breakdown
                    </h2>
                </div>
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">Tests by Category</h3>
                    </div>
                    <canvas id="categoryChart" height="400"></canvas>
                </div>
            </div>
        </div>

        <!-- Execution Tab -->
        <div id="execution" class="tab-content">
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-play-circle"></i>
                        </div>
                        Execution Details
                    </h2>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px;">
                    <div class="chart-container">
                        <h3 class="chart-title">Test Timeline</h3>
                        <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
                            <i class="fas fa-clock" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                            <p>Execution started: ${formatTimestamp(executionMetadata.executionStart)}</p>
                            <p>Execution ended: ${formatTimestamp(executionMetadata.executionEnd)}</p>
                            <p style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary); margin-top: 12px;">
                                Total Duration: ${formatDuration(executionMetadata.totalDuration)}
                            </p>
                        </div>
                    </div>

                    <div class="chart-container">
                        <h3 class="chart-title">Environment Information</h3>
                        <div style="padding: 20px;">
                            <div style="display: grid; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                                    <span style="color: var(--text-secondary);">Node.js Version</span>
                                    <span style="font-family: monospace; color: var(--text-primary);">${executionMetadata.environment.nodeVersion}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                                    <span style="color: var(--text-secondary);">Platform</span>
                                    <span style="font-family: monospace; color: var(--text-primary);">${executionMetadata.environment.platform}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                                    <span style="color: var(--text-secondary);">VS Code Version</span>
                                    <span style="font-family: monospace; color: var(--text-primary);">${executionMetadata.environment.vscodeVersion}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                    <span style="color: var(--text-secondary);">Project</span>
                                    <span style="font-family: monospace; color: var(--text-primary);">${projectInfo?.name || executionMetadata.environment.workspace}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Results Tab -->
        <div id="results" class="tab-content">
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-chart-bar"></i>
                        </div>
                        Test Results by Category
                    </h2>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Total</th>
                            <th>Passed</th>
                            <th>Failed</th>
                            <th>Pending</th>
                            <th>Success Rate</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryStats.map(cat => {
                            const successRate = cat.total > 0 ? Math.round((cat.passed / cat.total) * 100) : 0;
                            return `
                            <tr>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${cat.failed > 0 ? 'var(--error)' : cat.pending > 0 ? 'var(--warning)' : 'var(--success)'}"></div>
                                        <strong>${cat.name}</strong>
                                    </div>
                                </td>
                                <td style="color: var(--text-secondary); max-width: 200px;">${cat.description}</td>
                                <td><strong>${cat.total}</strong></td>
                                <td style="color: var(--success);"><i class="fas fa-check"></i> ${cat.passed}</td>
                                <td style="color: var(--error);"><i class="fas fa-times"></i> ${cat.failed}</td>
                                <td style="color: var(--warning);"><i class="fas fa-clock"></i> ${cat.pending}</td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div style="width: 60px; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                                            <div style="width: ${successRate}%; height: 100%; background: ${successRate >= 80 ? 'var(--success)' : successRate >= 60 ? 'var(--warning)' : 'var(--error)'}"></div>
                                        </div>
                                        ${successRate}%
                                    </div>
                                </td>
                                <td>
                                    <span class="status-badge ${cat.failed > 0 ? 'status-failed' : cat.pending > 0 ? 'status-pending' : 'status-passed'}">
                                        ${cat.failed > 0 ? 'Issues Found' : cat.pending > 0 ? 'In Progress' : 'All Passed'}
                                    </span>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Performance Tab -->
        <div id="performance" class="tab-content">
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-bolt"></i>
                        </div>
                        Performance Analysis
                    </h2>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 24px;">
                    <div class="metric-card metric-duration">
                        <div class="metric-icon">
                            <i class="fas fa-tachometer-alt"></i>
                        </div>
                        <div class="metric-title">Average Execution Time</div>
                        <div class="metric-value">${formatDuration(performanceMetrics.avgTime)}</div>
                        <div class="metric-subtitle">per test</div>
                    </div>

                    <div class="metric-card metric-passed">
                        <div class="metric-icon">
                            <i class="fas fa-fast-forward"></i>
                        </div>
                        <div class="metric-title">Fastest Test</div>
                        <div class="metric-value">${formatDuration(performanceMetrics.minTime)}</div>
                        <div class="metric-subtitle">minimum duration</div>
                    </div>

                    <div class="metric-card metric-failed">
                        <div class="metric-icon">
                            <i class="fas fa-slow-motion"></i>
                        </div>
                        <div class="metric-title">Slowest Test</div>
                        <div class="metric-value">${formatDuration(performanceMetrics.maxTime)}</div>
                        <div class="metric-subtitle">maximum duration</div>
                    </div>
                </div>

                ${performanceMetrics.slowTests && performanceMetrics.slowTests.length > 0 ? `
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">Slowest Test Executions</h3>
                    </div>
                    <canvas id="performanceChart" height="300"></canvas>
                </div>
                ` : ''}

                ${chartData.trendChart ? `
                <div class="chart-container">
                    <div class="chart-header">
                        <h3 class="chart-title">Pass Rate Trend</h3>
                    </div>
                    <canvas id="trendChart" height="300"></canvas>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- Defects Tab -->
        <div id="defects" class="tab-content">
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-bug"></i>
                        </div>
                        Failed Tests & Defects
                        ${failedTests.length > 0 ? `<span style="background: var(--error-bg); color: var(--error); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${failedTests.length} failures</span>` : ''}
                    </h2>
                </div>

                ${failedTests.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Defect ID</th>
                            <th>Test Name</th>
                            <th>Category</th>
                            <th>Severity</th>
                            <th>Duration</th>
                            <th>Error</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${failedTests.map(f => `
                            <tr>
                                <td>
                                    <strong style="color: var(--accent); font-family: monospace;">${f.defectId || 'NEW'}</strong>
                                </td>
                                <td>
                                    <div style="display: flex; flex-direction: column; gap: 4px;">
                                        <strong>${f.test.name}</strong>
                                        <small style="color: var(--text-muted);">${f.test.description || 'No description'}</small>
                                    </div>
                                </td>
                                <td>${f.test.category}</td>
                                <td>
                                    <span class="severity-badge severity-${f.severity}">
                                        ${f.severity.toUpperCase()}
                                    </span>
                                </td>
                                <td style="font-family: monospace;">${formatDuration(f.duration)}</td>
                                <td style="color: var(--error); max-width: 300px;">
                                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${f.error}">
                                        ${f.error.substring(0, 60)}${f.error.length > 60 ? '...' : ''}
                                    </div>
                                </td>
                                <td>
                                    <div style="display: flex; gap: 4px;">
                                        <button class="btn" style="padding: 6px 12px; font-size: 0.8rem;" onclick="createGitHubIssue('${f.test.id}', '${f.defectId || ''}')">
                                            <i class="fab fa-github"></i> GitHub
                                        </button>
                                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="createJiraIssue('${f.test.id}', '${f.defectId || ''}')">
                                            <i class="fas fa-ticket-alt"></i> Jira
                                        </button>
                                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="copyIssue('${f.test.id}', '${f.defectId || ''}')">
                                            <i class="fas fa-copy"></i> Copy
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : `
                <div style="text-align: center; padding: 60px; color: var(--text-secondary);">
                    <i class="fas fa-check-circle" style="font-size: 4rem; color: var(--success); margin-bottom: 24px;"></i>
                    <h3 style="color: var(--text-primary); margin-bottom: 8px;">All Tests Passed!</h3>
                    <p>No defects or failures found in this test run.</p>
                </div>
                `}
            </div>
        </div>

        <!-- Insights Tab -->
        <div id="insights" class="tab-content">
            <div class="section">
                <div class="section-header">
                    <h2 class="section-title">
                        <div class="section-icon">
                            <i class="fas fa-brain"></i>
                        </div>
                        Test Insights & Recommendations
                    </h2>
                </div>

                <div style="display: grid; gap: 24px;">
                    ${securityFindings.length > 0 ? `
                    <div class="chart-container">
                        <div class="chart-header">
                            <h3 class="chart-title" style="color: var(--error);">Security Vulnerabilities</h3>
                        </div>
                        <div style="padding: 20px;">
                            <div style="display: grid; gap: 16px;">
                                ${securityFindings.map(f => `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: var(--error-bg); border-radius: 8px; border-left: 4px solid var(--error);">
                                    <div>
                                        <h4 style="margin: 0; color: var(--text-primary);">${f.test.name}</h4>
                                        <p style="margin: 4px 0 0 0; color: var(--text-secondary);">${f.vulnerability} vulnerability detected</p>
                                    </div>
                                    <span class="severity-badge severity-${f.severity}" style="font-size: 0.8rem;">
                                        ${f.severity.toUpperCase()}
                                    </span>
                                </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="chart-container">
                        <div class="chart-header">
                            <h3 class="chart-title">Test Health Score</h3>
                        </div>
                        <div style="padding: 20px; text-align: center;">
                            <div style="position: relative; width: 120px; height: 120px; margin: 0 auto 24px;">
                                <svg width="120" height="120" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="8"/>
                                    <circle cx="60" cy="60" r="50" fill="none" stroke="${passRate >= 80 ? 'var(--success)' : passRate >= 60 ? 'var(--warning)' : 'var(--error)'}" stroke-width="8" stroke-dasharray="${passRate * 3.14}" stroke-dashoffset="0" transform="rotate(-90 60 60)"/>
                                </svg>
                                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">${passRate}%</div>
                                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Pass Rate</div>
                                </div>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px;">
                                <div style="text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--success);">${stats.passed + stats.manualPass}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Passed</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--error);">${stats.failed + stats.manualFail}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Failed</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--warning);">${stats.pending}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Pending</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="chart-container">
                        <div class="chart-header">
                            <h3 class="chart-title">Key Recommendations</h3>
                        </div>
                        <div style="padding: 20px;">
                            <div style="display: grid; gap: 16px;">
                                ${failedTests.length > 0 ? `
                                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: var(--warning-bg); border-radius: 8px;">
                                    <i class="fas fa-exclamation-triangle" style="color: var(--warning); font-size: 1.2rem; margin-top: 2px;"></i>
                                    <div>
                                        <h4 style="margin: 0 0 4px 0; color: var(--text-primary);">Address Failed Tests</h4>
                                        <p style="margin: 0; color: var(--text-secondary);">There are ${failedTests.length} test failures that need immediate attention. Review the defects tab for details.</p>
                                    </div>
                                </div>
                                ` : ''}

                                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: var(--info-bg); border-radius: 8px;">
                                    <i class="fas fa-chart-line" style="color: var(--info); font-size: 1.2rem; margin-top: 2px;"></i>
                                    <div>
                                        <h4 style="margin: 0 0 4px 0; color: var(--text-primary);">Monitor Performance</h4>
                                        <p style="margin: 0; color: var(--text-secondary);">Track execution times and optimize slow tests. Current average: ${formatDuration(performanceMetrics.avgTime)} per test.</p>
                                    </div>
                                </div>

                                <div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: var(--success-bg); border-radius: 8px;">
                                    <i class="fas fa-shield-alt" style="color: var(--success); font-size: 1.2rem; margin-top: 2px;"></i>
                                    <div>
                                        <h4 style="margin: 0 0 4px 0; color: var(--text-primary);">Security Testing</h4>
                                        <p style="margin: 0; color: var(--text-secondary);">${securityFindings.length === 0 ? 'No security vulnerabilities detected. Continue regular security testing.' : `${securityFindings.length} security issues found. Address critical vulnerabilities immediately.`}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-summary" class="tab-content active">
            <div class="section">
                <h3 class="section-title">📊 Category Breakdown</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Total</th>
                            <th>Passed</th>
                            <th>Failed</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryStats.map(cat => `
                            <tr>
                                <td>${cat.name}</td>
                                <td>${cat.total}</td>
                                <td style="color: var(--success)">${cat.passed}</td>
                                <td style="color: var(--error)">${cat.failed}</td>
                                <td>
                                    <span class="status-badge ${cat.failed > 0 ? 'status-failed' : cat.pending > 0 ? 'status-pending' : 'status-passed'}">
                                        ${cat.failed > 0 ? 'Issues Found' : cat.pending > 0 ? 'Pending' : 'All Passed'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            ${projectInfo ? `
            <div class="section">
                <h3 class="section-title">📁 Project Info</h3>
                <div class="card">
                    <p><strong>Type:</strong> ${projectInfo.type}</p>
                    ${projectInfo.framework ? `<p><strong>Framework:</strong> ${projectInfo.framework}</p>` : ''}
                    <p><strong>Language:</strong> ${projectInfo.language}</p>
                </div>
            </div>
            ` : ''}
        </div>

        <div id="tab-categories" class="tab-content">
            ${CATEGORY_GROUPS.map(group => {
                const groupCategories = categoryStats.filter(c => {
                    const catInfo = TEST_CATEGORIES.find(tc => tc.id === c.id);
                    return catInfo?.group === group.id;
                });
                
                if (groupCategories.length === 0) return '';
                
                return `
                <div class="section">
                    <h3 class="section-title">${group.name}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Passed</th>
                                <th>Failed</th>
                                <th>Pending</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupCategories.map(cat => `
                                <tr>
                                    <td>${cat.name}</td>
                                    <td style="color: var(--text-secondary)">${cat.description}</td>
                                    <td style="color: var(--success)">${cat.passed}</td>
                                    <td style="color: var(--error)">${cat.failed}</td>
                                    <td style="color: var(--warning)">${cat.pending}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                `;
            }).join('')}
        </div>

        <div id="tab-security" class="tab-content">
            <div class="section">
                <h3 class="section-title">🛡️ Security Findings</h3>
                ${securityFindings.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Severity</th>
                            <th>Test</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${securityFindings.map(f => `
                            <tr>
                                <td><span class="severity-${f.severity}">${f.severity.toUpperCase()}</span></td>
                                <td>${f.test.name}</td>
                                <td>${f.test.securityType || 'security'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : `
                <div class="empty-state">
                    <h3>✓ No Security Issues Found</h3>
                    <p>All security tests passed or are pending execution.</p>
                </div>
                `}
            </div>
        </div>

        <div id="tab-failed" class="tab-content">
            <div class="section">
                <h3 class="section-title">❌ Failed Tests ${failedTests.length > 0 ? `(${failedTests.length})` : ''}</h3>
                ${failedTests.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Defect ID</th>
                            <th>Test Name</th>
                            <th>Category</th>
                            <th>Priority</th>
                            <th>Error</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${failedTests.map(f => {
                            const defectId = f.defectId || 'N/A';
                            const severity = f.defect?.severity || (f.test.priority === 'critical' ? 'critical' : f.test.priority === 'high' ? 'high' : 'medium');
                            return `
                            <tr>
                                <td>
                                    <strong style="color: var(--accent); font-family: monospace;">${defectId}</strong>
                                </td>
                                <td>
                                    <div class="collapsible" onclick="toggleError(this)" style="cursor: pointer;">
                                        ${f.test.name}
                                    </div>
                                </td>
                                <td>${f.test.category}</td>
                                <td>
                                    <span class="severity-${severity}">${severity.toUpperCase()}</span>
                                </td>
                                <td style="color: var(--error); max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                                    ${f.error.substring(0, 80)}${f.error.length > 80 ? '...' : ''}
                                </td>
                                <td>
                                    <div style="display: flex; gap: 4px;">
                                        <button class="btn" style="padding: 4px 8px; font-size: 11px;" 
                                                onclick="createGitHubIssue('${f.test.id}', '${defectId}')" 
                                                title="Create GitHub Issue">
                                            🐙 GitHub
                                        </button>
                                        <button class="btn" style="padding: 4px 8px; font-size: 11px;" 
                                                onclick="createJiraIssue('${f.test.id}', '${defectId}')" 
                                                title="Create Jira Issue">
                                            🎯 Jira
                                        </button>
                                        <button class="btn" style="padding: 4px 8px; font-size: 11px;" 
                                                onclick="copyIssue('${f.test.id}', '${defectId}')" 
                                                title="Copy Issue Content">
                                            📋 Copy
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <tr class="error-details" style="display: none;">
                                <td colspan="6">
                                    <div class="collapse-content show" style="background: var(--bg-tertiary); padding: 16px; border-radius: 4px; margin: 8px 0;">
                                        <div style="margin-bottom: 12px;">
                                            <strong style="color: var(--accent);">Defect ID:</strong> 
                                            <code style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px;">${defectId}</code>
                                        </div>
                                        <div style="margin-bottom: 12px;">
                                            <strong>Test Description:</strong>
                                            <p style="margin-top: 4px; color: var(--text-secondary);">${f.test.description || 'No description'}</p>
                                        </div>
                                        <div style="margin-bottom: 12px;">
                                            <strong>Error Details:</strong>
                                            <pre style="background: var(--bg-secondary); padding: 12px; border-radius: 4px; overflow-x: auto; margin-top: 4px; color: var(--error);">${f.error}</pre>
                                        </div>
                                        <div style="margin-bottom: 12px;">
                                            <strong>Expected Result:</strong>
                                            <p style="margin-top: 4px; color: var(--text-secondary);">${f.test.expectedResult || 'N/A'}</p>
                                        </div>
                                        ${f.defect ? `
                                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                                            <strong>Defect Information:</strong>
                                            <ul style="margin-top: 8px; padding-left: 20px;">
                                                <li><strong>Status:</strong> ${f.defect.status}</li>
                                                <li><strong>Severity:</strong> ${f.defect.severity}</li>
                                                <li><strong>First Found:</strong> Run #${f.defect.firstFoundRun}</li>
                                                <li><strong>Last Seen:</strong> Run #${f.defect.lastSeenRun}</li>
                                            </ul>
                                        </div>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                </table>
                ` : `
                <div class="empty-state">
                    <h3>✓ No Failed Tests</h3>
                    <p>All executed tests have passed.</p>
                </div>
                `}
            </div>
        </div>

        <footer style="text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); color: var(--text-secondary);">
            <p>Generated by <strong style="color: var(--accent)">TestFox</strong> on ${new Date().toLocaleString()}</p>
            <p style="font-size: 12px; margin-top: 8px;">
                Developed by <a href="https://x.com/senthazalravi" style="color: var(--accent)">@senthazalravi</a>
            </p>
        </footer>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Chart data from server
        const chartData = ${JSON.stringify(chartData)};

        // Initialize charts when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            initializeCharts();
        });

        function showTab(tabId) {
            // Update navigation
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Find the clicked nav link
            const activeLink = Array.from(document.querySelectorAll('.nav-link')).find(link =>
                link.getAttribute('onclick')?.includes(tabId)
            );

            if (activeLink) {
                activeLink.classList.add('active');
            }

            // Show the corresponding tab content
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Re-initialize charts if switching to a tab with charts
            if (tabId === 'overview' || tabId === 'performance') {
                setTimeout(initializeCharts, 100);
            }
        }

        function initializeCharts() {
            // Status pie chart
            if (chartData.statusChart && document.getElementById('statusChart')) {
                new Chart(document.getElementById('statusChart'), {
                    type: 'doughnut',
                    data: chartData.statusChart,
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: 'var(--text-secondary)', padding: 20 }
                            }
                        },
                        animation: {
                            animateScale: true,
                            animateRotate: true,
                            duration: 1000,
                            easing: 'easeInOutQuart'
                        }
                    }
                });
            }

            // Category bar chart
            if (chartData.categoryChart && document.getElementById('categoryChart')) {
                new Chart(document.getElementById('categoryChart'), {
                    type: 'bar',
                    data: chartData.categoryChart,
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            },
                            x: {
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            }
                        },
                        animation: {
                            duration: 1500,
                            easing: 'easeInOutQuart',
                            delay: function(context) {
                                return context.dataIndex * 200;
                            }
                        }
                    }
                });
            }

            // Performance chart
            if (chartData.performanceChart && document.getElementById('performanceChart')) {
                new Chart(document.getElementById('performanceChart'), {
                    type: 'bar',
                    data: chartData.performanceChart,
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            },
                            x: {
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            }
                        },
                        animation: {
                            duration: 1200,
                            easing: 'easeInOutQuart'
                        }
                    }
                });
            }

            // Trend chart
            if (chartData.trendChart && document.getElementById('trendChart')) {
                new Chart(document.getElementById('trendChart'), {
                    type: 'line',
                    data: chartData.trendChart.passRate,
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                labels: { color: 'var(--text-secondary)' }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            },
                            x: {
                                ticks: { color: 'var(--text-secondary)' },
                                grid: { color: 'var(--border)' }
                            }
                        },
                        animation: {
                            duration: 2000,
                            easing: 'easeInOutQuart'
                        },
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        }
                    }
                });
            }
        }

        function refreshReport() {
            vscode.postMessage({ command: 'refresh' });
        }

        function exportReport() {
            vscode.postMessage({ command: 'exportHtml' });
        }

        function createGitHubIssue(testId, defectId) {
            vscode.postMessage({
                command: 'createGitHubIssue',
                testId: testId,
                defectId: defectId || ''
            });
        }

        function createJiraIssue(testId, defectId) {
            vscode.postMessage({
                command: 'createJiraIssue',
                testId: testId,
                defectId: defectId || ''
            });
        }

        function copyIssue(testId, defectId) {
            vscode.postMessage({
                command: 'copyIssue',
                testId: testId,
                defectId: defectId || ''
            });
        }

        // Add smooth scrolling and animation effects
        document.addEventListener('click', function(e) {
            const target = e.target;

            // Handle nav link clicks
            if (target.classList.contains('nav-link')) {
                e.preventDefault();
                const tabId = target.getAttribute('onclick').match(/showTab\('([^']+)'\)/)?.[1];
                if (tabId) {
                    showTab(tabId);
                }
            }
        });

        // Add loading animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Observe all sections for animation
        document.querySelectorAll('.section').forEach(section => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(30px)';
            section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(section);
        });
    </script>
</body>
</html>`;
    }

    private async exportReportAsHtml(testStore: TestStore, manualTestTracker: ManualTestTracker): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const tests = testStore.getAllTests();
        const results = testStore.getTestResults();
        const stats = testStore.getStatistics();
        const projectInfo = testStore.getProjectInfo();

        const htmlContent = this.getEnhancedHtmlContent(tests, results, stats, projectInfo, null, { executionStart: new Date().toISOString(), executionEnd: new Date().toISOString(), totalDuration: 0, averageExecutionTime: 0, environment: { nodeVersion: process.version, platform: process.platform, workspace: 'export', vscodeVersion: vscode.version }, testRunId: `export-${Date.now()}` }, { available: false }, { avgTime: 0, minTime: 0, maxTime: 0, slowTests: [] }, null);
        
        // Save to .testfox/reports directory with timestamp
        const reportsDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.testfox', 'reports');
        try {
            await vscode.workspace.fs.createDirectory(reportsDir);
        } catch (error) {
            // Directory might already exist
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `testfox-report-${timestamp}.html`;
        const filePath = vscode.Uri.joinPath(reportsDir, fileName);

        await vscode.workspace.fs.writeFile(filePath, Buffer.from(htmlContent, 'utf-8'));
        
        const action = await vscode.window.showInformationMessage(
            `Report saved to .testfox/reports/${fileName}`,
            'Open Report',
            'Show in Explorer',
            'Open Reports Folder'
        );

        if (action === 'Open Report') {
            vscode.env.openExternal(filePath);
        } else if (action === 'Show in Explorer') {
            vscode.commands.executeCommand('revealFileInOS', filePath);
        } else if (action === 'Open Reports Folder') {
            vscode.commands.executeCommand('revealFileInOS', reportsDir);
        }
    }

    public dispose() {
        ReportPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

