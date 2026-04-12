/**
 * AI Setup Panel - Clean, seamless API key configuration
 *
 * Shows automatically on first startup if no AI key is configured.
 * Provides a simple, professional setup experience.
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
            AISetupPanel.viewType,
            'TestFox - AI Setup',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        AISetupPanel.currentPanel = new AISetupPanel(panel, extensionUri);
        return AISetupPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getHtml();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (msg) => {
                switch (msg.command) {
                    case 'saveConfig':
                        await this._saveConfiguration(msg.data);
                        break;
                    case 'testConnection':
                        await this._testConnection(msg.data);
                        break;
                    case 'skip':
                        this._onDidComplete.fire(false);
                        this._panel.dispose();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _saveConfiguration(data: {
        provider: string;
        apiKey: string;
        model: string;
        baseUrl: string;
    }) {
        try {
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.provider', data.provider, vscode.ConfigurationTarget.Global);
            await config.update('ai.apiKey', data.apiKey, vscode.ConfigurationTarget.Global);
            await config.update('ai.model', data.model, vscode.ConfigurationTarget.Global);
            await config.update('ai.baseUrl', data.baseUrl, vscode.ConfigurationTarget.Global);
            await config.update('ai.enabled', true, vscode.ConfigurationTarget.Global);

            this._postMessage({ command: 'saveResult', success: true });
            vscode.window.showInformationMessage('TestFox: AI configured successfully! You can now generate tests.');
            this._onDidComplete.fire(true);

            // Close after a short delay so user sees the success state
            setTimeout(() => this._panel.dispose(), 1500);
        } catch (err) {
            this._postMessage({
                command: 'saveResult',
                success: false,
                error: err instanceof Error ? err.message : 'Failed to save configuration'
            });
        }
    }

    private async _testConnection(data: {
        provider: string;
        apiKey: string;
        model: string;
        baseUrl: string;
    }) {
        try {
            const axios = require('axios');
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            let url = data.baseUrl;
            let body: any;

            if (data.provider === 'openrouter') {
                headers['Authorization'] = `Bearer ${data.apiKey}`;
                headers['HTTP-Referer'] = 'https://testfox.dev';
                headers['X-Title'] = 'TestFox';
                url = 'https://openrouter.ai/api/v1/chat/completions';
                body = {
                    model: data.model,
                    messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
                    max_tokens: 10
                };
            } else if (data.provider === 'ollama') {
                url = `${data.baseUrl}/api/generate`;
                body = {
                    model: data.model,
                    prompt: 'Say "connected" in one word.',
                    stream: false
                };
            } else {
                // Custom OpenAI-compatible
                if (data.apiKey) {
                    headers['Authorization'] = `Bearer ${data.apiKey}`;
                }
                if (!url.includes('/chat/completions')) {
                    url = url.replace(/\/$/, '') + '/chat/completions';
                }
                body = {
                    model: data.model,
                    messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
                    max_tokens: 10
                };
            }

            await axios.post(url, body, { headers, timeout: 15000 });
            this._postMessage({ command: 'testResult', success: true });
        } catch (err: any) {
            const message = err.response?.data?.error?.message
                || err.response?.statusText
                || err.message
                || 'Connection failed';
            this._postMessage({ command: 'testResult', success: false, error: message });
        }
    }

    private _postMessage(msg: any) {
        this._panel.webview.postMessage(msg);
    }

    public dispose() {
        AISetupPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    public static isConfigured(): boolean {
        const config = vscode.workspace.getConfiguration('testfox');
        const provider = config.get<string>('ai.provider', '');
        const apiKey = config.get<string>('ai.apiKey', '');
        // OpenRouter and custom need an API key; ollama doesn't
        if (provider === 'ollama') {
            return true;
        }
        return !!apiKey;
    }

    private _getHtml(): string {
        const config = vscode.workspace.getConfiguration('testfox');
        const currentProvider = config.get<string>('ai.provider', 'openrouter');
        const currentModel = config.get<string>('ai.model', 'google/gemini-2.0-flash-exp:free');
        const currentKey = config.get<string>('ai.apiKey', '');
        const currentBaseUrl = config.get<string>('ai.baseUrl', 'https://openrouter.ai/api/v1');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TestFox AI Setup</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        min-height: 100vh;
    }
    .setup-container {
        max-width: 560px;
        width: 100%;
        padding: 40px 32px;
    }
    .logo-section {
        text-align: center;
        margin-bottom: 32px;
    }
    .logo-section h1 {
        font-size: 28px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--vscode-foreground);
    }
    .logo-section p {
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
        line-height: 1.5;
    }
    .provider-cards {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        margin-bottom: 28px;
    }
    .provider-card {
        padding: 16px 12px;
        border: 2px solid var(--vscode-input-border, rgba(255,255,255,0.1));
        border-radius: 8px;
        cursor: pointer;
        text-align: center;
        transition: all 0.15s ease;
        background: transparent;
    }
    .provider-card:hover {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-list-hoverBackground);
    }
    .provider-card.active {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }
    .provider-card .icon { font-size: 24px; margin-bottom: 8px; }
    .provider-card .name { font-size: 13px; font-weight: 600; }
    .provider-card .desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .provider-card.active .desc { color: var(--vscode-list-activeSelectionForeground); opacity: 0.8; }

    .form-section {
        display: none;
        animation: fadeIn 0.2s ease;
    }
    .form-section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    .field { margin-bottom: 20px; }
    .field label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 6px;
        color: var(--vscode-foreground);
    }
    .field input, .field select {
        width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-size: 13px;
        font-family: var(--vscode-font-family);
        outline: none;
        transition: border-color 0.15s;
    }
    .field input:focus, .field select:focus {
        border-color: var(--vscode-focusBorder);
    }
    .field .hint {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
        line-height: 1.4;
    }
    .field .hint a {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
    }

    .actions {
        display: flex;
        gap: 10px;
        margin-top: 24px;
    }
    .btn {
        padding: 9px 20px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: opacity 0.15s;
        font-family: var(--vscode-font-family);
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        flex: 1;
    }
    .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }
    .btn-ghost {
        background: transparent;
        color: var(--vscode-descriptionForeground);
        padding: 9px 12px;
    }

    .status-bar {
        margin-top: 16px;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 12px;
        display: none;
        align-items: center;
        gap: 8px;
    }
    .status-bar.visible { display: flex; }
    .status-bar.success {
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #22c55e;
    }
    .status-bar.error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }
    .status-bar.loading {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #3b82f6;
    }

    .free-tag {
        display: inline-block;
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 6px;
        vertical-align: middle;
    }

    .divider {
        height: 1px;
        background: var(--vscode-panel-border);
        margin: 28px 0;
    }

    .skip-link {
        text-align: center;
        margin-top: 20px;
    }
    .skip-link button {
        background: none;
        border: none;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        cursor: pointer;
        text-decoration: underline;
        font-family: var(--vscode-font-family);
    }
    .skip-link button:hover { color: var(--vscode-foreground); }
</style>
</head>
<body>
<div class="setup-container">
    <div class="logo-section">
        <h1>TestFox AI Setup</h1>
        <p>Connect an AI provider to generate intelligent tests for your project.<br>
        Choose a provider below to get started.</p>
    </div>

    <div class="provider-cards">
        <div class="provider-card ${currentProvider === 'openrouter' ? 'active' : ''}" data-provider="openrouter" onclick="selectProvider('openrouter')">
            <div class="icon">&#9889;</div>
            <div class="name">OpenRouter</div>
            <div class="desc">Free models available</div>
        </div>
        <div class="provider-card ${currentProvider === 'ollama' ? 'active' : ''}" data-provider="ollama" onclick="selectProvider('ollama')">
            <div class="icon">&#127968;</div>
            <div class="name">Ollama</div>
            <div class="desc">Local, private</div>
        </div>
        <div class="provider-card ${currentProvider === 'custom' ? 'active' : ''}" data-provider="custom" onclick="selectProvider('custom')">
            <div class="icon">&#128279;</div>
            <div class="name">Custom API</div>
            <div class="desc">Any OpenAI-compatible</div>
        </div>
    </div>

    <!-- OpenRouter Form -->
    <div class="form-section" id="form-openrouter">
        <div class="field">
            <label>API Key</label>
            <input type="password" id="or-key" placeholder="sk-or-..." value="${currentProvider === 'openrouter' ? currentKey : ''}">
            <div class="hint">Get a free key at <a href="https://openrouter.ai/keys">openrouter.ai/keys</a></div>
        </div>
        <div class="field">
            <label>Model</label>
            <select id="or-model">
                <option value="google/gemini-2.0-flash-exp:free" ${currentModel === 'google/gemini-2.0-flash-exp:free' ? 'selected' : ''}>Gemini 2.0 Flash <span class="free-tag">FREE</span></option>
                <option value="google/gemini-2.0-pro-exp-02-05:free" ${currentModel === 'google/gemini-2.0-pro-exp-02-05:free' ? 'selected' : ''}>Gemini 2.0 Pro (FREE)</option>
                <option value="deepseek/deepseek-r1:free" ${currentModel === 'deepseek/deepseek-r1:free' ? 'selected' : ''}>DeepSeek R1 (FREE)</option>
                <option value="deepseek/deepseek-v3:free" ${currentModel === 'deepseek/deepseek-v3:free' ? 'selected' : ''}>DeepSeek V3 (FREE)</option>
                <option value="meta-llama/llama-3.3-70b-instruct:free" ${currentModel === 'meta-llama/llama-3.3-70b-instruct:free' ? 'selected' : ''}>Llama 3.3 70B (FREE)</option>
                <option value="qwen/qwen-2.5-coder-32b-instruct:free" ${currentModel === 'qwen/qwen-2.5-coder-32b-instruct:free' ? 'selected' : ''}>Qwen 2.5 Coder (FREE)</option>
                <option value="mistralai/mistral-nemo:free" ${currentModel === 'mistralai/mistral-nemo:free' ? 'selected' : ''}>Mistral Nemo (FREE)</option>
                <option value="anthropic/claude-3.5-sonnet" ${currentModel === 'anthropic/claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet (Paid)</option>
                <option value="openai/gpt-4o" ${currentModel === 'openai/gpt-4o' ? 'selected' : ''}>GPT-4o (Paid)</option>
            </select>
            <div class="hint">Free models work great for test generation. No billing required.</div>
        </div>
    </div>

    <!-- Ollama Form -->
    <div class="form-section" id="form-ollama">
        <div class="field">
            <label>Model Name</label>
            <input type="text" id="ol-model" placeholder="llama3.1:8b" value="${currentProvider === 'ollama' ? currentModel : 'llama3.1:8b'}">
            <div class="hint">Models: llama3.1, codellama, mistral, qwen2.5, deepseek-coder</div>
        </div>
        <div class="field">
            <label>Host URL</label>
            <input type="text" id="ol-url" placeholder="http://localhost:11434" value="${currentProvider === 'ollama' ? currentBaseUrl : 'http://localhost:11434'}">
            <div class="hint">Default Ollama server: http://localhost:11434</div>
        </div>
    </div>

    <!-- Custom API Form -->
    <div class="form-section" id="form-custom">
        <div class="field">
            <label>Base URL</label>
            <input type="text" id="cu-url" placeholder="https://api.openai.com/v1" value="${currentProvider === 'custom' ? currentBaseUrl : ''}">
            <div class="hint">OpenAI-compatible endpoint (e.g. https://api.openai.com/v1)</div>
        </div>
        <div class="field">
            <label>API Key</label>
            <input type="password" id="cu-key" placeholder="sk-..." value="${currentProvider === 'custom' ? currentKey : ''}">
        </div>
        <div class="field">
            <label>Model</label>
            <input type="text" id="cu-model" placeholder="gpt-4o" value="${currentProvider === 'custom' ? currentModel : ''}">
        </div>
    </div>

    <div class="actions">
        <button class="btn btn-secondary" onclick="testConnection()" id="btn-test">Test Connection</button>
        <button class="btn btn-primary" onclick="saveConfig()" id="btn-save">Save & Start Testing</button>
    </div>

    <div class="status-bar" id="status"></div>

    <div class="skip-link">
        <button onclick="skip()">Skip for now (use rule-based test generation)</button>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let selectedProvider = '${currentProvider || 'openrouter'}';

    function selectProvider(provider) {
        selectedProvider = provider;
        document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-provider="' + provider + '"]').classList.add('active');
        document.querySelectorAll('.form-section').forEach(f => f.classList.remove('active'));
        document.getElementById('form-' + provider).classList.add('active');
        hideStatus();
    }

    function getFormData() {
        if (selectedProvider === 'openrouter') {
            return {
                provider: 'openrouter',
                apiKey: document.getElementById('or-key').value.trim(),
                model: document.getElementById('or-model').value,
                baseUrl: 'https://openrouter.ai/api/v1'
            };
        } else if (selectedProvider === 'ollama') {
            return {
                provider: 'ollama',
                apiKey: '',
                model: document.getElementById('ol-model').value.trim(),
                baseUrl: document.getElementById('ol-url').value.trim()
            };
        } else {
            return {
                provider: 'custom',
                apiKey: document.getElementById('cu-key').value.trim(),
                model: document.getElementById('cu-model').value.trim(),
                baseUrl: document.getElementById('cu-url').value.trim()
            };
        }
    }

    function testConnection() {
        const data = getFormData();
        if (selectedProvider === 'openrouter' && !data.apiKey) {
            showStatus('Please enter your OpenRouter API key', 'error');
            return;
        }
        if (selectedProvider === 'ollama' && !data.model) {
            showStatus('Please enter a model name', 'error');
            return;
        }
        if (selectedProvider === 'custom' && (!data.baseUrl || !data.model)) {
            showStatus('Please fill in the base URL and model name', 'error');
            return;
        }
        showStatus('Testing connection...', 'loading');
        setButtonsDisabled(true);
        vscode.postMessage({ command: 'testConnection', data });
    }

    function saveConfig() {
        const data = getFormData();
        if (selectedProvider === 'openrouter' && !data.apiKey) {
            showStatus('Please enter your OpenRouter API key', 'error');
            return;
        }
        showStatus('Saving configuration...', 'loading');
        setButtonsDisabled(true);
        vscode.postMessage({ command: 'saveConfig', data });
    }

    function skip() {
        vscode.postMessage({ command: 'skip' });
    }

    function showStatus(msg, type) {
        const el = document.getElementById('status');
        const icons = { success: '&#10003;', error: '&#10007;', loading: '&#8987;' };
        el.innerHTML = (icons[type] || '') + ' ' + msg;
        el.className = 'status-bar visible ' + type;
    }

    function hideStatus() {
        document.getElementById('status').className = 'status-bar';
    }

    function setButtonsDisabled(disabled) {
        document.getElementById('btn-test').disabled = disabled;
        document.getElementById('btn-save').disabled = disabled;
    }

    window.addEventListener('message', e => {
        const msg = e.data;
        setButtonsDisabled(false);
        switch (msg.command) {
            case 'testResult':
                if (msg.success) {
                    showStatus('Connection successful! AI is ready.', 'success');
                } else {
                    showStatus(msg.error || 'Connection failed', 'error');
                }
                break;
            case 'saveResult':
                if (msg.success) {
                    showStatus('Configuration saved! Starting TestFox...', 'success');
                    setButtonsDisabled(true);
                } else {
                    showStatus(msg.error || 'Failed to save', 'error');
                }
                break;
        }
    });

    // Initialize with current provider
    selectProvider(selectedProvider);
</script>
</body>
</html>`;
    }
}
