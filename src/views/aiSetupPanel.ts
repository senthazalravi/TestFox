/**
 * AI Setup Panel - Seamless AI configuration
 *
 * Shows on first startup if AI is not configured.
 * Simple flow: pick provider preset or enter Base URL + API Key + Model.
 * Tests connection and shows "AI Connected" in status bar on success.
 */

import * as vscode from 'vscode';

export class AISetupPanel {
    public static currentPanel: AISetupPanel | undefined;
    private static readonly viewType = 'testfox.aiSetup';
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _onDidComplete = new vscode.EventEmitter<boolean>();
    public readonly onDidComplete = this._onDidComplete.event;

    public static createOrShow(extensionUri: vscode.Uri): AISetupPanel {
        const column = vscode.ViewColumn.One;
        if (AISetupPanel.currentPanel) {
            AISetupPanel.currentPanel._panel.reveal(column);
            return AISetupPanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(
            AISetupPanel.viewType, 'TestFox - AI Setup', column,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] }
        );
        AISetupPanel.currentPanel = new AISetupPanel(panel, extensionUri);
        return AISetupPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getHtml();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'testConnection': await this._testConnection(msg.data); break;
                case 'saveConfig': await this._saveConfiguration(msg.data); break;
                case 'skip': this._onDidComplete.fire(false); this._panel.dispose(); break;
                case 'applyPreset': this._postMessage({ command: 'presetApplied', data: msg.data }); break;
            }
        }, null, this._disposables);
    }

    private async _testConnection(data: { baseUrl: string; apiKey: string; model: string }) {
        try {
            const axios = require('axios');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            let url = data.baseUrl.replace(/\/$/, '');
            let body: any;

            // Determine if this is Ollama (no auth needed, different endpoint)
            const isOllama = url.includes('11434') || url.includes('ollama');
            const isNvidiaNim = url.includes('integrate.api.nvidia.com') || url.includes('nvidia');
            
            if (isOllama) {
                url = url.replace(/\/api\/.*$/, '') + '/api/generate';
                body = { model: data.model, prompt: 'Say hi', stream: false };
            } else if (isNvidiaNim) {
                // NVIDIA NIM specific configuration
                if (data.apiKey) headers['Authorization'] = `Bearer ${data.apiKey}`;
                headers['Accept'] = 'application/json';
                if (!url.endsWith('/chat/completions')) {
                    url = url + '/chat/completions';
                }
                body = {
                    model: data.model,
                    messages: [{ role: 'user', content: 'Say hi' }],
                    max_tokens: 5,
                    temperature: 1.0,
                    top_p: 1.0,
                    stream: false,
                    chat_template_kwargs: { thinking: true }
                };
            } else {
                // OpenAI-compatible endpoint
                if (data.apiKey) headers['Authorization'] = `Bearer ${data.apiKey}`;
                if (url.includes('openrouter')) {
                    headers['HTTP-Referer'] = 'https://testfox.dev';
                    headers['X-Title'] = 'TestFox';
                }
                if (!url.endsWith('/chat/completions')) {
                    url = url + '/chat/completions';
                }
                body = { model: data.model, messages: [{ role: 'user', content: 'Say hi' }], max_tokens: 5 };
            }

            await axios.post(url, body, { headers, timeout: 15000 });
            this._postMessage({ command: 'testResult', success: true });
        } catch (err: any) {
            const message = err.response?.data?.error?.message || err.response?.statusText || err.message || 'Connection failed';
            this._postMessage({ command: 'testResult', success: false, error: message });
        }
    }

    private async _saveConfiguration(data: { baseUrl: string; apiKey: string; model: string; provider: string }) {
        try {
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.provider', data.provider, vscode.ConfigurationTarget.Global);
            await config.update('ai.apiKey', data.apiKey, vscode.ConfigurationTarget.Global);
            await config.update('ai.model', data.model, vscode.ConfigurationTarget.Global);
            await config.update('ai.baseUrl', data.baseUrl, vscode.ConfigurationTarget.Global);
            await config.update('ai.enabled', true, vscode.ConfigurationTarget.Global);

            this._postMessage({ command: 'saveResult', success: true });
            this._onDidComplete.fire(true);
            setTimeout(() => this._panel.dispose(), 1200);
        } catch (err) {
            this._postMessage({ command: 'saveResult', success: false, error: err instanceof Error ? err.message : 'Save failed' });
        }
    }

    private _postMessage(msg: any) { this._panel.webview.postMessage(msg); }

    public dispose() {
        AISetupPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
    }

    public static isConfigured(): boolean {
        const config = vscode.workspace.getConfiguration('testfox');
        const provider = config.get<string>('ai.provider', '');
        const apiKey = config.get<string>('ai.apiKey', '');
        if (provider === 'ollama') return true;
        return !!apiKey;
    }

    private _getHtml(): string {
        const config = vscode.workspace.getConfiguration('testfox');
        const curKey = config.get<string>('ai.apiKey', '');
        const curModel = config.get<string>('ai.model', 'google/gemini-2.0-flash-exp:free');
        const curUrl = config.get<string>('ai.baseUrl', 'https://openrouter.ai/api/v1');
        const curProvider = config.get<string>('ai.provider', 'openrouter');

        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TestFox AI Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);display:flex;justify-content:center;padding:0;min-height:100vh}
