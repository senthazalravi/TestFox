/**
 * Test Report Panel - Comprehensive, beautiful test reports
 *
 * Displays detailed test results with category breakdowns,
 * individual test details, timing information, and MCP results.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ReportData {
    id: string;
    timestamp: string;
    duration: number;
    trigger: string;
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    tests: Array<{
        testId: string;
        testName: string;
        category: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
        error?: string;
        steps?: Array<{ action: string; expected: string; result?: string }>;
    }>;
    categoryResults?: Array<{
        category: string;
        total: number;
        passed: number;
        failed: number;
    }>;
    mcpResults?: Array<{
        type: string;
        total: number;
        passed: number;
        failed: number;
    }>;
    commit?: string;
}

export class TestReportPanel {
    public static currentPanel: TestReportPanel | undefined;
    private static readonly viewType = 'testfox.testReport';
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, runId?: string, workspacePath?: string): TestReportPanel {
        const column = vscode.ViewColumn.One;

        if (TestReportPanel.currentPanel) {
            TestReportPanel.currentPanel._panel.reveal(column);
            if (runId && workspacePath) {
                TestReportPanel.currentPanel._loadReport(runId, workspacePath);
            }
            return TestReportPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            TestReportPanel.viewType,
            'TestFox - Test Report',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        TestReportPanel.currentPanel = new TestReportPanel(panel);
        if (runId && workspacePath) {
            TestReportPanel.currentPanel._loadReport(runId, workspacePath);
        }
        return TestReportPanel.currentPanel;
    }

    /**
     * Show a report from raw data (for fire-and-forget results)
     */
    public static showReport(extensionUri: vscode.Uri, data: ReportData): TestReportPanel {
        const panel = TestReportPanel.createOrShow(extensionUri);
        panel._panel.webview.html = panel._generateReportHtml(data);
        return panel;
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getLoadingHtml();
    }

    private _loadReport(runId: string, workspacePath: string): void {
        try {
            // Try to load from .testfox/runs/ directory
            const runsDir = path.join(workspacePath, '.testfox', 'runs');
            let reportData: ReportData | null = null;

            if (fs.existsSync(runsDir)) {
                const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(runsDir, file), 'utf8'));
                        if (data.id === runId) {
                            reportData = data;
                            break;
                        }
                    } catch { /* skip bad files */ }
                }
            }

            // Also try latest.json
            if (!reportData) {
                const latestPath = path.join(workspacePath, '.testfox', 'latest.json');
                if (fs.existsSync(latestPath)) {
                    const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
                    if (data.id === runId || !runId) {
                        reportData = data;
                    }
                }
            }

            if (reportData) {
                this._panel.webview.html = this._generateReportHtml(reportData);
            } else {
                this._panel.webview.html = this._getEmptyHtml();
            }
        } catch (err) {
            this._panel.webview.html = this._getErrorHtml(
                err instanceof Error ? err.message : 'Failed to load report'
            );
        }
    }

    public updateWithData(data: ReportData): void {
        this._panel.webview.html = this._generateReportHtml(data);
    }

    private _generateReportHtml(data: ReportData): string {
        const passRate = data.summary.total > 0
            ? Math.round((data.summary.passed / data.summary.total) * 100)
            : 0;
        const durationStr = this._formatDuration(data.duration || 0);
        const date = new Date(data.timestamp);
        const dateStr = date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = date.toLocaleTimeString();

        // Group tests by category
        const categoryMap = new Map<string, typeof data.tests>();
        for (const test of (data.tests || [])) {
            const cat = test.category || 'uncategorized';
            if (!categoryMap.has(cat)) { categoryMap.set(cat, []); }
            categoryMap.get(cat)!.push(test);
        }

        // Generate category cards
        const categoryCards = Array.from(categoryMap.entries()).map(([cat, tests]) => {
            const catPassed = tests.filter(t => t.status === 'passed').length;
            const catFailed = tests.filter(t => t.status === 'failed').length;
            const catSkipped = tests.filter(t => t.status === 'skipped').length;
            const catRate = tests.length > 0 ? Math.round((catPassed / tests.length) * 100) : 0;
            const catName = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            const testRows = tests.map(t => {
                const statusIcon = t.status === 'passed' ? '&#10003;' : t.status === 'failed' ? '&#10007;' : '&#8212;';
                const statusClass = t.status;
                const dur = t.duration ? `${t.duration}ms` : '-';
                const errorBlock = t.error
                    ? `<div class="error-block"><pre>${this._escapeHtml(t.error)}</pre></div>`
                    : '';
                return `
                    <tr class="${statusClass}">
                        <td><span class="status-icon ${statusClass}">${statusIcon}</span></td>
                        <td class="test-name">${this._escapeHtml(t.testName)}</td>
                        <td class="test-dur">${dur}</td>
                    </tr>
                    ${errorBlock ? `<tr><td colspan="3">${errorBlock}</td></tr>` : ''}
                `;
            }).join('');

            return `
                <div class="category-card">
                    <div class="category-header" onclick="toggleCategory(this)">
                        <div class="category-info">
                            <span class="category-name">${catName}</span>
                            <span class="category-stats">${catPassed}/${tests.length} passed</span>
                        </div>
                        <div class="category-bar">
                            <div class="bar-fill passed" style="width: ${catRate}%"></div>
                            ${catFailed > 0 ? `<div class="bar-fill failed" style="width: ${Math.round((catFailed / tests.length) * 100)}%"></div>` : ''}
                        </div>
                        <span class="expand-icon">&#9660;</span>
                    </div>
                    <div class="category-tests collapsed">
                        <table>${testRows}</table>
                    </div>
                </div>
            `;
        }).join('');

        // Failed tests summary
        const failedTests = (data.tests || []).filter(t => t.status === 'failed');
        const failedSection = failedTests.length > 0 ? `
            <div class="section">
                <h2>Failed Tests (${failedTests.length})</h2>
                ${failedTests.map(t => `
                    <div class="failed-item">
                        <div class="failed-name">${this._escapeHtml(t.testName)}</div>
                        <div class="failed-category">${t.category.replace(/_/g, ' ')}</div>
                        ${t.error ? `<pre class="failed-error">${this._escapeHtml(t.error)}</pre>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : '';

        // MCP results section
        const mcpSection = data.mcpResults?.length ? `
            <div class="section">
                <h2>MCP Server Results</h2>
                <div class="mcp-grid">
                    ${data.mcpResults.map(mcp => `
                        <div class="mcp-card">
                            <div class="mcp-type">${mcp.type.toUpperCase()}</div>
                            <div class="mcp-stats">${mcp.passed}/${mcp.total} passed</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const ringColor = passRate >= 80 ? '#22c55e' : passRate >= 50 ? '#eab308' : '#ef4444';
        const ringPercent = passRate;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Report</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 24px;
        line-height: 1.5;
    }
    .report { max-width: 900px; margin: 0 auto; }

    /* Header */
    .report-header {
        display: flex;
        align-items: center;
        gap: 32px;
        padding: 28px;
        background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 12px;
        margin-bottom: 24px;
    }
    .ring-container { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
    .ring-bg, .ring-fg {
        position: absolute; top: 0; left: 0;
        width: 100px; height: 100px;
        border-radius: 50%;
    }
    .ring-bg {
        background: conic-gradient(
            ${ringColor} 0deg,
            ${ringColor} ${ringPercent * 3.6}deg,
            var(--vscode-panel-border, rgba(255,255,255,0.1)) ${ringPercent * 3.6}deg,
            var(--vscode-panel-border, rgba(255,255,255,0.1)) 360deg
        );
    }
    .ring-inner {
        position: absolute;
        top: 10px; left: 10px;
        width: 80px; height: 80px;
        border-radius: 50%;
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    }
    .ring-value { font-size: 24px; font-weight: 700; color: ${ringColor}; }
    .ring-label { font-size: 10px; color: var(--vscode-descriptionForeground); }

    .header-info { flex: 1; }
    .header-info h1 { font-size: 20px; margin-bottom: 8px; }
    .header-meta { display: flex; flex-wrap: wrap; gap: 16px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .header-meta span { display: flex; align-items: center; gap: 4px; }

    /* Stats Grid */
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 24px;
    }
    .stat-card {
        padding: 16px;
        background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 8px;
        text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-value.total { color: var(--vscode-foreground); }
    .stat-value.passed { color: #22c55e; }
    .stat-value.failed { color: #ef4444; }
    .stat-value.skipped { color: #eab308; }
    .stat-label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }

    /* Sections */
    .section { margin-bottom: 24px; }
    .section h2 {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
    }

    /* Category Cards */
    .category-card {
        background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 8px;
        margin-bottom: 8px;
        overflow: hidden;
    }
    .category-header {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        cursor: pointer;
        gap: 12px;
        user-select: none;
    }
    .category-header:hover { background: var(--vscode-list-hoverBackground); }
    .category-info { flex: 1; display: flex; justify-content: space-between; align-items: center; }
    .category-name { font-weight: 600; font-size: 13px; }
    .category-stats { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .category-bar {
        width: 120px;
        height: 6px;
        background: var(--vscode-panel-border, rgba(255,255,255,0.1));
        border-radius: 3px;
        display: flex;
        overflow: hidden;
    }
    .bar-fill.passed { background: #22c55e; }
    .bar-fill.failed { background: #ef4444; }
    .expand-icon {
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
        transition: transform 0.2s;
    }

    /* Tests Table */
    .category-tests { padding: 0 16px 12px; }
    .category-tests.collapsed { display: none; }
    .category-tests table { width: 100%; border-collapse: collapse; }
    .category-tests tr { border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.05)); }
    .category-tests tr:last-child { border-bottom: none; }
    .category-tests td { padding: 6px 8px; font-size: 12px; }
    .test-name { flex: 1; }
    .test-dur { text-align: right; color: var(--vscode-descriptionForeground); }
    .status-icon { font-weight: bold; }
    .status-icon.passed { color: #22c55e; }
    .status-icon.failed { color: #ef4444; }
    .status-icon.skipped { color: #eab308; }

    .error-block {
        padding: 8px 12px;
        background: rgba(239, 68, 68, 0.08);
        border-left: 3px solid #ef4444;
        border-radius: 0 4px 4px 0;
        margin: 4px 0;
    }
    .error-block pre {
        font-size: 11px;
        white-space: pre-wrap;
        word-break: break-all;
        color: #ef4444;
        font-family: var(--vscode-editor-font-family, monospace);
    }

    /* Failed Tests */
    .failed-item {
        padding: 12px 16px;
        background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-left: 3px solid #ef4444;
        border-radius: 6px;
        margin-bottom: 8px;
    }
    .failed-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .failed-category { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .failed-error {
        font-size: 11px;
        padding: 8px;
        background: rgba(239, 68, 68, 0.06);
        border-radius: 4px;
        white-space: pre-wrap;
        word-break: break-all;
        color: #ef4444;
        font-family: var(--vscode-editor-font-family, monospace);
    }

    /* MCP Grid */
    .mcp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .mcp-card {
        padding: 16px;
        background: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 8px;
        text-align: center;
    }
    .mcp-type { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .mcp-stats { font-size: 12px; color: var(--vscode-descriptionForeground); }

    .footer {
        text-align: center;
        padding: 20px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        margin-top: 20px;
    }
</style>
</head>
<body>
<div class="report">
    <div class="report-header">
        <div class="ring-container">
            <div class="ring-bg"></div>
            <div class="ring-inner">
                <div class="ring-value">${passRate}%</div>
                <div class="ring-label">Pass Rate</div>
            </div>
        </div>
        <div class="header-info">
            <h1>Test Report</h1>
            <div class="header-meta">
                <span>${dateStr} at ${timeStr}</span>
                <span>Duration: ${durationStr}</span>
                <span>Trigger: ${data.trigger || 'manual'}</span>
                ${data.commit ? `<span>Commit: ${data.commit.slice(0, 8)}</span>` : ''}
            </div>
        </div>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value total">${data.summary.total}</div>
            <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value passed">${data.summary.passed}</div>
            <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value failed">${data.summary.failed}</div>
            <div class="stat-label">Failed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value skipped">${data.summary.skipped}</div>
            <div class="stat-label">Skipped</div>
        </div>
    </div>

    ${failedSection}

    ${mcpSection}

    <div class="section">
        <h2>Results by Category</h2>
        ${categoryCards || '<p style="color: var(--vscode-descriptionForeground);">No test results available.</p>'}
    </div>

    <div class="footer">
        TestFox Test Report &middot; Generated ${date.toLocaleString()}
    </div>
</div>

<script>
    function toggleCategory(header) {
        const tests = header.nextElementSibling;
        const icon = header.querySelector('.expand-icon');
        tests.classList.toggle('collapsed');
        icon.style.transform = tests.classList.contains('collapsed') ? '' : 'rotate(180deg)';
    }
</script>
</body>
</html>`;
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html><head><style>
    body { display: flex; align-items: center; justify-content: center; height: 100vh;
        font-family: var(--vscode-font-family); color: var(--vscode-descriptionForeground);
        background: var(--vscode-editor-background); }
</style></head>
<body><p>Loading report...</p></body></html>`;
    }

    private _getEmptyHtml(): string {
        return `<!DOCTYPE html>
<html><head><style>
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;
        font-family: var(--vscode-font-family); color: var(--vscode-descriptionForeground);
        background: var(--vscode-editor-background); text-align: center; }
    h2 { color: var(--vscode-foreground); margin-bottom: 8px; }
</style></head>
<body>
    <h2>No Report Available</h2>
    <p>Run some tests first, then come back to view the results.</p>
</body></html>`;
    }

    private _getErrorHtml(error: string): string {
        return `<!DOCTYPE html>
<html><head><style>
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;
        font-family: var(--vscode-font-family); color: #ef4444;
        background: var(--vscode-editor-background); text-align: center; }
</style></head>
<body>
    <h2>Error Loading Report</h2>
    <p>${error}</p>
</body></html>`;
    }

    private _formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    public dispose() {
        TestReportPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }
}
