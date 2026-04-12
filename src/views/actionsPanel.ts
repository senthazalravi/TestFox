/**
 * Actions Panel - Clean sidebar webview replacing Test Control Center
 *
 * Provides quick actions for generating tests, running tests,
 * MCP integration, and AI status - all in a clean sidebar.
 */

import * as vscode from 'vscode';

export class ActionsPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testfox-actions';
    private _view?: vscode.WebviewView;
    private _aiStatus: 'connected' | 'disconnected' | 'checking' = 'checking';
    private _appStatus: 'running' | 'stopped' | 'unknown' = 'unknown';
    private _isRunning = false;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'analyzeProject':
                    await vscode.commands.executeCommand('testfox.analyze');
                    break;
                case 'generateTests':
                    await vscode.commands.executeCommand('testfox.generateTests');
                    break;
                case 'runAllTests':
                    await vscode.commands.executeCommand('testfox.runAll');
                    break;
                case 'runFullCycle':
                    await vscode.commands.executeCommand('testfox.runFullCycle');
                    break;
                case 'viewReport':
                    await vscode.commands.executeCommand('testfox.viewLatestReport');
                    break;
                case 'configureAI':
                    await vscode.commands.executeCommand('testfox.configureAI');
                    break;
                case 'mcpGenerate':
                    await vscode.commands.executeCommand(`testfox.mcp.generate${msg.type}`);
                    break;
                case 'mcpRun':
                    await vscode.commands.executeCommand(`testfox.mcp.run${msg.type}`);
                    break;
                case 'generateCategory':
                    await vscode.commands.executeCommand('testfox.generateCategory', msg.category);
                    break;
                case 'runCategory':
                    await vscode.commands.executeCommand('testfox.runCategory', msg.category);
                    break;
            }
        });
    }

    public setAIStatus(status: 'connected' | 'disconnected' | 'checking'): void {
        this._aiStatus = status;
        this._postMessage({ command: 'aiStatus', status });
    }

    public setAppStatus(status: 'running' | 'stopped' | 'unknown'): void {
        this._appStatus = status;
        this._postMessage({ command: 'appStatus', status });
    }

    public setRunning(running: boolean): void {
        this._isRunning = running;
        this._postMessage({ command: 'runningState', running });
    }

    public notifyRunComplete(summary: { total: number; passed: number; failed: number; skipped: number }): void {
        this._isRunning = false;
        this._postMessage({ command: 'runComplete', summary });
    }

    private _postMessage(msg: any): void {
        this._view?.webview.postMessage(msg);
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
        padding: 12px;
        font-size: 12px;
    }

    .section { margin-bottom: 16px; }
    .section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-descriptionForeground));
        margin-bottom: 8px;
        padding: 0 4px;
    }

    .status-bar {
        display: flex;
        gap: 12px;
        padding: 8px 10px;
        background: var(--vscode-sideBar-background);
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 11px;
    }
    .status-item { display: flex; align-items: center; gap: 4px; }
    .status-dot {
        width: 6px; height: 6px; border-radius: 50%;
    }
    .status-dot.green { background: #22c55e; }
    .status-dot.red { background: #ef4444; }
    .status-dot.yellow { background: #eab308; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 7px 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: var(--vscode-font-family);
        font-size: 12px;
        color: var(--vscode-foreground);
        background: transparent;
        text-align: left;
        transition: background 0.1s;
    }
    .action-btn:hover { background: var(--vscode-list-hoverBackground); }
    .action-btn:active { background: var(--vscode-list-activeSelectionBackground); }
    .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .action-btn .icon { width: 16px; text-align: center; font-size: 14px; flex-shrink: 0; }
    .action-btn .label { flex: 1; }
    .action-btn .badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 10px;
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
    }

    .action-btn.primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-weight: 500;
        margin-bottom: 4px;
    }
    .action-btn.primary:hover { background: var(--vscode-button-hoverBackground); }

    .divider {
        height: 1px;
        background: var(--vscode-panel-border, rgba(255,255,255,0.06));
        margin: 4px 0;
    }

    .mcp-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
    }
    .mcp-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 6px;
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: 11px;
        transition: all 0.1s;
    }
    .mcp-btn:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }
    .mcp-btn .mcp-icon { font-size: 18px; }
    .mcp-btn .mcp-name { font-weight: 500; }
    .mcp-btn .mcp-actions {
        display: flex;
        gap: 4px;
        margin-top: 4px;
    }
    .mcp-btn .mcp-action {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--vscode-badge-background);
        color: var(--vscode-badge-foreground);
        cursor: pointer;
        border: none;
        font-family: var(--vscode-font-family);
    }
    .mcp-btn .mcp-action:hover { opacity: 0.8; }

    .running-indicator {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 10px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 12px;
        color: #3b82f6;
    }
    .running-indicator.visible { display: flex; }
    .spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(59, 130, 246, 0.3);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
    <!-- Status Bar -->
    <div class="status-bar">
        <div class="status-item">
            <span class="status-dot yellow" id="ai-dot"></span>
            <span id="ai-label">AI: Checking...</span>
        </div>
        <div class="status-item">
            <span class="status-dot red" id="app-dot"></span>
            <span id="app-label">App: Unknown</span>
        </div>
    </div>

    <!-- Running Indicator -->
    <div class="running-indicator" id="running-indicator">
        <div class="spinner"></div>
        <span>Tests running in background...</span>
    </div>

    <!-- Quick Actions -->
    <div class="section">
        <div class="section-title">Quick Actions</div>
        <button class="action-btn primary" onclick="send('generateTests')">
            <span class="icon">&#9881;</span>
            <span class="label">Generate Tests</span>
        </button>
        <button class="action-btn primary" onclick="send('runAllTests')">
            <span class="icon">&#9654;</span>
            <span class="label">Run All Tests</span>
        </button>
        <button class="action-btn" onclick="send('runFullCycle')">
            <span class="icon">&#128640;</span>
            <span class="label">Full Cycle (Smoke > Functional > Regression)</span>
        </button>
        <button class="action-btn" onclick="send('viewReport')">
            <span class="icon">&#128202;</span>
            <span class="label">View Latest Report</span>
        </button>
    </div>

    <!-- Project -->
    <div class="section">
        <div class="section-title">Project</div>
        <button class="action-btn" onclick="send('analyzeProject')">
            <span class="icon">&#128269;</span>
            <span class="label">Analyze Project</span>
        </button>
        <button class="action-btn" onclick="send('configureAI')">
            <span class="icon">&#9881;</span>
            <span class="label">AI Settings</span>
        </button>
    </div>

    <!-- MCP Tools -->
    <div class="section">
        <div class="section-title">MCP Test Generation</div>
        <div class="mcp-grid">
            <div class="mcp-btn">
                <span class="mcp-icon">&#127917;</span>
                <span class="mcp-name">Playwright</span>
                <div class="mcp-actions">
                    <button class="mcp-action" onclick="mcpGen('Playwright')">Generate</button>
                    <button class="mcp-action" onclick="mcpRun('Playwright')">Run</button>
                </div>
            </div>
            <div class="mcp-btn">
                <span class="mcp-icon">&#128225;</span>
                <span class="mcp-name">Postman</span>
                <div class="mcp-actions">
                    <button class="mcp-action" onclick="mcpGen('Postman')">Generate</button>
                    <button class="mcp-action" onclick="mcpRun('Postman')">Run</button>
                </div>
            </div>
            <div class="mcp-btn">
                <span class="mcp-icon">&#128736;</span>
                <span class="mcp-name">DevTools</span>
                <div class="mcp-actions">
                    <button class="mcp-action" onclick="mcpGen('ChromeDevTools')">Generate</button>
                    <button class="mcp-action" onclick="mcpRun('ChromeDevTools')">Run</button>
                </div>
            </div>
            <div class="mcp-btn">
                <span class="mcp-icon">&#129302;</span>
                <span class="mcp-name">Puppeteer</span>
                <div class="mcp-actions">
                    <button class="mcp-action" onclick="send('mcpGenerate', {type:'Puppeteer'})">Launch</button>
                </div>
            </div>
        </div>
    </div>

