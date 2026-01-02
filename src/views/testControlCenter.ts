import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestCase, TestResult } from '../types';

/**
 * Test Control Center - Real-time test execution monitoring and control
 * Clean, working implementation with proper VS Code theming
 */
export class TestControlCenterProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testfox-control-center';
    private _view?: vscode.WebviewView;
    private _currentState: TestRunState = {
        status: 'idle',
        elapsed: 0,
        progress: 0,
        currentTest: null,
        logs: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
    };
    private _eventEmitter = new vscode.EventEmitter<TestRunState>();
    private _intervalId?: NodeJS.Timeout;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _testStore: TestStore
    ) {
        console.log('TestFox: TestControlCenterProvider constructor called');
        // Start elapsed time counter when running
        this._eventEmitter.event((state) => {
            if (state.status === 'running' && !this._intervalId) {
                this._startElapsedTimer();
            } else if (state.status !== 'running' && this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = undefined;
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        console.log('TestFox: resolveWebviewView called for Test Control Center');
        
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set the HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        console.log('TestFox: Test Control Center HTML set successfully');

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('TestFox: Received message from webview:', message.command);
            
            switch (message.command) {
                case 'runTests':
                    await vscode.commands.executeCommand('testfox.runAll');
                    break;
                case 'generateTests':
                    await vscode.commands.executeCommand('testfox.generateTests');
                    break;
                case 'analyzeProject':
                    await vscode.commands.executeCommand('testfox.analyze');
                    break;
                case 'configureAI':
                    await vscode.commands.executeCommand('testfox.configureAI');
                    break;
                case 'openReport':
                    await vscode.commands.executeCommand('testfox.generateWebReport');
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('testfox.openSettings');
                    break;
                case 'pause':
                    await vscode.commands.executeCommand('testfox.pauseTests');
                    break;
                case 'resume':
                    await vscode.commands.executeCommand('testfox.resumeTests');
                    break;
                case 'stop':
                    await vscode.commands.executeCommand('testfox.stopTests');
                    break;
                case 'ready':
                    console.log('TestFox: Webview signaled ready');
                    this._updateWebview(this._currentState);
                    break;
                // MCP Server commands
                case 'mcpPlaywright':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'playwright-mcp');
                    break;
                case 'mcpPuppeteer':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'puppeteer-mcp');
                    break;
                case 'mcpFetch':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'fetch-mcp');
                    break;
                case 'mcpDatabase':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'postgres-mcp');
                    break;
                case 'mcpRunAll':
                    await vscode.commands.executeCommand('testfox.mcpRunAll');
                    break;
                case 'mcpReport':
                    await vscode.commands.executeCommand('testfox.mcpGenerateReport');
                    break;
            }
        });

        // Listen to state changes
        this._eventEmitter.event((state) => {
            this._updateWebview(state);
        });

        // Initial update after a short delay to ensure webview is ready
        setTimeout(() => {
        this._updateWebview(this._currentState);
        }, 100);
        
        console.log('TestFox: Test Control Center fully initialized');
    }

    /**
     * Update the test run state
     */
    public updateState(updates: Partial<TestRunState>): void {
        this._currentState = { ...this._currentState, ...updates };
        this._eventEmitter.fire(this._currentState);
    }

    /**
     * Add a log entry
     */
    public addLog(entry: LogEntry): void {
        this._currentState.logs.push(entry);
        if (this._currentState.logs.length > 100) {
            this._currentState.logs.shift();
        }
        this._eventEmitter.fire(this._currentState);
    }

    /**
     * Update progress
     */
    public updateProgress(completed: number, total: number, currentTest?: string): void {
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        this.updateState({
            progress,
            currentTest: currentTest || null,
            summary: {
                ...this._currentState.summary,
                total
            }
        });
    }

    /**
     * Start elapsed timer
     */
    private _startElapsedTimer(): void {
        const startTime = Date.now() - (this._currentState.elapsed * 1000);
        this._intervalId = setInterval(() => {
            this._currentState.elapsed = Math.floor((Date.now() - startTime) / 1000);
            this._eventEmitter.fire(this._currentState);
        }, 1000);
    }

    /**
     * Update webview content
     */
    private _updateWebview(state: TestRunState): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateState',
                state: state
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // No CSP for now to ensure it loads
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Control Center</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background-color: var(--vscode-sideBar-background, #252526);
            padding: 12px;
            line-height: 1.5;
        }
        
        .header {
            text-align: center;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .header-logo {
            font-size: 32px;
            margin-bottom: 4px;
        }
        
        .header-title {
            font-size: 16px;
            font-weight: 600;
            color: white;
        }
        
        .header-subtitle {
            font-size: 11px;
            color: rgba(255,255,255,0.8);
            margin-top: 4px;
        }
        
        .section {
            background: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
        }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground, #858585);
            margin-bottom: 8px;
        }
        
        .button-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }
        
        .btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 12px 8px;
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #cccccc);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
        }
        
        .btn:hover {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
            border-color: var(--vscode-focusBorder, #007fd4);
        }
        
        .btn-icon {
            font-size: 18px;
            margin-bottom: 4px;
        }
        
        .btn-primary {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, white);
            grid-column: span 2;
        }
        
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
        
        .status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #666;
        }
        
        .status-indicator.idle { background: #666; }
        .status-indicator.running { background: #4ec9b0; animation: pulse 2s infinite; }
        .status-indicator.completed { background: #89d185; }
        .status-indicator.failed { background: #f48771; }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .status-text {
            flex: 1;
            font-weight: 500;
        }
        
        .elapsed-time {
            font-family: monospace;
            color: var(--vscode-descriptionForeground, #858585);
        }
        
        .progress-bar {
            height: 6px;
            background: var(--vscode-progressBar-background, #3c3c3c);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-foreground, #0e70c0);
            transition: width 0.3s ease;
            border-radius: 3px;
        }
        
        .progress-text {
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #858585);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        }
        
        .stat-item {
            text-align: center;
            padding: 8px 4px;
            background: var(--vscode-input-background, #3c3c3c);
            border-radius: 4px;
        }
        
        .stat-value {
            font-size: 18px;
            font-weight: 600;
        }
        
        .stat-value.passed { color: #89d185; }
        .stat-value.failed { color: #f48771; }
        .stat-value.skipped { color: #dcdcaa; }
        
        .stat-label {
            font-size: 10px;
            color: var(--vscode-descriptionForeground, #858585);
            text-transform: uppercase;
        }
        
        .current-test {
            font-family: monospace;
            font-size: 11px;
            padding: 8px;
            background: var(--vscode-input-background, #3c3c3c);
            border-radius: 4px;
            word-break: break-all;
            min-height: 32px;
        }
        
        .logs-container {
            max-height: 120px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 11px;
        }
        
        .log-entry {
            padding: 2px 0;
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }
        
        .log-entry.success { color: #89d185; }
        .log-entry.error { color: #f48771; }
        .log-entry.warning { color: #dcdcaa; }
        .log-entry.info { color: var(--vscode-descriptionForeground, #858585); }
        
        .control-buttons {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
        }
        
        .control-btn {
            padding: 8px;
            font-size: 11px;
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #cccccc);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .control-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        
        .control-btn:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground, #45494e);
        }
        
        .version-info {
            text-align: center;
            font-size: 10px;
            color: var(--vscode-descriptionForeground, #666);
            margin-top: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-logo">🦊</div>
        <div class="header-title">TestFox</div>
        <div class="header-subtitle">AI-Powered Testing</div>
        </div>

    <div class="section">
        <div class="section-title">Quick Actions</div>
        <div class="button-grid">
            <button class="btn" onclick="sendCommand('analyzeProject')">
                <span class="btn-icon">🔍</span>
                <span>Analyze</span>
                    </button>
            <button class="btn" onclick="sendCommand('generateTests')">
                <span class="btn-icon">✨</span>
                <span>Generate</span>
            </button>
            <button class="btn" onclick="sendCommand('configureAI')">
                <span class="btn-icon">🤖</span>
                <span>AI Config</span>
            </button>
            <button class="btn" onclick="sendCommand('openReport')">
                <span class="btn-icon">📊</span>
                <span>Report</span>
            </button>
            <button class="btn btn-primary" onclick="sendCommand('runTests')">
                <span>▶️ Run All Tests</span>
            </button>
        </div>
        </div>

    <div class="section">
        <div class="section-title">Status</div>
        <div class="status-row">
            <div class="status-indicator" id="statusIndicator"></div>
                    <span class="status-text" id="statusText">Ready</span>
                <span class="elapsed-time" id="elapsedTime">00:00</span>
            </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
            </div>
            <div class="progress-text" id="progressText">0%</div>
        </div>

    <div class="section">
        <div class="section-title">Results</div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-value" id="totalCount">0</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-item">
                <div class="stat-value passed" id="passedCount">0</div>
                <div class="stat-label">Passed</div>
        </div>
            <div class="stat-item">
                <div class="stat-value failed" id="failedCount">0</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-item">
                <div class="stat-value skipped" id="skippedCount">0</div>
                <div class="stat-label">Skip</div>
                </div>
            </div>
        </div>

    <div class="section" id="currentTestSection" style="display: none;">
        <div class="section-title">Current Test</div>
        <div class="current-test" id="currentTest">-</div>
        </div>

    <div class="section">
        <div class="section-title">Controls</div>
        <div class="control-buttons">
            <button class="control-btn" id="pauseBtn" onclick="sendCommand('pause')" disabled>⏸ Pause</button>
            <button class="control-btn" id="resumeBtn" onclick="sendCommand('resume')" disabled>▶ Resume</button>
            <button class="control-btn" id="stopBtn" onclick="sendCommand('stop')" disabled>⏹ Stop</button>
        </div>
        </div>

    <div class="section">
        <div class="section-title">Activity Log</div>
        <div class="logs-container" id="logsContainer">
            <div class="log-entry info">Ready to run tests...</div>
        </div>
        </div>

    <div class="section" style="background: linear-gradient(135deg, rgba(147,51,234,0.1) 0%, rgba(79,70,229,0.1) 100%); border: 1px solid rgba(147,51,234,0.3);">
        <div class="section-title" style="color: #a78bfa;">🔌 QA MCP Servers</div>
        <p style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px;">
            AI-powered testing with Model Context Protocol servers
        </p>
        <div class="button-grid">
            <button class="btn" onclick="sendCommand('mcpPlaywright')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">🎭</span>
                <span>Playwright</span>
            </button>
            <button class="btn" onclick="sendCommand('mcpPuppeteer')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">🤖</span>
                <span>Puppeteer</span>
            </button>
            <button class="btn" onclick="sendCommand('mcpFetch')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">🌐</span>
                <span>API Tests</span>
            </button>
            <button class="btn" onclick="sendCommand('mcpDatabase')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">🗄️</span>
                <span>Database</span>
            </button>
            <button class="btn btn-primary" onclick="sendCommand('mcpRunAll')" style="background: linear-gradient(135deg, #9333ea 0%, #4f46e5 100%);">
                <span>🚀 Run All MCP Tests</span>
            </button>
            <button class="btn" onclick="sendCommand('mcpReport')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">📋</span>
                <span>MCP Report</span>
            </button>
        </div>
        <div id="mcpStatus" style="margin-top: 10px; font-size: 11px; color: #a78bfa;">
            6 MCP Servers Available
        </div>
    </div>

    <div class="version-info">TestFox v0.6.39</div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function sendCommand(cmd) {
            console.log('TestFox UI: Sending command:', cmd);
            vscode.postMessage({ command: cmd });
        }
        
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }
        
        function updateUI(state) {
            console.log('TestFox UI: Updating state:', state.status);

            // Status indicator
            const indicator = document.getElementById('statusIndicator');
            indicator.className = 'status-indicator ' + state.status;
            
            // Status text
            const statusMap = {
                'idle': 'Ready',
                'running': 'Running...',
                'paused': 'Paused',
                'stopped': 'Stopped',
                'completed': 'Completed'
            };
            document.getElementById('statusText').textContent = statusMap[state.status] || 'Ready';

            // Elapsed time
            document.getElementById('elapsedTime').textContent = formatTime(state.elapsed || 0);
            
            // Progress
            const progress = state.progress || 0;
            document.getElementById('progressFill').style.width = progress + '%';
            document.getElementById('progressText').textContent = progress + '%';
            
            // Stats
            document.getElementById('totalCount').textContent = state.summary?.total || 0;
            document.getElementById('passedCount').textContent = state.summary?.passed || 0;
            document.getElementById('failedCount').textContent = state.summary?.failed || 0;
            document.getElementById('skippedCount').textContent = state.summary?.skipped || 0;

            // Current test
            const currentTestSection = document.getElementById('currentTestSection');
            const currentTest = document.getElementById('currentTest');
            if (state.currentTest) {
                currentTestSection.style.display = 'block';
                currentTest.textContent = state.currentTest;
            } else {
                currentTestSection.style.display = 'none';
            }

            // Control buttons
            document.getElementById('pauseBtn').disabled = state.status !== 'running';
            document.getElementById('resumeBtn').disabled = state.status !== 'paused';
            document.getElementById('stopBtn').disabled = state.status !== 'running' && state.status !== 'paused';

            // Logs
            if (state.logs && state.logs.length > 0) {
            const logsContainer = document.getElementById('logsContainer');
                logsContainer.innerHTML = state.logs.slice(-10).map(function(log) {
                    return '<div class="log-entry ' + log.type + '">' + log.message + '</div>';
            }).join('');
            logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        }
        
        // Listen for messages from extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            console.log('TestFox UI: Received message:', message.command);

            if (message.command === 'updateState') {
                    updateUI(message.state);
            }
        });
        
        // Signal that webview is ready
        console.log('TestFox UI: Webview initialized, signaling ready');
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export interface TestRunState {
    status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
    elapsed: number;
    progress: number;
    currentTest: string | null;
    logs: LogEntry[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    trigger?: string;
}

export interface LogEntry {
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
}