.c{max-width:540px;width:100%;padding:36px 28px}
h1{font-size:24px;font-weight:600;margin-bottom:6px}
.sub{color:var(--vscode-descriptionForeground);font-size:13px;margin-bottom:28px;line-height:1.5}
.presets{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.preset{padding:8px 14px;border:1px solid var(--vscode-input-border,rgba(255,255,255,.12));border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;background:transparent;color:var(--vscode-foreground);font-family:var(--vscode-font-family);transition:all .12s}
.preset:hover{border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}
.preset.active{border-color:var(--vscode-focusBorder);background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.sep{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--vscode-descriptionForeground);font-size:11px}
.sep::before,.sep::after{content:'';flex:1;height:1px;background:var(--vscode-panel-border,rgba(255,255,255,.08))}
.f{margin-bottom:16px}
.f label{display:block;font-size:12px;font-weight:500;margin-bottom:4px}
.f input,.f select{width:100%;padding:8px 10px;border:1px solid var(--vscode-input-border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-size:13px;font-family:var(--vscode-font-family);outline:none}
.f input:focus,.f select:focus{border-color:var(--vscode-focusBorder)}
.hint{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px}
.hint a{color:var(--vscode-textLink-foreground);text-decoration:none}
.actions{display:flex;gap:10px;margin-top:24px}
.btn{padding:9px 18px;border-radius:4px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:var(--vscode-font-family);transition:opacity .12s}
.btn:hover{opacity:.9}.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);flex:1}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.status{margin-top:14px;padding:10px 14px;border-radius:6px;font-size:12px;display:none;align-items:center;gap:8px}
.status.vis{display:flex}
.status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#22c55e}
.status.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444}
.status.load{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);color:#3b82f6}
.skip{text-align:center;margin-top:18px}
.skip button{background:none;border:none;color:var(--vscode-descriptionForeground);font-size:11px;cursor:pointer;text-decoration:underline;font-family:var(--vscode-font-family)}
.skip button:hover{color:var(--vscode-foreground)}
</style></head>
<body>
<div class="c">
<h1>AI Configuration</h1>
<p class="sub">Connect an AI provider to enhance test generation. Pick a preset or enter your own endpoint. TestFox works without AI too.</p>

<div class="presets">
  <button class="preset${curProvider === 'openrouter' ? ' active' : ''}" onclick="applyPreset('openrouter')">OpenRouter (Free)</button>
  <button class="preset${curProvider === 'ollama' ? ' active' : ''}" onclick="applyPreset('ollama')">Ollama (Local)</button>
  <button class="preset" onclick="applyPreset('openai')">OpenAI</button>
  <button class="preset" onclick="applyPreset('anthropic')">Anthropic</button>
  <button class="preset" onclick="applyPreset('deepseek')">DeepSeek</button>
  <button class="preset${curProvider === 'nvidia-nim' ? ' active' : ''}" onclick="applyPreset('nvidia-nim')">NVIDIA NIM</button>
  <button class="preset${curProvider === 'custom' ? ' active' : ''}" onclick="applyPreset('custom')">Custom</button>
</div>

<div class="f">
  <label>Base URL</label>
  <input type="text" id="baseUrl" placeholder="https://openrouter.ai/api/v1" value="${curUrl}">
  <div class="hint" id="urlHint">The API base URL (without /chat/completions)</div>
</div>

<div class="f">
  <label>API Key</label>
  <input type="password" id="apiKey" placeholder="sk-..." value="${curKey}">
  <div class="hint" id="keyHint">Get a free key at <a href="https://openrouter.ai/keys">openrouter.ai/keys</a></div>
</div>

<div class="f">
  <label>Model</label>
  <input type="text" id="model" placeholder="google/gemini-2.0-flash-exp:free" value="${curModel}">
  <div class="hint" id="modelHint">Model identifier from your provider</div>
</div>

<div class="actions">
  <button class="btn btn-secondary" id="btnTest" onclick="testConn()">Test Connection</button>
  <button class="btn btn-primary" id="btnSave" onclick="saveConf()">Save & Connect</button>
</div>

