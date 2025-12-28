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
            }
        });

        // Listen to state changes
        this._eventEmitter.event((state) => {
            this._updateWebview(state);
        });

        // Initial update
        this._updateWebview(this._currentState);
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
    <title>Test Control Center</title>
</head>
<body>
    <div class="container">
        <div class="status-section">
            <div class="status-header">
                <span class="status-indicator" id="statusIndicator"></span>
                <span class="status-text" id="statusText">Idle</span>
                <span class="elapsed-time" id="elapsedTime">00:00</span>
            </div>
            <div class="trigger-info" id="triggerInfo"></div>
        </div>

        <div class="progress-section">
            <div class="progress-bar-container">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            <div class="progress-text" id="progressText">0%</div>
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

    <script>
        const vscode = acquireVsCodeApi();
        let currentState = {
            status: 'idle',
            elapsed: 0,
            progress: 0,
            currentTest: null,
            logs: [],
            summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
        };

        // Format elapsed time
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return \`\${String(mins).padStart(2, '0')}:\${String(secs).padStart(2, '0')}\`;
        }

        // Update UI
        function updateUI(state) {
            currentState = state;

            // Status indicator
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            const statusMap = {
                'idle': { class: 'idle', text: 'Idle', emoji: '⚪' },
                'running': { class: 'running', text: 'Running', emoji: '🟢' },
                'paused': { class: 'paused', text: 'Paused', emoji: '🟡' },
                'stopped': { class: 'stopped', text: 'Stopped', emoji: '🔴' },
                'completed': { class: 'completed', text: 'Completed', emoji: '✅' }
            };
            const status = statusMap[state.status] || statusMap.idle;
            indicator.className = \`status-indicator \${status.class}\`;
            statusText.textContent = \`\${status.emoji} \${status.text}\`;

            // Elapsed time
            document.getElementById('elapsedTime').textContent = formatTime(state.elapsed);

            // Progress bar
            const progressBar = document.getElementById('progressBar');
            progressBar.style.width = \`\${state.progress}%\`;
            document.getElementById('progressText').textContent = \`\${state.progress}%\`;

            // Current test
            const currentTestSection = document.getElementById('currentTestSection');
            const currentTest = document.getElementById('currentTest');
            if (state.currentTest) {
                currentTestSection.style.display = 'block';
                currentTest.textContent = state.currentTest;
            } else {
                currentTestSection.style.display = 'none';
            }

            // Controls
            document.getElementById('pauseBtn').disabled = state.status !== 'running';
            document.getElementById('resumeBtn').disabled = state.status !== 'paused';
            document.getElementById('stopBtn').disabled = state.status === 'idle' || state.status === 'completed';
            document.getElementById('rerunBtn').disabled = state.status === 'running';

            // Summary
            document.getElementById('totalTests').textContent = state.summary.total;
            document.getElementById('passedTests').textContent = state.summary.passed;
            document.getElementById('failedTests').textContent = state.summary.failed;
            document.getElementById('skippedTests').textContent = state.summary.skipped;

            // Logs
            const logsContainer = document.getElementById('logsContainer');
            logsContainer.innerHTML = state.logs.slice(-20).map(log => {
                const icon = log.type === 'success' ? '✔' : log.type === 'error' ? '✖' : '⚠';
                return \`<div class="log-entry \${log.type}">\${icon} \${log.message}</div>\`;
            }).join('');
            logsContainer.scrollTop = logsContainer.scrollHeight;

            // Trigger info
            const triggerInfo = document.getElementById('triggerInfo');
            if (state.trigger) {
                triggerInfo.textContent = \`📦 Trigger: \${state.trigger}\`;
                triggerInfo.style.display = 'block';
            } else {
                triggerInfo.style.display = 'none';
            }
        }

        // Button handlers
        document.getElementById('pauseBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'pause' });
        });
        document.getElementById('resumeBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'resume' });
        });
        document.getElementById('stopBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'stop' });
        });
        document.getElementById('rerunBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'rerun' });
        });

        // Listen for state updates
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateState') {
                updateUI(message.state);
            }
        });

        // Initial update
        updateUI(currentState);
    </script>
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