<script>
    const vscode = acquireVsCodeApi();

    function send(command, data) {
        vscode.postMessage({ command, ...data });
    }

    function mcpGen(type) {
        vscode.postMessage({ command: 'mcpGenerate', type });
    }

    function mcpRun(type) {
        vscode.postMessage({ command: 'mcpRun', type });
    }

    window.addEventListener('message', e => {
        const msg = e.data;
        switch (msg.command) {
            case 'aiStatus':
                updateAIStatus(msg.status);
                break;
            case 'appStatus':
                updateAppStatus(msg.status);
                break;
            case 'runningState':
                document.getElementById('running-indicator').classList.toggle('visible', msg.running);
                break;
            case 'runComplete':
                document.getElementById('running-indicator').classList.remove('visible');
                break;
        }
    });

    function updateAIStatus(status) {
        const dot = document.getElementById('ai-dot');
        const label = document.getElementById('ai-label');
        if (status === 'connected') {
            dot.className = 'status-dot green';
            label.textContent = 'AI: Connected';
        } else if (status === 'disconnected') {
            dot.className = 'status-dot red';
            label.textContent = 'AI: Not configured';
        } else {
            dot.className = 'status-dot yellow';
            label.textContent = 'AI: Checking...';
        }
    }

    function updateAppStatus(status) {
        const dot = document.getElementById('app-dot');
        const label = document.getElementById('app-label');
        if (status === 'running') {
            dot.className = 'status-dot green';
            label.textContent = 'App: Running';
        } else if (status === 'stopped') {
            dot.className = 'status-dot red';
            label.textContent = 'App: Stopped';
        } else {
            dot.className = 'status-dot yellow';
            label.textContent = 'App: Unknown';
        }
    }
</script>
</body>
</html>`;
    }
}