<div class="status" id="st"></div>

<div class="skip"><button onclick="vscode.postMessage({command:'skip'})">Skip - use rule-based testing only</button></div>
</div>

<script>
const vscode=acquireVsCodeApi();
let provider='${curProvider||'openrouter'}';

const presets={
  openrouter:{url:'https://openrouter.ai/api/v1',model:'google/gemini-2.0-flash-exp:free',keyHint:'Get a free key at <a href="https://openrouter.ai/keys">openrouter.ai/keys</a>',urlHint:'OpenRouter API endpoint',modelHint:'Free: gemini-2.0-flash, deepseek-r1, llama-3.3-70b',needsKey:true},
  ollama:{url:'http://localhost:11434',model:'llama3.1:8b',keyHint:'No API key needed for local Ollama',urlHint:'Local Ollama server',modelHint:'Run: ollama pull llama3.1:8b',needsKey:false},
  openai:{url:'https://api.openai.com/v1',model:'gpt-4o',keyHint:'Get key at <a href="https://platform.openai.com/api-keys">platform.openai.com</a>',urlHint:'OpenAI API endpoint',modelHint:'gpt-4o, gpt-4o-mini, gpt-3.5-turbo',needsKey:true},
  anthropic:{url:'https://api.anthropic.com/v1',model:'claude-sonnet-4-20250514',keyHint:'Get key at <a href="https://console.anthropic.com">console.anthropic.com</a>',urlHint:'Anthropic API endpoint',modelHint:'claude-sonnet-4-20250514, claude-3-5-haiku-20241022',needsKey:true},
  deepseek:{url:'https://api.deepseek.com/v1',model:'deepseek-chat',keyHint:'Get key at <a href="https://platform.deepseek.com">platform.deepseek.com</a>',urlHint:'DeepSeek API endpoint',modelHint:'deepseek-chat, deepseek-reasoner',needsKey:true},
  'nvidia-nim':{url:'https://integrate.api.nvidia.com/v1',model:'moonshotai/kimi-k2.5',keyHint:'Get your NVIDIA NIM API key from NVIDIA NGC',urlHint:'NVIDIA NIM API endpoint',modelHint:'moonshotai/kimi-k2.5, nvidia/llama-3.1-nemotron-70b',needsKey:true},
  custom:{url:'',model:'',keyHint:'Your provider API key',urlHint:'Any OpenAI-compatible base URL',modelHint:'Model name from your provider',needsKey:true}
};

function applyPreset(p){
  provider=p;
  const pr=presets[p]||presets.custom;
  document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  if(pr.url)document.getElementById('baseUrl').value=pr.url;
  if(pr.model)document.getElementById('model').value=pr.model;
  if(!pr.needsKey)document.getElementById('apiKey').value='';
  document.getElementById('urlHint').innerHTML=pr.urlHint;
  document.getElementById('keyHint').innerHTML=pr.keyHint;
  document.getElementById('modelHint').innerHTML=pr.modelHint;
  hideStatus();
}

function getFormData(){
  return{
    baseUrl:document.getElementById('baseUrl').value.trim(),
    apiKey:document.getElementById('apiKey').value.trim(),
    model:document.getElementById('model').value.trim(),
    provider:provider
  };
}

function testConn(){
  const d=getFormData();
  if(!d.baseUrl){showStatus('Enter a base URL','err');return}
  if(!d.model){showStatus('Enter a model name','err');return}
  showStatus('Testing connection...','load');
  setBtns(true);
  vscode.postMessage({command:'testConnection',data:d});
}

function saveConf(){
  const d=getFormData();
  if(!d.baseUrl){showStatus('Enter a base URL','err');return}
  if(!d.model){showStatus('Enter a model name','err');return}
  showStatus('Saving...','load');
  setBtns(true);
  vscode.postMessage({command:'saveConfig',data:d});
}

function showStatus(msg,type){
  const el=document.getElementById('st');
  const icons={ok:'&#10003;',err:'&#10007;',load:'&#8987;'};
  el.innerHTML=(icons[type]||'')+' '+msg;
  el.className='status vis '+type;
}
function hideStatus(){document.getElementById('st').className='status'}
function setBtns(d){document.getElementById('btnTest').disabled=d;document.getElementById('btnSave').disabled=d}

window.addEventListener('message',e=>{
  const m=e.data;setBtns(false);
  if(m.command==='testResult'){
    if(m.success)showStatus('AI Connected - connection successful!','ok');
    else showStatus(m.error||'Connection failed','err');
  }
  if(m.command==='saveResult'){
    if(m.success)showStatus('AI Connected - configuration saved!','ok');
    else showStatus(m.error||'Save failed','err');
  }
});
</script>
</body></html>`;
    }
}
