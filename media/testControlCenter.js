// Test Control Center JavaScript
const vscode = acquireVsCodeApi();
let currentState = {
    status: 'idle',
    elapsed: 0,
    progress: 0,
    currentTest: null,
    logs: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
};
let gitProfile = null;
let testHistory = [];

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    loadGitProfile();
    loadTestHistory();
});

// Git Profile Management
async function loadGitProfile() {
    try {
        const response = await vscode.postMessage({ command: 'getGitProfile' });
        // Note: We'll handle the response in the message listener
    } catch (error) {
        console.log('Git profile not available');
    }
}

async function authenticateGitHub() {
    vscode.postMessage({ command: 'authenticateGitHub' });
}

async function logoutGitHub() {
    if (confirm('Are you sure you want to disconnect GitHub?')) {
        vscode.postMessage({ command: 'logoutGitHub' });
    }
}

// Test History Management
async function loadTestHistory() {
    try {
        vscode.postMessage({ command: 'getTestHistory' });
    } catch (error) {
        console.log('Test history not available');
    }
}

function showHistory() {
    document.getElementById('historySection').style.display = 'block';
    document.getElementById('historySection').classList.add('fade-in');
}

function hideHistory() {
    document.getElementById('historySection').style.display = 'none';
}

// Quick Actions
function runAllTests() {
    vscode.postMessage({ command: 'run' });
}

function generateReport() {
    vscode.postMessage({ command: 'generateReport' });
}

function openDefects() {
    vscode.postMessage({ command: 'openDefects' });
}

function configureAI() {
    vscode.postMessage({ command: 'configureAI' });
}

        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }

        function testAIConnection() {
            console.log('🧪 Test Control Center: testAIConnection called');
            console.log('🧪 Test Control Center: Sending testAIConnection command to extension');
            vscode.postMessage({ command: 'testAIConnection' });
        }

        function generateTestsFromControlCenter() {
            console.log('🚀 Test Control Center: generateTestsFromControlCenter called');
            console.log('🚀 Test Control Center: Sending generateTestsFromControlCenter command to extension');
            vscode.postMessage({ command: 'generateTestsFromControlCenter' });
        }

// Format elapsed time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Update Git Profile UI
function updateGitProfile(profile) {
    const gitProfileContent = document.getElementById('gitProfileContent');

    if (profile && profile.authenticated) {
        gitProfileContent.innerHTML = `
            <div class="git-profile-info">
                <div class="git-avatar">
                    <i class="fab fa-github"></i>
                </div>
                <div class="git-details">
                    <div class="git-username">${profile.username || 'GitHub User'}</div>
                    <div class="git-repo">${profile.repo || 'Connected'}</div>
                </div>
                <button class="git-logout-btn" onclick="logoutGitHub()">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        `;
    } else {
        gitProfileContent.innerHTML = `
            <div class="git-login-prompt">
                <p>Connect GitHub for issue creation and commit tracking</p>
                <button class="git-login-btn" onclick="authenticateGitHub()">
                    <i class="fab fa-github"></i> Connect GitHub
                </button>
            </div>
        `;
    }
}

// Update Test History UI
function updateTestHistory(history) {
    const historyList = document.getElementById('historyList');

    if (!history || history.length === 0) {
        historyList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 8px;"></i>
                <div>No test runs yet</div>
            </div>
        `;
        return;
    }

    historyList.innerHTML = history.slice(0, 5).map(run => `
        <div class="history-item" onclick="viewRunDetails('${run.id}')">
            <div class="history-run">Run #${run.runNumber}</div>
            <div class="history-stats">
                <span style="color: var(--success)">${run.passed}</span> ✓
                <span style="color: var(--error)">${run.failed}</span> ✗
                <span style="color: var(--warning)">${run.skipped}</span> ⊘
            </div>
            <div class="history-time">${new Date(run.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function viewRunDetails(runId) {
    vscode.postMessage({ command: 'viewRunDetails', runId: runId });
}

// Update UI
function updateUI(state) {
    currentState = state;

    // Status indicator
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const statusMap = {
        'idle': { class: 'idle', text: 'Ready', emoji: '⚪' },
        'running': { class: 'running', text: 'Running Tests', emoji: '🟢' },
        'paused': { class: 'paused', text: 'Paused', emoji: '🟡' },
        'stopped': { class: 'stopped', text: 'Stopped', emoji: '🔴' },
        'completed': { class: 'completed', text: 'Completed', emoji: '✅' }
    };
    const status = statusMap[state.status] || statusMap.idle;
    indicator.className = `status-indicator ${status.class}`;
    statusText.textContent = `${status.emoji} ${status.text}`;

    // Elapsed time
    document.getElementById('elapsedTime').textContent = formatTime(state.elapsed);

    // Progress bar
    const progressBar = document.getElementById('progressBar');
    progressBar.style.width = `${state.progress}%`;
    document.getElementById('progressText').textContent = `${state.progress}%`;

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
        return `<div class="log-entry ${log.type}">${icon} ${log.message}</div>`;
    }).join('');
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Trigger info
    const triggerInfo = document.getElementById('triggerInfo');
    if (state.trigger) {
        triggerInfo.textContent = `📦 Trigger: ${state.trigger}`;
        triggerInfo.style.display = 'block';
    } else {
        triggerInfo.style.display = 'none';
    }
}

// Enhanced message handling
window.addEventListener('message', event => {
    const message = event.data;

    console.log('📨 Test Control Center: Received message from extension');
    console.log('📨 Test Control Center: Message command:', message.command);
    console.log('📨 Test Control Center: Message data keys:', Object.keys(message).filter(k => k !== 'command'));

    switch (message.command) {
        case 'updateState':
            updateUI(message.state);
            break;
        case 'gitProfile':
            updateGitProfile(message.profile);
            break;
        case 'testHistory':
            updateTestHistory(message.history);
            break;
        case 'gitAuthenticated':
            loadGitProfile();
            break;
                case 'gitLoggedOut':
                    updateGitProfile(null);
                    break;
                case 'aiTestStatus':
                    // Show AI test status
                    showNotification(message.message, 'info');
                    break;
                case 'aiTestResult':
                    showNotification(message.message, message.success ? 'success' : 'error');
                    break;
                case 'generateTestStatus':
                    // Show test generation status
                    showNotification(message.message, 'info');
                    break;
                case 'generateTestResult':
                    showNotification(message.message, message.success ? 'success' : 'error');
                    break;
    }
});

// Control button handlers
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

// Notification system
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 300px;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease-out;
    `;

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            break;
        case 'error':
            notification.style.backgroundColor = '#f44336';
            break;
        case 'warning':
            notification.style.backgroundColor = '#FF9800';
            break;
        default:
            notification.style.backgroundColor = '#2196F3';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Add notification styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initial update
updateUI(currentState);
