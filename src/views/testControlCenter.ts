import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestCase, TestResult, TestRunState, LogEntry } from '../types';
import { IssueTracker, IssueProvider } from '../integrations/issueTracker';

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
    readonly onDidChangeTestRunState: vscode.Event<TestRunState> = this._eventEmitter.event;

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
                this._clearElapsedTimer();
            }
        });
    }

    private _clearElapsedTimer(): void {
        if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = undefined;
            }
    }

    public dispose(): void {
        this._clearElapsedTimer();
        this._eventEmitter.dispose();
        // WebviewView doesn't have a dispose method, just clear the reference
        this._view = undefined;
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
                case 'createIssue':
                    await this._createIssue(message.error, message.testName);
                    break;
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
                case 'checkAIStatus':
                    await this._checkAIStatus();
                    break;
                case 'checkAppStatus':
                    await this._checkAppStatus();
                    break;
                case 'startApplication':
                    await vscode.commands.executeCommand('testfox.startApplication');
                    break;
                case 'ready':
                    console.log('TestFox: Webview signaled ready');
                    this._updateWebview(this._currentState);
                    break;
                // MCP Server commands
                case 'mcpPlaywright':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'playwright-mcp');
                    break;
                case 'mcpFetch':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'fetch-mcp');
                    break;
                case 'mcpChromeDevTools':
                    await vscode.commands.executeCommand('testfox.mcpRunServer', 'chrome-devtools-mcp');
                    break;
                // (Payment test commands removed - now available in Test Explorer)
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
     * Post an arbitrary message to the webview
     */
    public postMessage(message: any): void {
        this._view?.webview.postMessage(message);
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

    private async _createIssue(error: string, testName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('testfox');
        const provider = config.get<IssueProvider>('issue.provider', 'none' as IssueProvider);
        const token = config.get<string>('issue.token', '');
        const owner = config.get<string>('issue.owner', '');
        const repo = config.get<string>('issue.repo', '');

        // Validate configuration values
        if (!provider || provider === 'none') {
            vscode.window.showWarningMessage('Issue tracker not configured. Please configure it in settings.');
            return;
        }

        if (!token || token.trim().length === 0) {
            vscode.window.showWarningMessage('Issue tracker token not configured. Please configure it in settings.');
            return;
        }

        if (!owner || owner.trim().length === 0) {
            vscode.window.showWarningMessage('Issue tracker owner not configured. Please configure it in settings.');
            return;
        }

        if (!repo || repo.trim().length === 0) {
            vscode.window.showWarningMessage('Issue tracker repository not configured. Please configure it in settings.');
            return;
        }

        const labels = config.get<string>('issue.labels', 'bug, e2e, testfox')
            .split(',').map(s => s.trim()).filter(s => s.length > 0);
        const assignees = config.get<string>('issue.assignees', '')
            .split(',').map(s => s.trim()).filter(s => s.length > 0);

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creating issue...',
                cancellable: false
            }, async () => {
                const tracker = new IssueTracker(provider, token, owner, repo);
                
                // Construct payload
                const payload = {
                    title: `Test Failure: ${testName}`,
                    body: `### Test Failure: ${testName}\n\n**Error:**\n\`\`\`\n${error}\n\`\`\`\n\n**Environment:**\n- VS Code: ${vscode.version}\n- OS: ${process.platform}\n- Timestamp: ${new Date().toISOString()}`,
                    labels: labels,
                    assignees: assignees.length > 0 ? assignees : undefined
                };

                const result = await tracker.createIssue(payload);

                if (result.success && result.url) {
                    vscode.window.showInformationMessage(`Issue created successfully: ${result.url}`, 'Open Issue')
                        .then(selection => {
                            if (selection === 'Open Issue') {
                                vscode.env.openExternal(vscode.Uri.parse(result.url!));
                            }
                        });
                    
                    // Notify webview
                    this._view?.webview.postMessage({
                        command: 'issueCreated',
                        url: result.url
                    });
                } else {
                    throw new Error(result.error);
                }
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create issue: ${error.message}`);
        }
    }

    private async _checkAIStatus(): Promise<void> {
        try {
            const { getOpenRouterClient } = require('../ai/openRouterClient');
            const openRouter = getOpenRouterClient();
            const status = openRouter.getState();

            this._view?.webview.postMessage({
                command: 'updateAIStatus',
                status: status
            });
        } catch (error) {
            console.error('TestFox: Error checking AI status:', error);
            this._view?.webview.postMessage({
                command: 'updateAIStatus',
                status: 'unconfigured'
            });
        }
    }

    private async _checkAppStatus(): Promise<void> {
        try {
            // Check if application is running
            const axios = require('axios').default;
            const portsToCheck = [3000, 8080, 4200, 5000, 8000, 4000, 5173];

            let appRunning = false;
            for (const port of portsToCheck) {
                try {
                    await axios.get(`http://localhost:${port}`, { timeout: 2000 });
                    appRunning = true;
                    break;
                } catch (e) {
                    // Continue checking other ports
                }
            }

            this._view?.webview.postMessage({
                command: 'updateAppStatus',
                status: appRunning ? 'running' : 'not_found'
            });
        } catch (error) {
            console.error('TestFox: Error checking app status:', error);
            this._view?.webview.postMessage({
                command: 'updateAppStatus',
                status: 'error'
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
            display: flex;
            align-items: center;
            justify-content: space-between;
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

        .control-btn.small {
            padding: 2px 6px;
            font-size: 10px;
            margin-left: 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .status-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 4px 0;
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }

        .status-label {
            font-weight: 500;
            font-size: 12px;
            flex: 1;
        }

        .status-value {
            font-size: 11px;
            color: var(--vscode-descriptionForeground, #858585);
            flex: 1;
            text-align: right;
        }

        .status-value.ready {
            color: #89d185;
        }

        .status-value.error {
            color: #f48771;
        }

        .status-value.warning {
            color: #dcdcaa;
        }

        .status-btn {
            padding: 2px 6px;
            font-size: 10px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, white);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            margin-left: 4px;
        }

        .status-btn:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
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

        <!-- AI Enhancement Status -->
        <div class="status-item">
            <span class="status-label">🤖 AI Enhancement:</span>
            <span id="aiStatus" class="status-value">Available</span>
            <button id="enhanceWithAI" class="status-btn" onclick="sendCommand('enhanceWithAI')">Enhance</button>
            </div>

        <!-- Application Status -->
        <div class="status-item">
            <span class="status-label">🌐 App:</span>
            <span id="appStatus" class="status-value">Checking...</span>
            <button id="startApp" class="status-btn" style="display: none;" onclick="sendCommand('startApplication')">Start</button>
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
            <button class="btn" onclick="sendCommand('mcpFetch')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">📮</span>
                <span>Postman</span>
            </button>
            <button class="btn" onclick="sendCommand('mcpChromeDevTools')" style="border-color: rgba(147,51,234,0.5);">
                <span class="btn-icon">🔧</span>
                <span>DevTools</span>
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
            3 MCP Servers Available
            </div>
        </div>

    <div class="section" id="postmanResultsSection" style="display: none;">
        <div class="section-title">Postman Run Results</div>
        <div id="postmanSummary" style="font-size:12px; margin-bottom:8px; color:var(--vscode-descriptionForeground);"></div>
        <div id="postmanList" style="max-height:200px; overflow:auto; font-family:monospace; font-size:11px; background:var(--vscode-input-background); padding:8px; border-radius:6px;"></div>
    </div>

    <!-- Payment Tests moved to Test Explorer -->

    <div class="version-info">TestFox v0.6.54 - Rule-Based First</div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function sendCommand(cmd, args) {
            console.log('TestFox UI: Sending command:', cmd, args);
            vscode.postMessage({ command: cmd, ...args });
        }

        function createIssue(error, testName) {
            sendCommand('createIssue', { error, testName });
        }

        function updateAIStatus(status) {
            const aiStatusEl = document.getElementById('aiStatus');
            const enhanceBtn = document.getElementById('enhanceWithAI');

            aiStatusEl.className = 'status-value';

            switch(status) {
                case 'ready':
                    aiStatusEl.textContent = 'Ready to Enhance';
                    aiStatusEl.classList.add('ready');
                    enhanceBtn.style.display = 'inline-block';
                    enhanceBtn.textContent = 'Enhance Tests';
                    break;
                case 'unconfigured':
                    aiStatusEl.textContent = 'Setup Required';
                    aiStatusEl.classList.add('warning');
                    enhanceBtn.style.display = 'inline-block';
                    enhanceBtn.textContent = 'Setup AI';
                    break;
                case 'validating':
                    aiStatusEl.textContent = 'Validating...';
                    aiStatusEl.classList.add('warning');
                    enhanceBtn.style.display = 'none';
                    break;
                case 'invalid_key':
                    aiStatusEl.textContent = 'Invalid Key';
                    aiStatusEl.classList.add('error');
                    enhanceBtn.style.display = 'inline-block';
                    enhanceBtn.textContent = 'Fix Key';
                    break;
                default:
                    aiStatusEl.textContent = 'Available';
                    enhanceBtn.style.display = 'inline-block';
                    enhanceBtn.textContent = 'Enhance';
            }
        }

        function updateAppStatus(status) {
            const appStatusEl = document.getElementById('appStatus');
            const startBtn = document.getElementById('startApp');

            appStatusEl.className = 'status-value';

            switch(status) {
                case 'running':
                    appStatusEl.textContent = 'Running';
                    appStatusEl.classList.add('ready');
                    startBtn.style.display = 'none';
                    break;
                case 'not_found':
                    appStatusEl.textContent = 'Not Found';
                    appStatusEl.classList.add('error');
                    startBtn.style.display = 'inline-block';
                    break;
                case 'checking':
                    appStatusEl.textContent = 'Checking...';
                    appStatusEl.classList.add('warning');
                    startBtn.style.display = 'none';
                    break;
                default:
                    appStatusEl.textContent = 'Unknown';
                    startBtn.style.display = 'inline-block';
            }
        }
        
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        }
        
        function updateUI(state) {
            console.log('TestFox UI: Updating state:', state.status);

            // Update BYOK status if provided
            if (state.byokStatus !== undefined) {
                updateBYOKStatus(state.byokStatus);
            }

            // Update Application status if provided
            if (state.appStatus !== undefined) {
                updateAppStatus(state.appStatus);
            }

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
                    let content = '<span>' + log.message + '</span>';
                    if (log.type === 'error') {
                        // Create Issue button
                        const safeMessage = (log.message || '').replace(/['"\\\n\r]/g, ' ');
                        const safeTestName = (state.currentTest || 'Unknown Test').replace(/['"\\\n\r]/g, ' ');
                        content += '<button class="control-btn small" onclick="createIssue(\\'' + 
                            safeMessage + '\\', \\'' + safeTestName + '\\')">🐛 Issue</button>';
                    }
                    return '<div class="log-entry ' + log.type + '">' + content + '</div>';
            }).join('');
            logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        }
        
        // Listen for messages from extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            console.log('TestFox UI: Received message:', message.command);

            switch (message.command) {
                case 'updateState':
                    updateUI(message.state);
                    break;
                case 'postmanResults':
                    renderPostmanResults(message.report);
                    break;
            }
        });

        function renderPostmanResults(report) {
            try {
                const section = document.getElementById('postmanResultsSection');
                const summaryEl = document.getElementById('postmanSummary');
                const listEl = document.getElementById('postmanList');
                if (!section || !summaryEl || !listEl) return;

                section.style.display = 'block';
                // Basic summary if available
                const stats = report?.results?.run?.stats || report?.results?.stats || {};
                const total = stats?.requests || stats?.total || (report?.results?.run?.executions?.length || 0);
                const failed = stats?.failed || (report?.results?.run?.failures || 0) || 0;
                const passed = total - failed;

                summaryEl.textContent = 'Total: ' + total + '  Passed: ' + passed + '  Failed: ' + failed;

                // Build a simple list of executions if available
                listEl.innerHTML = '';
                const executions = report?.results?.run?.executions || report?.results?.run?.executions || [];
                if (executions.length > 0) {
                    executions.forEach((ex) => {
                        const name = ex?.item?.name || (ex?.request?.url?.raw) || 'request';
                        const status = ex?.response?.code && ex.response.code >= 200 && ex.response.code < 300 ? 'PASSED' : 'FAILED';
                        const time = ex?.response?.responseTime != null ? (ex.response.responseTime + 'ms') : '';
                        const entry = document.createElement('div');
                        entry.style.padding = '6px 4px';
                        entry.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
                        entry.textContent = status + ' - ' + name + ' ' + time;
                        listEl.appendChild(entry);
                    });
                } else {
                    listEl.textContent = 'No detailed execution data available in report.';
                }
            } catch (e) {
                console.error('Failed to render Postman results', e);
            }
        }
        
        // Initialize status checks
        function initializeStatuses() {
            console.log('TestFox UI: Initializing status checks...');
            sendCommand('checkAIStatus');
            sendCommand('checkAppStatus');
        }

        // Signal that webview is ready
        console.log('TestFox UI: Webview initialized, signaling ready');
        vscode.postMessage({ command: 'ready' });
        setTimeout(initializeStatuses, 500);
    </script>
</body>
</html>`;
    }
}
