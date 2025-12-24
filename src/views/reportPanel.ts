import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { ManualTestTracker } from '../manual/manualTestTracker';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { TEST_CATEGORIES, CATEGORY_GROUPS, TestCase, TestResult, SecurityFinding } from '../types';

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
        manualTestTracker: ManualTestTracker
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

        ReportPanel.currentPanel = new ReportPanel(panel, extensionUri, testStore, manualTestTracker);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        testStore: TestStore,
        manualTestTracker: ManualTestTracker
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
                }
            },
            null,
            this._disposables
        );
    }

    public async updateContent(testStore: TestStore, manualTestTracker: ManualTestTracker): Promise<void> {
        const tests = testStore.getAllTests();
        const results = testStore.getTestResults();
        const projectInfo = testStore.getProjectInfo();
        const stats = testStore.getStatistics();

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
                    performanceMetrics: { avgTime: 0, slowEndpoints: [] },
                    failedTests: failedTests.map(t => t.name).slice(0, 10)
                });

                aiSummary = JSON.parse(summaryResponse);
            } catch (error) {
                console.error('Failed to generate AI summary:', error);
            }
        }

        this._panel.webview.html = this.getHtmlContent(tests, results, stats, projectInfo, aiSummary);
    }

    private getHtmlContent(
        tests: TestCase[],
        results: TestResult[],
        stats: any,
        projectInfo: any,
        aiSummary: { summary: string; recommendations: string[]; riskLevel: string; releaseReady: boolean } | null
    ): string {
        const passRate = stats.total > 0 ? Math.round((stats.passed + stats.manualPass) / stats.total * 100) : 0;
        
        // Group tests by category
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

        // Get failed tests
        const failedTests = tests.filter(t => {
            const result = results.find(r => r.testId === t.id);
            return result?.status === 'failed' || result?.status === 'manual_fail';
        }).map(t => {
            const result = results.find(r => r.testId === t.id);
            return { test: t, error: result?.error || 'Test failed' };
        });

        // Get security findings
        const securityTests = tests.filter(t => t.category === 'security');
        const securityFindings = securityTests.map(t => {
            const result = results.find(r => r.testId === t.id);
            return {
                test: t,
                status: result?.status || 'pending',
                severity: t.priority === 'critical' ? 'critical' : t.priority === 'high' ? 'high' : 'medium'
            };
        }).filter(f => f.status === 'failed');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Report</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d30;
            --text-primary: #cccccc;
            --text-secondary: #858585;
            --accent: #ff6b35;
            --success: #4caf50;
            --warning: #ff9800;
            --error: #f44336;
            --info: #2196f3;
            --border: #3c3c3c;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }

        .header h1 {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 24px;
            color: var(--accent);
        }

        .header-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--border);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .btn:hover {
            background: var(--accent);
            border-color: var(--accent);
        }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
        }

        .card-title {
            font-size: 12px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .card-value {
            font-size: 32px;
            font-weight: 600;
        }

        .card-value.success { color: var(--success); }
        .card-value.error { color: var(--error); }
        .card-value.warning { color: var(--warning); }
        .card-value.info { color: var(--info); }

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
            <h1>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="#ff6b35">
                    <path d="M5 2L9 10H6.5L5 2Z"/>
                    <path d="M19 2L17.5 10H15L19 2Z"/>
                    <ellipse cx="12" cy="13" rx="8" ry="7"/>
                </svg>
                TestFox Report
            </h1>
            <div class="header-actions">
                <button class="btn" onclick="refreshReport()">↻ Refresh</button>
                <button class="btn" onclick="exportReport()">↓ Export HTML</button>
                <button class="btn" onclick="window.print()">🖨 Print</button>
            </div>
        </header>

        ${aiSummary ? `
        <div class="ai-summary">
            <div class="ai-header">
                <span>🤖</span>
                <strong>AI Analysis</strong>
                <span class="risk-badge risk-${aiSummary.riskLevel.toLowerCase()}">${aiSummary.riskLevel} Risk</span>
                ${aiSummary.releaseReady ? '<span class="risk-badge risk-low">✓ Release Ready</span>' : '<span class="risk-badge risk-high">⚠ Not Release Ready</span>'}
            </div>
            <p>${aiSummary.summary}</p>
            ${aiSummary.recommendations.length > 0 ? `
            <div class="recommendations">
                <strong>Recommendations:</strong>
                <ul>
                    ${aiSummary.recommendations.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        </div>
        ` : ''}

        <div class="summary-cards">
            <div class="card">
                <div class="card-title">Total Tests</div>
                <div class="card-value info">${stats.total}</div>
                <div class="card-subtitle">${categoryStats.length} categories</div>
            </div>
            <div class="card">
                <div class="card-title">Passed</div>
                <div class="card-value success">${stats.passed + stats.manualPass}</div>
                <div class="card-subtitle">${stats.manualPass > 0 ? `${stats.manualPass} manual` : ''}</div>
            </div>
            <div class="card">
                <div class="card-title">Failed</div>
                <div class="card-value error">${stats.failed + stats.manualFail}</div>
                <div class="card-subtitle">${failedTests.length > 0 ? 'Action required' : ''}</div>
            </div>
            <div class="card">
                <div class="card-title">Pass Rate</div>
                <div class="card-value ${passRate >= 80 ? 'success' : passRate >= 50 ? 'warning' : 'error'}">${passRate}%</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${passRate}%"></div>
                </div>
            </div>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="showTab('summary')">Summary</button>
            <button class="tab" onclick="showTab('categories')">By Category</button>
            <button class="tab" onclick="showTab('security')">Security</button>
            <button class="tab" onclick="showTab('failed')">Failed Tests</button>
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
                <h3 class="section-title">❌ Failed Tests</h3>
                ${failedTests.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Test</th>
                            <th>Category</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${failedTests.map(f => `
                            <tr>
                                <td class="collapsible" onclick="toggleError(this)">${f.test.name}</td>
                                <td>${f.test.category}</td>
                                <td style="color: var(--error)">${f.error.substring(0, 50)}...</td>
                            </tr>
                            <tr class="error-details" style="display: none">
                                <td colspan="3">
                                    <div class="collapse-content show">
                                        <strong>Error Details:</strong>\n${f.error}\n\n<strong>Expected:</strong> ${f.test.expectedResult}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
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

        function showTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');
        }

        function refreshReport() {
            vscode.postMessage({ command: 'refresh' });
        }

        function exportReport() {
            vscode.postMessage({ command: 'exportHtml' });
        }

        function toggleError(element) {
            element.classList.toggle('open');
            const detailsRow = element.parentElement.nextElementSibling;
            detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
        }
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

        const htmlContent = this.getHtmlContent(tests, results, stats, projectInfo, null);
        
        const fileName = `testfox-report-${new Date().toISOString().split('T')[0]}.html`;
        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);

        await vscode.workspace.fs.writeFile(filePath, Buffer.from(htmlContent, 'utf-8'));
        
        const action = await vscode.window.showInformationMessage(
            `Report saved: ${fileName}`,
            'Open Report',
            'Show in Explorer'
        );

        if (action === 'Open Report') {
            vscode.env.openExternal(filePath);
        } else if (action === 'Show in Explorer') {
            vscode.commands.executeCommand('revealFileInOS', filePath);
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

