import * as vscode from 'vscode';
import { TestStore } from '../../store/testStore';
import { ManualTestTracker } from '../../manual/manualTestTracker';

/**
 * Webview panel for the TestFox Dashboard
 */
export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private testStore: TestStore,
        private manualTracker: ManualTestTracker
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                await this._handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        testStore: TestStore,
        manualTracker: ManualTestTracker
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel._update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testfoxDashboard',
            'TestFox Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build')
                ]
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, testStore, manualTracker);
    }

    public dispose(): void {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }

    private async _handleMessage(message: { command: string; [key: string]: any }): Promise<void> {
        switch (message.command) {
            case 'runAllTests':
                await vscode.commands.executeCommand('testfox.runAll');
                this._update();
                break;

            case 'runCategory':
                await vscode.commands.executeCommand('testfox.runCategory', message.category);
                this._update();
                break;

            case 'generateTests':
                await vscode.commands.executeCommand('testfox.generateTests');
                this._update();
                break;

            case 'analyzeProject':
                await vscode.commands.executeCommand('testfox.analyze');
                this._update();
                break;

            case 'exportReport':
                await vscode.commands.executeCommand('testfox.exportReport');
                break;

            case 'markManualTest':
                await this.manualTracker.markTest(
                    message.testId,
                    message.status,
                    message.notes
                );
                this.testStore.updateTestResult(message.testId, {
                    status: message.status === 'pass' ? 'manual_pass' : 
                            message.status === 'fail' ? 'manual_fail' : 'skipped',
                    notes: message.notes,
                    timestamp: new Date()
                });
                this._update();
                break;

            case 'refresh':
                this._update();
                break;
        }
    }

    private _update(): void {
        this._panel.webview.html = this._getHtmlContent();
        
        // Send data to webview
        const data = this.testStore.exportData();
        this._panel.webview.postMessage({
            command: 'updateData',
            data
        });
    }

    private _getHtmlContent(): string {
        const stats = this.testStore.getStatistics();
        const projectInfo = this.testStore.getProjectInfo();
        const tests = this.testStore.getAllTests();
        const results = this.testStore.getTestResults();

        // Calculate category data for charts
        const categoryData = Array.from(stats.byCategory.entries()).map(([cat, data]) => ({
            category: cat,
            total: data.total,
            passed: data.passed,
            failed: data.failed
        }));

        const passRate = stats.total > 0 
            ? Math.round((stats.passed + stats.manualPass) / stats.total * 100) 
            : 0;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Dashboard</title>
    <style>
        :root {
            --bg-primary: #1a1a2e;
            --bg-secondary: #16213e;
            --bg-card: #0f3460;
            --text-primary: #eaeaea;
            --text-secondary: #a0a0a0;
            --accent: #e94560;
            --accent-hover: #ff6b6b;
            --success: #00d9a0;
            --warning: #ffc107;
            --danger: #ff4757;
            --info: #3498db;
            --border-radius: 12px;
            --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 20px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .header h1 {
            font-size: 2rem;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent), var(--accent-hover));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header h1::before {
            content: "🦊";
            font-size: 2.5rem;
        }

        .project-info {
            text-align: right;
            color: var(--text-secondary);
        }

        .project-info .framework {
            font-size: 1.2rem;
            color: var(--text-primary);
            font-weight: 600;
        }

        .actions {
            display: flex;
            gap: 12px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--accent), var(--accent-hover));
            color: white;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
        }

        .btn-secondary {
            background: var(--bg-card);
            color: var(--text-primary);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .btn-secondary:hover {
            background: rgba(255,255,255,0.1);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--bg-card);
            padding: 24px;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            text-align: center;
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-4px);
        }

        .stat-card .value {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .stat-card .label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-card.passed .value { color: var(--success); }
        .stat-card.failed .value { color: var(--danger); }
        .stat-card.pending .value { color: var(--warning); }
        .stat-card.rate .value { color: var(--info); }

        .main-content {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
        }

        @media (max-width: 1200px) {
            .main-content {
                grid-template-columns: 1fr;
            }
        }

        .card {
            background: var(--bg-card);
            border-radius: var(--border-radius);
            padding: 24px;
            box-shadow: var(--shadow);
        }

        .card h2 {
            font-size: 1.2rem;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .category-list {
            list-style: none;
        }

        .category-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            margin-bottom: 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .category-item:hover {
            background: rgba(255,255,255,0.1);
            transform: translateX(4px);
        }

        .category-name {
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 500;
        }

        .category-icon {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            font-size: 1.2rem;
        }

        .category-stats {
            display: flex;
            gap: 16px;
            align-items: center;
        }

        .stat-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .stat-badge.passed { background: rgba(0, 217, 160, 0.2); color: var(--success); }
        .stat-badge.failed { background: rgba(255, 71, 87, 0.2); color: var(--danger); }

        .progress-bar {
            width: 100px;
            height: 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 3px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--success), #00ff88);
            border-radius: 3px;
            transition: width 0.5s ease;
        }

        .manual-tests {
            max-height: 400px;
            overflow-y: auto;
        }

        .manual-test-item {
            padding: 16px;
            margin-bottom: 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            border-left: 3px solid var(--warning);
        }

        .manual-test-item h4 {
            margin-bottom: 8px;
            font-size: 0.95rem;
        }

        .manual-test-item p {
            color: var(--text-secondary);
            font-size: 0.85rem;
            margin-bottom: 12px;
        }

        .manual-actions {
            display: flex;
            gap: 8px;
        }

        .btn-sm {
            padding: 6px 14px;
            font-size: 0.8rem;
        }

        .btn-pass { background: var(--success); color: white; }
        .btn-fail { background: var(--danger); color: white; }
        .btn-skip { background: var(--text-secondary); color: white; }

        .chart-container {
            height: 300px;
            display: flex;
            align-items: flex-end;
            justify-content: space-around;
            padding: 20px;
            gap: 10px;
        }

        .chart-bar-group {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        .chart-bars {
            display: flex;
            gap: 4px;
            align-items: flex-end;
            height: 200px;
        }

        .chart-bar {
            width: 24px;
            border-radius: 4px 4px 0 0;
            transition: height 0.5s ease;
            min-height: 4px;
        }

        .chart-bar.passed { background: var(--success); }
        .chart-bar.failed { background: var(--danger); }

        .chart-label {
            font-size: 0.75rem;
            color: var(--text-secondary);
            text-align: center;
            max-width: 60px;
            word-wrap: break-word;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-secondary);
        }

        .empty-state h3 {
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .empty-state p {
            margin-bottom: 24px;
        }

        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.3);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>TestFox</h1>
        <div class="project-info">
            ${projectInfo ? `
                <div class="framework">${projectInfo.framework || projectInfo.type}</div>
                <div>${projectInfo.language}</div>
            ` : '<div>No project analyzed</div>'}
        </div>
    </div>

    <div class="actions">
        <button class="btn btn-primary" onclick="analyzeProject()">
            🔍 Analyze Project
        </button>
        <button class="btn btn-primary" onclick="generateTests()">
            ⚗️ Generate Tests
        </button>
        <button class="btn btn-primary" onclick="runAllTests()">
            ▶️ Run All Tests
        </button>
        <button class="btn btn-secondary" onclick="exportReport()">
            📊 Export Report
        </button>
        <button class="btn btn-secondary" onclick="refresh()">
            🔄 Refresh
        </button>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="value">${stats.total}</div>
            <div class="label">Total Tests</div>
        </div>
        <div class="stat-card passed">
            <div class="value">${stats.passed + stats.manualPass}</div>
            <div class="label">Passed</div>
        </div>
        <div class="stat-card failed">
            <div class="value">${stats.failed + stats.manualFail}</div>
            <div class="label">Failed</div>
        </div>
        <div class="stat-card pending">
            <div class="value">${stats.pending + stats.notTested}</div>
            <div class="label">Pending</div>
        </div>
        <div class="stat-card rate">
            <div class="value">${passRate}%</div>
            <div class="label">Pass Rate</div>
        </div>
    </div>

    <div class="main-content">
        <div class="card">
            <h2>📋 Test Categories</h2>
            ${tests.length === 0 ? `
                <div class="empty-state">
                    <h3>No tests generated yet</h3>
                    <p>Click "Analyze Project" to scan your codebase, then "Generate Tests" to create test cases.</p>
                </div>
            ` : `
                <ul class="category-list">
                    ${this._renderCategories(categoryData)}
                </ul>
            `}
        </div>

        <div>
            <div class="card" style="margin-bottom: 24px;">
                <h2>📈 Results Overview</h2>
                <div class="chart-container">
                    ${this._renderChart(categoryData)}
                </div>
            </div>

            <div class="card">
                <h2>✋ Manual Tests</h2>
                <div class="manual-tests">
                    ${this._renderManualTests(tests, results)}
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function analyzeProject() {
            vscode.postMessage({ command: 'analyzeProject' });
        }

        function generateTests() {
            vscode.postMessage({ command: 'generateTests' });
        }

        function runAllTests() {
            vscode.postMessage({ command: 'runAllTests' });
        }

        function runCategory(category) {
            vscode.postMessage({ command: 'runCategory', category });
        }

        function exportReport() {
            vscode.postMessage({ command: 'exportReport' });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function markManualTest(testId, status) {
            const notes = prompt('Add notes (optional):') || '';
            vscode.postMessage({ 
                command: 'markManualTest', 
                testId, 
                status,
                notes 
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                // Data update received - could refresh UI dynamically
                console.log('Data updated:', message.data);
            }
        });
    </script>
</body>
</html>`;
    }

    private _renderCategories(categoryData: Array<{ category: string; total: number; passed: number; failed: number }>): string {
        const icons: Record<string, string> = {
            'smoke': '🔥',
            'functional': '✅',
            'api': '🌐',
            'security': '🛡️',
            'performance': '⚡',
            'load': '📊',
            'edge_cases': '⚠️',
            'monkey': '🐒',
            'feature': '📦'
        };

        const colors: Record<string, string> = {
            'smoke': '#ff6b35',
            'functional': '#00d9a0',
            'api': '#3498db',
            'security': '#9b59b6',
            'performance': '#f39c12',
            'load': '#1abc9c',
            'edge_cases': '#e74c3c',
            'monkey': '#95a5a6',
            'feature': '#2ecc71'
        };

        return categoryData.map(cat => {
            const passRate = cat.total > 0 ? Math.round(cat.passed / cat.total * 100) : 0;
            return `
                <li class="category-item" onclick="runCategory('${cat.category}')">
                    <div class="category-name">
                        <span class="category-icon" style="background: ${colors[cat.category] || '#666'}20">
                            ${icons[cat.category] || '📝'}
                        </span>
                        <span>${this._formatCategoryName(cat.category)}</span>
                    </div>
                    <div class="category-stats">
                        <span class="stat-badge passed">${cat.passed} passed</span>
                        ${cat.failed > 0 ? `<span class="stat-badge failed">${cat.failed} failed</span>` : ''}
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${passRate}%"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }

    private _renderChart(categoryData: Array<{ category: string; total: number; passed: number; failed: number }>): string {
        if (categoryData.length === 0) {
            return '<div class="empty-state"><p>No data to display</p></div>';
        }

        const maxValue = Math.max(...categoryData.map(c => Math.max(c.passed, c.failed))) || 1;

        return categoryData.map(cat => `
            <div class="chart-bar-group">
                <div class="chart-bars">
                    <div class="chart-bar passed" style="height: ${(cat.passed / maxValue) * 180}px" title="${cat.passed} passed"></div>
                    <div class="chart-bar failed" style="height: ${(cat.failed / maxValue) * 180}px" title="${cat.failed} failed"></div>
                </div>
                <span class="chart-label">${this._formatCategoryName(cat.category)}</span>
            </div>
        `).join('');
    }

    private _renderManualTests(tests: any[], results: any[]): string {
        const manualTests = tests.filter(t => t.automationLevel === 'manual');
        const resultMap = new Map(results.map(r => [r.testId, r]));

        const pendingManual = manualTests.filter(t => {
            const result = resultMap.get(t.id);
            return !result || result.status === 'not_tested' || result.status === 'pending';
        });

        if (pendingManual.length === 0) {
            return '<div class="empty-state"><p>All manual tests have been completed</p></div>';
        }

        return pendingManual.slice(0, 10).map(test => `
            <div class="manual-test-item">
                <h4>${test.name}</h4>
                <p>${test.description}</p>
                <div class="manual-actions">
                    <button class="btn btn-sm btn-pass" onclick="markManualTest('${test.id}', 'pass')">✓ Pass</button>
                    <button class="btn btn-sm btn-fail" onclick="markManualTest('${test.id}', 'fail')">✗ Fail</button>
                    <button class="btn btn-sm btn-skip" onclick="markManualTest('${test.id}', 'skip')">Skip</button>
                </div>
            </div>
        `).join('');
    }

    private _formatCategoryName(category: string): string {
        return category
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
}

