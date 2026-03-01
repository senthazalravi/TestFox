import * as vscode from 'vscode';
import { DefectTracker, Defect, TestRun } from '../tracking/defectTracker';

/**
 * Defect Dashboard Panel - Shows defects, test runs, and improvement charts
 */
export class DefectDashboard {
    public static currentPanel: DefectDashboard | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _defectTracker: DefectTracker;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, defectTracker: DefectTracker) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DefectDashboard.currentPanel) {
            DefectDashboard.currentPanel._panel.reveal(column);
            DefectDashboard.currentPanel.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'testfoxDefects',
            'TestFox Defect Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DefectDashboard.currentPanel = new DefectDashboard(panel, defectTracker);
    }

    private constructor(panel: vscode.WebviewPanel, defectTracker: DefectTracker) {
        this._panel = panel;
        this._defectTracker = defectTracker;

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        this.update();
                        break;
                    case 'openInBrowser':
                        vscode.commands.executeCommand('testfox.openBrowserDashboard');
                        break;
                    case 'clearDefects':
                        await this._defectTracker.clearAllData();
                        this.update();
                        vscode.window.showInformationMessage('TestFox: All tracking data cleared');
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public update() {
        this._panel.webview.html = this.getHtmlContent();
    }

    private getHtmlContent(): string {
        const defects = this._defectTracker.getAllDefects();
        const runs = this._defectTracker.getAllRuns();
        const stats = this._defectTracker.getDefectStats();
        const metrics = this._defectTracker.getImprovementMetrics();
        const openDefects = this._defectTracker.getOpenDefects();
        const fixedDefects = this._defectTracker.getFixedDefects();

        // Get test run stats including account information
        const latestRun = runs[runs.length - 1];
        const accountStats = latestRun ? {
            created: latestRun.testAccountsCreated?.length || 0,
            deleted: latestRun.testAccountsDeleted?.length || 0,
            creationAttempts: latestRun.accountCreationAttempts || 0,
            deletionAttempts: latestRun.accountDeletionAttempts || 0
        } : { created: 0, deleted: 0, creationAttempts: 0, deletionAttempts: 0 };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Defect Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --accent: #e94560;
            --accent-green: #3fb950;
            --accent-yellow: #d29922;
            --accent-blue: #58a6ff;
            --text-primary: #c9d1d9;
            --text-secondary: #8b949e;
            --border: #30363d;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 20px;
            line-height: 1.5;
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
            font-size: 24px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .header-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }

        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); }
        .btn-danger { background: #f85149; color: white; }

        .tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }

        .tab {
            padding: 12px 20px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--text-secondary);
            font-size: 14px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover { color: var(--text-primary); }
        .tab.active {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }

        .tab-content { display: none; }
        .tab-content.active { display: block; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }

        .stat-value {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .stat-label {
            font-size: 13px;
            color: var(--text-secondary);
        }

        .chart-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .chart-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
        }

        th {
            background: var(--bg-tertiary);
            font-weight: 600;
            color: var(--text-secondary);
            position: sticky;
            top: 0;
        }

        tr:hover { background: var(--bg-tertiary); }

        .defect-id {
            font-family: 'Consolas', monospace;
            font-weight: 600;
            color: var(--accent-blue);
        }

        .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-open { background: rgba(248, 81, 73, 0.2); color: #f85149; }
        .status-fixed { background: rgba(63, 185, 80, 0.2); color: #3fb950; }
        .status-reopen { background: rgba(210, 153, 34, 0.2); color: #d29922; }

        .severity-critical { color: #f85149; }
        .severity-high { color: #db6d28; }
        .severity-medium { color: #d29922; }
        .severity-low { color: #8b949e; }

        .section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
        }

        .run-number {
            font-family: 'Consolas', monospace;
            color: var(--accent-blue);
        }

        .charts-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        @media (max-width: 800px) {
            .charts-row { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🦊 TestFox Defect Dashboard</h1>
        <div class="header-actions">
            <button class="btn btn-info" onclick="openInBrowser()">🌐 View in Browser</button>
            <button class="btn btn-secondary" onclick="refresh()">🔄 Refresh</button>
            <button class="btn btn-danger" onclick="clearData()">🗑️ Clear Data</button>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" onclick="showTab('overview')">📊 Overview</button>
        <button class="tab" onclick="showTab('defects')">🐛 Defects (${defects.length})</button>
        <button class="tab" onclick="showTab('runs')">🏃 Test Runs (${runs.length})</button>
        <button class="tab" onclick="showTab('trends')">📈 Trends</button>
    </div>

    <!-- Overview Tab -->
    <div id="overview" class="tab-content active">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${runs.length}</div>
                <div class="stat-label">Total Runs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent)">${stats.total}</div>
                <div class="stat-label">Total Defects</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #f85149">${stats.open}</div>
                <div class="stat-label">Open Defects</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent-green)">${stats.fixed}</div>
                <div class="stat-label">Fixed Defects</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent-blue)">${accountStats.created}</div>
                <div class="stat-label">Test Accounts</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${runs.length > 0 ? runs[runs.length - 1].passRate : 0}%</div>
                <div class="stat-label">Latest Pass Rate</div>
            </div>
        </div>

        <div class="charts-row">
            <div class="chart-container">
                <div class="chart-title">📊 Defects by Severity</div>
                <canvas id="severityChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">📂 Defects by Category</div>
                <canvas id="categoryChart"></canvas>
            </div>
        </div>

        ${openDefects.length > 0 ? `
        <div class="section">
            <div class="section-title">🔴 Open Defects</div>
            <table>
                <thead>
                    <tr>
                        <th>Defect ID</th>
                        <th>Test Name</th>
                        <th>Severity</th>
                        <th>First Found</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody>
                    ${openDefects.slice(0, 10).map(d => `
                        <tr>
                            <td class="defect-id">${d.id}</td>
                            <td>${this.escapeHtml(d.testName)}</td>
                            <td><span class="severity-${d.severity}">${d.severity.toUpperCase()}</span></td>
                            <td class="run-number">Run #${d.firstFoundRun}</td>
                            <td class="run-number">Run #${d.lastSeenRun}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : '<div class="empty-state">✅ No open defects!</div>'}

        ${latestRun && latestRun.testAccountsCreated && latestRun.testAccountsCreated.length > 0 ? `
        <div class="section">
            <div class="section-title">👤 Test Accounts Created</div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${latestRun.testAccountsCreated.length}</div>
                    <div class="stat-label">Created</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${latestRun.testAccountsDeleted?.length || 0}</div>
                    <div class="stat-label">Cleaned Up</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${latestRun.accountCreationAttempts || 0}</div>
                    <div class="stat-label">Creation Attempts</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${latestRun.accountDeletionAttempts || 0}</div>
                    <div class="stat-label">Cleanup Attempts</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Account Type</th>
                        <th>Email</th>
                        <th>Test Type</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${latestRun.testAccountsCreated.map(account => `
                        <tr>
                            <td><span class="status-badge">${account.type}</span></td>
                            <td>${this.escapeHtml(account.email)}</td>
                            <td>${account.testType || 'general'}</td>
                            <td><span class="status-badge status-fixed">Created</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : '<div class="empty-state">No test accounts created in latest run</div>'}
    </div>

    <!-- Defects Tab -->
    <div id="defects" class="tab-content">
        <div class="section">
            <div class="section-title">🐛 All Defects</div>
            ${defects.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Defect ID</th>
                        <th>Test Name</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Severity</th>
                        <th>First Found</th>
                        <th>Fixed In</th>
                    </tr>
                </thead>
                <tbody>
                    ${defects.map(d => `
                        <tr>
                            <td class="defect-id">${d.id}</td>
                            <td>${this.escapeHtml(d.testName)}</td>
                            <td>${d.category}</td>
                            <td><span class="status-badge status-${d.status}">${d.status}</span></td>
                            <td><span class="severity-${d.severity}">${d.severity.toUpperCase()}</span></td>
                            <td class="run-number">Run #${d.firstFoundRun}</td>
                            <td class="run-number">${d.fixedInRun ? `Run #${d.fixedInRun}` : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<div class="empty-state">No defects recorded yet. Run tests to track defects.</div>'}
        </div>
    </div>

    <!-- Test Runs Tab -->
    <div id="runs" class="tab-content">
        <div class="section">
            <div class="section-title">🏃 Test Run History</div>
            ${runs.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>Run #</th>
                        <th>Date</th>
                        <th>Duration</th>
                        <th>Total</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Pass Rate</th>
                        <th>New Defects</th>
                        <th>Fixed</th>
                    </tr>
                </thead>
                <tbody>
                    ${runs.slice().reverse().map(r => `
                        <tr>
                            <td class="run-number">Run #${r.runNumber}</td>
                            <td>${new Date(r.timestamp).toLocaleString()}</td>
                            <td>${Math.round(r.duration / 1000)}s</td>
                            <td>${r.totalTests}</td>
                            <td style="color: var(--accent-green)">${r.passed}</td>
                            <td style="color: #f85149">${r.failed}</td>
                            <td><strong>${r.passRate}%</strong></td>
                            <td style="color: ${r.newDefects > 0 ? '#f85149' : 'inherit'}">${r.newDefects}</td>
                            <td style="color: ${r.fixedDefects > 0 ? 'var(--accent-green)' : 'inherit'}">${r.fixedDefects}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<div class="empty-state">No test runs recorded yet.</div>'}
        </div>
    </div>

    <!-- Trends Tab -->
    <div id="trends" class="tab-content">
        <div class="chart-container">
            <div class="chart-title">📈 Pass Rate Trend (Last 10 Runs)</div>
            <canvas id="passRateChart" height="100"></canvas>
        </div>
        
        <div class="charts-row">
            <div class="chart-container">
                <div class="chart-title">🐛 Open Defects Trend</div>
                <canvas id="defectTrendChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">✅ Fixed Defects per Run</div>
                <canvas id="fixedTrendChart"></canvas>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Chart data from server
        const metrics = ${JSON.stringify(metrics)};
        const stats = ${JSON.stringify(stats)};

        // Initialize charts
        document.addEventListener('DOMContentLoaded', () => {
            initCharts();
        });

        function initCharts() {
            // Severity pie chart
            if (stats.total > 0) {
                new Chart(document.getElementById('severityChart'), {
                    type: 'doughnut',
                    data: {
                        labels: ['Critical', 'High', 'Medium', 'Low'],
                        datasets: [{
                            data: [
                                stats.bySeverity.critical,
                                stats.bySeverity.high,
                                stats.bySeverity.medium,
                                stats.bySeverity.low
                            ],
                            backgroundColor: ['#f85149', '#db6d28', '#d29922', '#8b949e']
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { position: 'bottom', labels: { color: '#c9d1d9' } } }
                    }
                });

                // Category bar chart
                const categories = Object.keys(stats.byCategory);
                new Chart(document.getElementById('categoryChart'), {
                    type: 'bar',
                    data: {
                        labels: categories,
                        datasets: [{
                            label: 'Defects',
                            data: categories.map(c => stats.byCategory[c]),
                            backgroundColor: '#e94560'
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                            y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
                        }
                    }
                });
            }

            // Pass rate trend
            if (metrics.runLabels.length > 0) {
                new Chart(document.getElementById('passRateChart'), {
                    type: 'line',
                    data: {
                        labels: metrics.runLabels,
                        datasets: [{
                            label: 'Pass Rate %',
                            data: metrics.passRateTrend,
                            borderColor: '#3fb950',
                            backgroundColor: 'rgba(63, 185, 80, 0.1)',
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: { min: 0, max: 100, ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                            x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
                        },
                        plugins: { legend: { labels: { color: '#c9d1d9' } } }
                    }
                });

                // Defect trend
                new Chart(document.getElementById('defectTrendChart'), {
                    type: 'line',
                    data: {
                        labels: metrics.runLabels,
                        datasets: [{
                            label: 'Open Defects',
                            data: metrics.defectTrend,
                            borderColor: '#f85149',
                            backgroundColor: 'rgba(248, 81, 73, 0.1)',
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                            x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
                        },
                        plugins: { legend: { labels: { color: '#c9d1d9' } } }
                    }
                });

                // Fixed trend
                new Chart(document.getElementById('fixedTrendChart'), {
                    type: 'bar',
                    data: {
                        labels: metrics.runLabels,
                        datasets: [{
                            label: 'Fixed Defects',
                            data: metrics.fixedTrend,
                            backgroundColor: '#3fb950'
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
                            x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
                        },
                        plugins: { legend: { labels: { color: '#c9d1d9' } } }
                    }
                });
            }
        }

        function showTab(tabId) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelector(\`[onclick="showTab('\${tabId}')"]\`).classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openInBrowser() {
            vscode.postMessage({ command: 'openInBrowser' });
        }

        function clearData() {
            if (confirm('Are you sure you want to clear all defect tracking data?')) {
                vscode.postMessage({ command: 'clearDefects' });
            }
        }
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    public dispose() {
        DefectDashboard.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}

