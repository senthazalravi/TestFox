/**
 * Actions Panel - Sidebar webview for TestFox
 *
 * Shows: detected platform, app status with start/stop,
 * AI connection status, quick actions, MCP tools.
 */

import * as vscode from 'vscode';

export class ActionsPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'testfox-actions';
    private _view?: vscode.WebviewView;
    private _aiStatus: 'connected' | 'disconnected' | 'checking' = 'checking';
    private _appStatus: 'running' | 'stopped' | 'unknown' = 'unknown';
    private _isRunning = false;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'analyzeProject': await vscode.commands.executeCommand('testfox.analyze'); break;
                case 'generateTests': await vscode.commands.executeCommand('testfox.generateTests'); break;
                case 'runAllTests': await vscode.commands.executeCommand('testfox.runAll'); break;
                case 'runFullCycle': await vscode.commands.executeCommand('testfox.runFullCycle'); break;
                case 'viewReport': await vscode.commands.executeCommand('testfox.viewLatestReport'); break;
                case 'configureAI': await vscode.commands.executeCommand('testfox.configureAI'); break;
                case 'startApp': await vscode.commands.executeCommand('testfox.startApplications'); break;
                case 'stopApp': await vscode.commands.executeCommand('testfox.stopApp'); break;
                case 'mcpGenerate': await vscode.commands.executeCommand(`testfox.mcp.generate${msg.type}`); break;
                case 'mcpRun': await vscode.commands.executeCommand(`testfox.mcp.run${msg.type}`); break;
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

    public setProjectInfo(info: { framework?: string; language?: string; port?: number; isWebApp?: boolean }): void {
        this._postMessage({ command: 'projectInfo', ...info });
    }

    private _postMessage(msg: any): void { this._view?.webview.postMessage(msg); }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);padding:12px;font-size:12px}
.section{margin-bottom:14px}
.section-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-descriptionForeground));margin-bottom:6px;padding:0 4px}

/* Status cards */
.status-card{padding:10px;border:1px solid var(--vscode-panel-border,rgba(255,255,255,.08));border-radius:6px;margin-bottom:10px;font-size:11px}
.status-row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.status-row:last-child{margin-bottom:0}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot.green{background:#22c55e}
.dot.red{background:#ef4444}
.dot.yellow{background:#eab308;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.status-label{flex:1;color:var(--vscode-descriptionForeground)}
.status-value{font-weight:500}
.status-action{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid var(--vscode-panel-border,rgba(255,255,255,.12));background:transparent;color:var(--vscode-foreground);cursor:pointer;font-family:var(--vscode-font-family)}
.status-action:hover{background:var(--vscode-list-hoverBackground)}

/* Buttons */
.action-btn{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:none;border-radius:4px;cursor:pointer;font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground);background:transparent;text-align:left;transition:background .1s}
.action-btn:hover{background:var(--vscode-list-hoverBackground)}
.action-btn:disabled{opacity:.4;cursor:not-allowed}
.action-btn .icon{width:16px;text-align:center;font-size:14px;flex-shrink:0}
.action-btn .label{flex:1}
.action-btn.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-weight:500;margin-bottom:4px}
.action-btn.primary:hover{background:var(--vscode-button-hoverBackground)}

/* Running */
.running{display:none;align-items:center;gap:8px;padding:10px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:6px;margin-bottom:10px;font-size:12px;color:#3b82f6}
.running.vis{display:flex}
.spinner{width:14px;height:14px;border:2px solid rgba(59,130,246,.3);border-top-color:#3b82f6;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* MCP grid */
.mcp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.mcp-btn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 6px;border:1px solid var(--vscode-panel-border,rgba(255,255,255,.08));border-radius:6px;cursor:pointer;background:transparent;color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:11px;transition:all .1s}
.mcp-btn:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-focusBorder)}
.mcp-icon{font-size:16px}
.mcp-name{font-weight:500}
.mcp-actions{display:flex;gap:4px;margin-top:3px}
.mcp-action{font-size:9px;padding:2px 6px;border-radius:3px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);cursor:pointer;border:none;font-family:var(--vscode-font-family)}
.mcp-action:hover{opacity:.8}
</style></head>
<body>

