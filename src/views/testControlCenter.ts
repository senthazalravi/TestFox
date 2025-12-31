import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestCase, TestResult } from '../types';

/**
 * Test Control Center - Real-time test execution monitoring and control
 * This is the "single source of truth" for what is happening right now
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
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'pause':
                    await vscode.commands.executeCommand('testfox.pauseTests');
                    break;
                case 'resume':
                    await vscode.commands.executeCommand('testfox.resumeTests');
                    break;
                case 'stop':
                    await vscode.commands.executeCommand('testfox.stopTests');
                    break;
                case 'rerun':
                    await vscode.commands.executeCommand('testfox.runAll');
                    break;
                case 'run':
                    await vscode.commands.executeCommand('testfox.runAll');
                    break;
                case 'generateReport':
                    await vscode.commands.executeCommand('testfox.generateWebReport');
                    break;
                case 'openDefects':
                    await vscode.commands.executeCommand('testfox.openDefectDashboard');
                    break;
                case 'configureAI':
                    await vscode.commands.executeCommand('testfox.configureAI');
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('testfox.openSettings');
                    break;
                case 'authenticateGitHub':
                    try {
                        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
                        if (session) {
                            webviewView.webview.postMessage({
                                command: 'gitAuthenticated',
                                profile: { authenticated: true, username: 'Loading...' }
                            });
                            // Refresh will get the actual profile
                            setTimeout(() => this._refreshGitProfile(webviewView.webview), 1000);
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage('GitHub authentication failed');
                    }
                    break;
                case 'logoutGitHub':
                    try {
                        await vscode.commands.executeCommand('testfox.logoutGitHub');
                        webviewView.webview.postMessage({ command: 'gitLoggedOut' });
                    } catch (error) {
                        vscode.window.showErrorMessage('GitHub logout failed');
                    }
                    break;
                case 'getGitProfile':
                    await this._sendGitProfile(webviewView.webview);
                    break;
                case 'getTestHistory':
                    await this._sendTestHistory(webviewView.webview);
                    break;
                case 'viewRunDetails':
                    // Could implement detailed run view
                    vscode.window.showInformationMessage('Run details view coming soon!');
                    break;
            }
        });

        // Listen to state changes
        this._eventEmitter.event((state) => {
            this._updateWebview(state);
        });

        // Initial update
        this._updateWebview(this._currentState);

        // Load initial data
        setTimeout(() => {
            this._sendGitProfile(webviewView.webview);
            this._sendTestHistory(webviewView.webview);
        }, 500);
    }

    /**
     * Send Git profile information to webview
     */
    private async _sendGitProfile(webview: vscode.Webview): Promise<void> {
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
            const username = await this._getGitUsername();

            let repoInfo = null;
            try {
                const gitExtension = vscode.extensions.getExtension('vscode.git');
                if (gitExtension && gitExtension.isActive) {
                    const git = gitExtension.exports.getAPI(1);
                    const repositories = git.repositories;

                    if (repositories.length > 0) {
                        const repo = repositories[0];
                        const remote = repo.state.remotes.find(r => r.name === 'origin');
                        if (remote && remote.fetchUrl) {
                            const match = remote.fetchUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
                            if (match) {
                                repoInfo = `${match[1]}/${match[2]}`;
                            }
                        }
                    }
                }
            } catch (error) {
                console.log('Could not get repo info');
            }

            webview.postMessage({
                command: 'gitProfile',
                profile: {
                    authenticated: !!session,
                    username: username,
                    repo: repoInfo
                }
            });
        } catch (error) {
            webview.postMessage({
                command: 'gitProfile',
                profile: { authenticated: false }
            });
        }
    }

    /**
     * Send test history to webview
     */
    private async _sendTestHistory(webview: vscode.Webview): Promise<void> {
        // This would typically come from defectTracker, but for now we'll simulate
        // In a real implementation, you'd get this from the defect tracker
        webview.postMessage({
            command: 'testHistory',
            history: [] // Will be populated when defect tracker is integrated
        });
    }

    /**
     * Refresh Git profile after authentication
     */
    private async _refreshGitProfile(webview: vscode.Webview): Promise<void> {
        await this._sendGitProfile(webview);
    }

    /**
     * Get Git username
     */
    private async _getGitUsername(): Promise<string | null> {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${(await vscode.authentication.getSession('github', ['repo'], { createIfNone: false }))?.accessToken}`,
                    'User-Agent': 'TestFox-VSCode'
                }
            });

            if (response.ok) {
                const user = await response.json();
                return user.login || null;
            }
        } catch (error) {
            console.log('Failed to get Git username:', error);
        }
        return null;
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
        // Keep only last 100 logs
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
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'testControlCenter.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'testControlCenter.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <title>TestFox Control Center</title>
    <style>
        :root {
            --bg-primary: #0f0f23;
            --bg-secondary: #1a1a2e;
            --bg-tertiary: #16213e;
            --bg-card: #0f3460;
            --text-primary: #e94560;
            --text-secondary: #a8a8a8;
            --text-muted: #666;
            --accent: #e94560;
            --accent-hover: #ff6b6b;
            --success: #4ecdc4;
            --warning: #ffd93d;
            --error: #ff6b6b;
            --info: #4ea8ff;
            --border: #2a2a4e;
            --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            --animation-speed: 0.3s;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-secondary);
            overflow-x: hidden;
        }

        .container { padding: 16px; max-width: 400px; }

        /* Header Section */
        .header-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .header-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="20" cy="80" r="1" fill="rgba(255,255,255,0.05)"/><circle cx="80" cy="20" r="1.5" fill="rgba(255,255,255,0.08)"/></svg>');
            opacity: 0.3;
        }

        .logo { font-size: 2rem; margin-bottom: 8px; }
        .title { font-size: 1.2rem; font-weight: 700; color: white; margin-bottom: 4px; }
        .subtitle { font-size: 0.9rem; opacity: 0.9; color: white; }

        /* Status Section */
        .status-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .status-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--text-muted);
        }

        .status-indicator.running { background: var(--warning); animation: pulse 2s infinite; }
        .status-indicator.success { background: var(--success); }
        .status-indicator.error { background: var(--error); }
        .status-indicator.idle { background: var(--text-muted); }

        .status-text { font-weight: 600; color: var(--text-primary); }
        .elapsed-time { font-family: monospace; font-size: 0.9rem; color: var(--text-secondary); }

        /* Quick Actions Grid */
        .quick-actions {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }

        .action-btn {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            cursor: pointer;
            transition: all var(--animation-speed) ease;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .action-btn:hover {
            transform: translateY(-2px);
            border-color: var(--accent);
            box-shadow: var(--shadow);
        }

        .action-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(233, 69, 96, 0.1), transparent);
            transition: left 0.5s ease;
        }

        .action-btn:hover::before { left: 100%; }

        .action-icon {
            font-size: 1.5rem;
            margin-bottom: 8px;
            display: block;
            color: var(--accent);
        }

        .action-label {
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-secondary);
        }

        /* Progress Section */
        .progress-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .progress-bar-container {
            height: 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, var(--success), var(--accent));
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 4px;
        }

        .progress-text {
            text-align: center;
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--text-secondary);
        }

        /* Current Test */
        .current-test-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .section-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .current-test {
            font-family: monospace;
            font-size: 0.85rem;
            color: var(--text-secondary);
            padding: 8px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            word-break: break-word;
        }

        /* Test Summary */
        .summary-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .summary-item {
            text-align: center;
            padding: 12px;
            border-radius: 8px;
            background: var(--bg-tertiary);
        }

        .summary-label {
            display: block;
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-bottom: 4px;
        }

        .summary-value {
            display: block;
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-secondary);
        }

        .summary-item.passed .summary-value { color: var(--success); }
        .summary-item.failed .summary-value { color: var(--error); }
        .summary-item.skipped .summary-value { color: var(--warning); }

        /* Control Buttons */
        .controls-section {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 16px;
        }

        .control-btn {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all var(--animation-speed) ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-weight: 500;
        }

        .control-btn:hover {
            background: var(--bg-hover);
            border-color: var(--accent);
        }

        .control-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .control-btn.primary {
            background: linear-gradient(135deg, var(--accent), var(--accent-hover));
            color: white;
            border-color: var(--accent);
        }

        /* Logs Section */
        .logs-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            max-height: 200px;
            overflow: hidden;
        }

        .logs-container {
            max-height: 160px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 0.8rem;
        }

        .log-entry {
            padding: 4px 0;
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
        }

        .log-entry:last-child { border-bottom: none; }
        .log-entry.success { color: var(--success); }
        .log-entry.error { color: var(--error); }
        .log-entry.warning { color: var(--warning); }

        /* Git Profile Section */
        .git-profile-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .git-profile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .git-profile-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .git-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: var(--accent);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .git-details {
            flex: 1;
        }

        .git-username {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.9rem;
        }

        .git-repo {
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .git-logout-btn {
            background: var(--error);
            border: none;
            border-radius: 6px;
            padding: 6px 12px;
            color: white;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all var(--animation-speed) ease;
        }

        .git-logout-btn:hover {
            background: var(--error);
            opacity: 0.8;
        }

        .git-login-prompt {
            text-align: center;
            color: var(--text-secondary);
        }

        .git-login-btn {
            background: linear-gradient(135deg, #333, #666);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px;
            width: 100%;
            cursor: pointer;
            margin-top: 8px;
            transition: all var(--animation-speed) ease;
        }

        .git-login-btn:hover {
            background: linear-gradient(135deg, #444, #777);
        }

        /* Test History Section */
        .history-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }

        .history-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .history-list {
            max-height: 120px;
            overflow-y: auto;
        }

        .history-item {
            padding: 8px;
            border-radius: 6px;
            margin-bottom: 6px;
            background: var(--bg-tertiary);
            cursor: pointer;
            transition: all var(--animation-speed) ease;
        }

        .history-item:hover {
            background: var(--bg-hover);
        }

        .history-run {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.85rem;
        }

        .history-stats {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-top: 2px;
        }

        .history-time {
            font-size: 0.7rem;
            color: var(--text-muted);
            margin-top: 2px;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .fade-in { animation: fadeIn 0.3s ease-out; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header-section">
            <div class="logo">🦊</div>
            <div class="title">TestFox Control Center</div>
            <div class="subtitle">Test Execution & Management</div>
        </div>

        <!-- Git Profile Section -->
        <div class="git-profile-section" id="gitProfileSection">
            <div class="git-profile-header">
                <div class="section-title">
                    <i class="fab fa-github"></i>
                    Git Profile
                </div>
            </div>
            <div id="gitProfileContent">
                <div class="git-login-prompt">
                    <p>Connect GitHub for issue creation and commit tracking</p>
                    <button class="git-login-btn" onclick="authenticateGitHub()">
                        <i class="fab fa-github"></i> Connect GitHub
                    </button>
                </div>
            </div>
        </div>

        <!-- Quick Actions Grid -->
        <div class="quick-actions">
            <button class="action-btn" onclick="runAllTests()">
                <i class="fas fa-play action-icon"></i>
                <div class="action-label">Run Tests</div>
            </button>

            <button class="action-btn" onclick="generateReport()">
                <i class="fas fa-chart-bar action-icon"></i>
                <div class="action-label">View Report</div>
            </button>

            <button class="action-btn" onclick="openDefects()">
                <i class="fas fa-bug action-icon"></i>
                <div class="action-label">Defects</div>
            </button>

            <button class="action-btn" onclick="showHistory()">
                <i class="fas fa-history action-icon"></i>
                <div class="action-label">History</div>
            </button>

            <button class="action-btn" onclick="configureAI()">
                <i class="fas fa-robot action-icon"></i>
                <div class="action-label">AI Config</div>
            </button>

            <button class="action-btn" onclick="openSettings()">
                <i class="fas fa-cog action-icon"></i>
                <div class="action-label">Settings</div>
            </button>
        </div>

        <!-- Status Section -->
        <div class="status-section">
            <div class="status-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="status-indicator" id="statusIndicator"></span>
                    <span class="status-text" id="statusText">Ready</span>
                </div>
                <span class="elapsed-time" id="elapsedTime">00:00</span>
            </div>
        </div>

        <!-- Progress Section -->
        <div class="progress-section">
            <div class="progress-bar-container">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            <div class="progress-text" id="progressText">0%</div>
        </div>

        <!-- Current Test -->
        <div class="current-test-section">
            <div class="section-title">
                <i class="fas fa-running"></i>
                Current Test
            </div>
            <div class="current-test" id="currentTest">No test running</div>
        </div>

        <!-- Test Summary -->
        <div class="summary-section">
            <div class="section-title">
                <i class="fas fa-chart-pie"></i>
                Test Results
            </div>
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="summary-label">Total</span>
                    <span class="summary-value" id="totalTests">0</span>
                </div>
                <div class="summary-item passed">
                    <span class="summary-label">Passed</span>
                    <span class="summary-value" id="passedTests">0</span>
                </div>
                <div class="summary-item failed">
                    <span class="summary-label">Failed</span>
                    <span class="summary-value" id="failedTests">0</span>
                </div>
                <div class="summary-item skipped">
                    <span class="summary-label">Skipped</span>
                    <span class="summary-value" id="skippedTests">0</span>
                </div>
            </div>
        </div>

        <!-- Test History -->
        <div class="history-section" id="historySection" style="display: none;">
            <div class="history-header">
                <div class="section-title">
                    <i class="fas fa-history"></i>
                    Recent Runs
                </div>
                <button class="control-btn" onclick="hideHistory()" style="padding: 6px 12px; font-size: 0.8rem;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="history-list" id="historyList">
                <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 8px;"></i>
                    <div>No test runs yet</div>
                </div>
            </div>
        </div>

        <!-- Control Buttons -->
        <div class="controls-section">
            <button class="control-btn" id="pauseBtn" disabled>
                <i class="fas fa-pause"></i> Pause
            </button>
            <button class="control-btn" id="resumeBtn" disabled>
                <i class="fas fa-play"></i> Resume
            </button>
            <button class="control-btn" id="stopBtn" disabled>
                <i class="fas fa-stop"></i> Stop
            </button>
            <button class="control-btn primary" id="rerunBtn">
                <i class="fas fa-redo"></i> Rerun
            </button>
        </div>

        <!-- Logs Section -->
        <div class="logs-section">
            <div class="section-title">
                <i class="fas fa-terminal"></i>
                Activity Logs
            </div>
            <div class="logs-container" id="logsContainer"></div>
        </div>

        <div class="current-test-section" id="currentTestSection">
            <div class="section-title">Currently Running:</div>
            <div class="current-test" id="currentTest">No test running</div>
        </div>

        <div class="controls-section">
            <button class="control-btn" id="pauseBtn" disabled>⏸ Pause</button>
            <button class="control-btn" id="resumeBtn" disabled>▶ Resume</button>
            <button class="control-btn" id="stopBtn" disabled>⏹ Stop</button>
            <button class="control-btn" id="rerunBtn">🔁 Rerun</button>
        </div>

        <div class="summary-section">
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="summary-label">Total</span>
                    <span class="summary-value" id="totalTests">0</span>
                </div>
                <div class="summary-item passed">
                    <span class="summary-label">Passed</span>
                    <span class="summary-value" id="passedTests">0</span>
                </div>
                <div class="summary-item failed">
                    <span class="summary-label">Failed</span>
                    <span class="summary-value" id="failedTests">0</span>
                </div>
                <div class="summary-item skipped">
                    <span class="summary-label">Skipped</span>
                    <span class="summary-value" id="skippedTests">0</span>
                </div>
            </div>
        </div>

        <div class="logs-section">
            <div class="section-title">Logs</div>
            <div class="logs-container" id="logsContainer"></div>
        </div>
    </div>

    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}

export interface TestRunState {
    status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
    elapsed: number; // seconds
    progress: number; // 0-100
    currentTest: string | null;
    logs: LogEntry[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    trigger?: string; // commit hash, 'manual', 'scheduled', etc.
}

export interface LogEntry {
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: Date;
}