<!-- Status Card -->
<div class="status-card">
  <div class="status-row">
    <span class="dot yellow" id="ai-dot"></span>
    <span class="status-label">AI</span>
    <span class="status-value" id="ai-val">Checking...</span>
    <button class="status-action" onclick="send('configureAI')">Configure</button>
  </div>
  <div class="status-row">
    <span class="dot red" id="app-dot"></span>
    <span class="status-label">App</span>
    <span class="status-value" id="app-val">Not running</span>
    <button class="status-action" id="app-btn" onclick="send('startApp')">Start</button>
  </div>
  <div class="status-row" id="project-row" style="display:none">
    <span class="dot green"></span>
    <span class="status-label">Platform</span>
    <span class="status-value" id="project-val"></span>
  </div>
</div>

<!-- Running Indicator -->
<div class="running" id="running-indicator">
  <div class="spinner"></div>
  <span>Tests running in background...</span>
</div>

<!-- Quick Actions -->
<div class="section">
  <div class="section-title">Test Actions</div>
  <button class="action-btn primary" onclick="send('generateTests')">
    <span class="icon">&#9881;</span><span class="label">Generate Tests</span>
  </button>
  <button class="action-btn primary" onclick="send('runAllTests')">
    <span class="icon">&#9654;</span><span class="label">Run All Tests</span>
  </button>
  <button class="action-btn" onclick="send('runFullCycle')">
    <span class="icon">&#128640;</span><span class="label">Full Cycle (Smoke &gt; Functional &gt; Regression)</span>
  </button>
  <button class="action-btn" onclick="send('viewReport')">
    <span class="icon">&#128202;</span><span class="label">View Latest Report</span>
  </button>
</div>

<!-- Project -->
<div class="section">
  <div class="section-title">Project</div>
  <button class="action-btn" onclick="send('analyzeProject')">
    <span class="icon">&#128269;</span><span class="label">Analyze Project</span>
  </button>
</div>

<!-- MCP Tools -->
<div class="section">
  <div class="section-title">MCP Test Engines</div>
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
        <button class="mcp-action" onclick="mcpGen('Puppeteer')">Launch</button>
      </div>
    </div>
  </div>
</div>

<script>
const vscode=acquireVsCodeApi();
function send(cmd,data){vscode.postMessage({command:cmd,...(data||{})})}
function mcpGen(t){vscode.postMessage({command:'mcpGenerate',type:t})}
function mcpRun(t){vscode.postMessage({command:'mcpRun',type:t})}

window.addEventListener('message',e=>{
  const m=e.data;
  switch(m.command){
    case 'aiStatus':
      const ad=document.getElementById('ai-dot'),av=document.getElementById('ai-val');
      if(m.status==='connected'){ad.className='dot green';av.textContent='Connected'}
      else if(m.status==='disconnected'){ad.className='dot red';av.textContent='Not configured'}
      else{ad.className='dot yellow';av.textContent='Checking...'}
      break;
    case 'appStatus':
      const apd=document.getElementById('app-dot'),apv=document.getElementById('app-val'),apb=document.getElementById('app-btn');
      if(m.status==='running'){apd.className='dot green';apv.textContent=m.port?'Port '+m.port:'Running';apb.textContent='Stop';apb.onclick=function(){send('stopApp')}}
      else{apd.className='dot red';apv.textContent='Not running';apb.textContent='Start';apb.onclick=function(){send('startApp')}}
      break;
    case 'runningState':
      document.getElementById('running-indicator').classList.toggle('vis',m.running);
      break;
    case 'runComplete':
      document.getElementById('running-indicator').classList.remove('vis');
      break;
    case 'projectInfo':
      if(m.framework||m.language){
        const pr=document.getElementById('project-row');pr.style.display='flex';
        const pv=document.getElementById('project-val');
        const fw=m.framework?(m.framework.charAt(0).toUpperCase()+m.framework.slice(1)):m.language;
        pv.textContent=fw+(m.isWebApp?' (Web App)':'');
      }
      break;
  }
});
</script>
</body></html>`;
    }
}
