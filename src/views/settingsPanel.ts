import * as vscode from 'vscode';
import { createAIService, AIProvider } from '../ai/aiService';


/**
 * Settings Panel for TestFox configuration
 */
export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'testfoxSettings',
            'TestFox Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveSettings':
                        await this._saveSettings(message.settings);
                        break;
                    case 'getSettings':
                        await this._sendCurrentSettings();
                        break;
                    case 'testConnection':
                        await this._testAIConnection(message.apiKey, message.model, message.provider, message.baseUrl);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _saveSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('testfox');
        
        try {
            // Save AI settings
            if (settings.aiEnabled !== undefined) {
                await config.update('ai.enabled', settings.aiEnabled, vscode.ConfigurationTarget.Global);
            }
            if (settings.aiProvider) {
                await config.update('ai.provider', settings.aiProvider, vscode.ConfigurationTarget.Global);
            }
            if (settings.aiApiKey) {
                await config.update('ai.apiKey', settings.aiApiKey, vscode.ConfigurationTarget.Global);
            }
            if (settings.aiBaseUrl) {
                await config.update('ai.baseUrl', settings.aiBaseUrl, vscode.ConfigurationTarget.Global);
            }
            if (settings.aiModel) {
                await config.update('ai.model', settings.aiModel, vscode.ConfigurationTarget.Global);
            }
            if (settings.fallbackModel) {
                await config.update('ai.fallbackModel', settings.fallbackModel, vscode.ConfigurationTarget.Global);
            }

            // Save testing settings
            if (settings.autoDetectProject !== undefined) {
                await config.update('autoDetectProject', settings.autoDetectProject, vscode.ConfigurationTarget.Global);
            }
            if (settings.autoAnalyze !== undefined) {
                await config.update('autoAnalyze', settings.autoAnalyze, vscode.ConfigurationTarget.Global);
            }
            if (settings.browserHeadless !== undefined) {
                await config.update('browserHeadless', settings.browserHeadless, vscode.ConfigurationTarget.Global);
            }
            if (settings.defaultTimeout) {
                await config.update('defaultTimeout', parseInt(settings.defaultTimeout), vscode.ConfigurationTarget.Global);
            }
            if (settings.securityTestLevel) {
                await config.update('securityTestLevel', settings.securityTestLevel, vscode.ConfigurationTarget.Global);
            }

            this._panel.webview.postMessage({ command: 'settingsSaved', success: true });
            vscode.window.showInformationMessage('TestFox settings saved successfully!');
        } catch (error: any) {
            this._panel.webview.postMessage({ command: 'settingsSaved', success: false, error: error.message });
            vscode.window.showErrorMessage(`Failed to save settings: ${error.message}`);
        }
    }

    private async _sendCurrentSettings() {
        const config = vscode.workspace.getConfiguration('testfox');
        
        const settings = {
            // AI Settings
            aiEnabled: config.get('ai.enabled', true),
            aiProvider: config.get('ai.provider', 'openrouter'),
            aiApiKey: config.get('ai.apiKey', ''),
            aiBaseUrl: config.get('ai.baseUrl', ''),
            aiModel: config.get('ai.model', 'google/gemini-2.0-flash-exp:free'),
            fallbackModel: config.get('ai.fallbackModel', 'meta-llama/llama-3.1-8b-instruct:free'),
            
            // Testing Settings
            autoDetectProject: config.get('autoDetectProject', true),
            autoAnalyze: config.get('autoAnalyze', true),
            browserHeadless: config.get('browserHeadless', true),
            defaultTimeout: config.get('defaultTimeout', 30000),
            securityTestLevel: config.get('securityTestLevel', 'standard'),
            performanceThreshold: config.get('performanceThreshold', 3000),
            loadTestConcurrency: config.get('loadTestConcurrency', 10)
        };

        this._panel.webview.postMessage({ command: 'currentSettings', settings });
    }

    private async _testAIConnection(apiKey: string, model: string, provider: string, baseUrl: string) {
        try {
            const aiService = createAIService({
                provider: provider as AIProvider,
                apiKey: apiKey,
                baseUrl: baseUrl,
                model: model
            });

            const isAvailable = await aiService.isAvailable();

            if (isAvailable) {
                this._panel.webview.postMessage({ 
                    command: 'connectionTest', 
                    success: true, 
                    message: `Successfully connected to ${provider}` 
                });
            } else {
                this._panel.webview.postMessage({ 
                    command: 'connectionTest', 
                    success: false, 
                    message: `Failed to connect to ${provider}. Please check your credentials and network.` 
                });
            }
        } catch (error: any) {
            this._panel.webview.postMessage({ 
                command: 'connectionTest', 
                success: false, 
                message: error.message 
            });
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlContent();
    }

    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Settings</title>
    <style>
        :root {
            --bg-primary: #1a1a2e;
            --bg-secondary: #16213e;
            --bg-tertiary: #0f3460;
            --accent: #e94560;
            --accent-hover: #ff6b6b;
            --text-primary: #eaeaea;
            --text-secondary: #a0a0a0;
            --border: #2a2a4a;
            --success: #4ade80;
            --warning: #fbbf24;
            --error: #f87171;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--border);
        }

        .header h1 {
            font-size: 28px;
            color: var(--accent);
        }

        .header .fox-icon {
            font-size: 40px;
        }

        .section {
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
            border: 1px solid var(--border);
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: var(--accent);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--text-primary);
        }

        .form-group .description {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        input[type="text"],
        input[type="password"],
        input[type="number"],
        select {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 14px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        input:focus,
        select:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.2);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .checkbox-group input[type="checkbox"] {
            width: 20px;
            height: 20px;
            accent-color: var(--accent);
            cursor: pointer;
        }

        .checkbox-group label {
            margin: 0;
            cursor: pointer;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .btn-primary {
            background: var(--accent);
            color: white;
        }

        .btn-primary:hover {
            background: var(--accent-hover);
            transform: translateY(-1px);
        }

        .btn-secondary {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: #1a4a7a;
        }

        .btn-group {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }

        .api-key-group {
            display: flex;
            gap: 10px;
        }

        .api-key-group input {
            flex: 1;
        }

        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
        }

        .status-success {
            background: rgba(74, 222, 128, 0.1);
            color: var(--success);
        }

        .status-error {
            background: rgba(248, 113, 113, 0.1);
            color: var(--error);
        }

        .status-warning {
            background: rgba(251, 191, 36, 0.1);
            color: var(--warning);
        }

        .model-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .model-option {
            padding: 12px;
            background: var(--bg-primary);
            border: 2px solid var(--border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .model-option:hover {
            border-color: var(--accent);
        }

        .model-option.selected {
            border-color: var(--accent);
            background: rgba(233, 69, 96, 0.1);
        }

        .model-option .model-name {
            font-weight: 600;
            font-size: 14px;
        }

        .model-option .model-provider {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .model-option .model-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-top: 5px;
        }

        .badge-free {
            background: rgba(74, 222, 128, 0.2);
            color: var(--success);
        }

        .badge-paid {
            background: rgba(251, 191, 36, 0.2);
            color: var(--warning);
        }

        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 500;
            animation: slideIn 0.3s ease;
            z-index: 1000;
        }

        .toast-success {
            background: var(--success);
            color: #1a1a2e;
        }

        .toast-error {
            background: var(--error);
            color: white;
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .divider {
            height: 1px;
            background: var(--border);
            margin: 20px 0;
        }

        .info-box {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 13px;
            color: #60a5fa;
            margin-bottom: 20px;
        }

        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--text-secondary);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="fox-icon">🦊</span>
            <h1>TestFox Settings</h1>
        </div>

        <!-- AI Configuration Section -->
        <div class="section">
            <h2 class="section-title">🤖 AI Configuration</h2>
            
            <div class="info-box">
                TestFox uses AI to generate intelligent tests and enhance reports. Get a free API key at 
                <a href="https://openrouter.ai" style="color: #60a5fa;">openrouter.ai</a>
            </div>

            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="aiEnabled" checked>
                    <label for="aiEnabled">Enable AI-powered features</label>
                </div>
            </div>

            <div class="form-group">
                <label for="aiProvider">AI Provider</label>
                <select id="aiProvider" onchange="toggleProviderFields()">
                    <option value="openrouter">🔗 OpenRouter (Recommended)</option>
                    <option value="google-gemini">🤖 Google Gemini</option>
                    <option value="deepseek">🧠 DeepSeek</option>
                    <option value="ollama">🐪 Ollama (Local)</option>
                    <option value="lmstudio">🎭 LM Studio (Local)</option>
                    <option value="byoApi">🔑 Bring Your Own API</option>
                </select>
            </div>

            <div class="form-group" id="apiKeyGroup">
                <label for="aiApiKey">API Key</label>
                <p class="description">Your API key is stored locally and never shared</p>
                <div class="api-key-group">
                    <input type="password" id="aiApiKey" placeholder="sk-...">
                    <button class="btn btn-secondary" onclick="testConnection()">
                        <span id="testBtnText">Test</span>
                    </button>
                </div>
            </div>

            <div class="form-group" id="baseUrlGroup" style="display: none;">
                <label for="aiBaseUrl">Base URL</label>
                <p class="description">The API endpoint for your provider</p>
                <input type="text" id="aiBaseUrl" placeholder="https://api.example.com/v1">
            </div>

            <div id="connectionStatus" style="margin-top: 10px; margin-bottom: 20px;"></div>

            <div class="form-group">
                <label>AI Model</label>
                <p class="description">Select the model for test generation</p>
                <div class="model-grid" id="modelGrid">
                    <!-- Free Models (Recommended) -->
                    <div class="model-option" data-model="google/gemini-2.0-flash-exp:free">
                        <div class="model-name">Gemini 2.0 Flash</div>
                        <div class="model-provider">Google</div>
                        <span class="model-badge badge-free">Free ⭐</span>
                    </div>
                    <div class="model-option" data-model="deepseek/deepseek-r1-0528:free">
                        <div class="model-name">DeepSeek R1</div>
                        <div class="model-provider">DeepSeek</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <div class="model-option" data-model="qwen/qwen3-coder:free">
                        <div class="model-name">Qwen3 Coder</div>
                        <div class="model-provider">Alibaba</div>
                        <span class="model-badge badge-free">Free 💻</span>
                    </div>
                    <div class="model-option" data-model="nvidia/nemotron-3-nano-30b-a3b:free">
                        <div class="model-name">Nemotron 3 Nano</div>
                        <div class="model-provider">NVIDIA</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <div class="model-option" data-model="mistralai/devstral-2512:free">
                        <div class="model-name">Devstral</div>
                        <div class="model-provider">Mistral AI</div>
                        <span class="model-badge badge-free">Free 💻</span>
                    </div>
                    <div class="model-option" data-model="z-ai/glm-4.5-air:free">
                        <div class="model-name">GLM 4.5 Air</div>
                        <div class="model-provider">Zhipu AI</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <div class="model-option" data-model="meta-llama/llama-3.1-8b-instruct:free">
                        <div class="model-name">Llama 3.1 8B</div>
                        <div class="model-provider">Meta</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <div class="model-option" data-model="google/gemma-2-9b-it:free">
                        <div class="model-name">Gemma 2 9B</div>
                        <div class="model-provider">Google</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <div class="model-option" data-model="mistralai/mistral-7b-instruct:free">
                        <div class="model-name">Mistral 7B</div>
                        <div class="model-provider">Mistral AI</div>
                        <span class="model-badge badge-free">Free</span>
                    </div>
                    <!-- Paid Models -->
                    <div class="model-option" data-model="x-ai/grok-beta">
                        <div class="model-name">Grok Beta</div>
                        <div class="model-provider">xAI</div>
                        <span class="model-badge badge-paid">Paid</span>
                    </div>
                    <div class="model-option" data-model="anthropic/claude-3.5-sonnet">
                        <div class="model-name">Claude 3.5 Sonnet</div>
                        <div class="model-provider">Anthropic</div>
                        <span class="model-badge badge-paid">Paid</span>
                    </div>
                    <div class="model-option" data-model="openai/gpt-4o-mini">
                        <div class="model-name">GPT-4o Mini</div>
                        <div class="model-provider">OpenAI</div>
                        <span class="model-badge badge-paid">Paid</span>
                    </div>
                </div>
                <input type="hidden" id="aiModel" value="google/gemini-2.0-flash-exp:free">
            </div>
        </div>

        <!-- Testing Configuration Section -->
        <div class="section">
            <h2 class="section-title">⚙️ Testing Configuration</h2>

            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="autoDetectProject" checked>
                    <label for="autoDetectProject">Auto-detect project type</label>
                </div>
            </div>

            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="autoAnalyze" checked>
                    <label for="autoAnalyze">Auto-analyze on workspace open</label>
                </div>
            </div>

            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="browserHeadless" checked>
                    <label for="browserHeadless">Run browser in headless mode</label>
                </div>
                <p class="description" style="margin-left: 32px; margin-top: 5px;">Uncheck to see the browser during testing</p>
            </div>

            <div class="divider"></div>

            <div class="form-group">
                <label for="defaultTimeout">Default Timeout (ms)</label>
                <input type="number" id="defaultTimeout" value="30000" min="5000" max="120000" step="1000">
            </div>

            <div class="form-group">
                <label for="securityTestLevel">Security Test Level</label>
                <select id="securityTestLevel">
                    <option value="basic">Basic - Quick security checks</option>
                    <option value="standard" selected>Standard - Comprehensive testing</option>
                    <option value="thorough">Thorough - Deep security analysis</option>
                </select>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="btn-group">
            <button class="btn btn-primary" onclick="saveSettings()">
                💾 Save Settings
            </button>
            <button class="btn btn-secondary" onclick="resetToDefaults()">
                🔄 Reset to Defaults
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentSettings = {};

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ command: 'getSettings' });
            setupModelSelection();
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'currentSettings':
                    loadSettings(message.settings);
                    break;
                case 'settingsSaved':
                    if (message.success) {
                        showToast('Settings saved successfully!', 'success');
                    } else {
                        showToast('Failed to save: ' + message.error, 'error');
                    }
                    break;
                case 'connectionTest':
                    showConnectionResult(message);
                    break;
            }
        });

        function loadSettings(settings) {
            currentSettings = settings;
            
            document.getElementById('aiEnabled').checked = settings.aiEnabled;
            document.getElementById('aiProvider').value = settings.aiProvider;
            document.getElementById('aiApiKey').value = settings.aiApiKey || '';
            document.getElementById('aiBaseUrl').value = settings.aiBaseUrl || '';
            document.getElementById('aiModel').value = settings.aiModel;

            toggleProviderFields();
            document.getElementById('autoDetectProject').checked = settings.autoDetectProject;
            document.getElementById('autoAnalyze').checked = settings.autoAnalyze;
            document.getElementById('browserHeadless').checked = settings.browserHeadless;
            document.getElementById('defaultTimeout').value = settings.defaultTimeout;
            document.getElementById('securityTestLevel').value = settings.securityTestLevel;
            
            // Update model selection
            selectModel(settings.aiModel);
        }

        function setupModelSelection() {
            document.querySelectorAll('.model-option').forEach(option => {
                option.addEventListener('click', () => {
                    const model = option.dataset.model;
                    selectModel(model);
                });
            });
        }

        function selectModel(model) {
            document.querySelectorAll('.model-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            const selected = document.querySelector(\`.model-option[data-model="\${model}"]\`);
            if (selected) {
                selected.classList.add('selected');
            }
            document.getElementById('aiModel').value = model;
        }

        function saveSettings() {
            const settings = {
                aiEnabled: document.getElementById('aiEnabled').checked,
                aiProvider: document.getElementById('aiProvider').value,
                aiApiKey: document.getElementById('aiApiKey').value,
                aiBaseUrl: document.getElementById('aiBaseUrl').value,
                aiModel: document.getElementById('aiModel').value,
                autoDetectProject: document.getElementById('autoDetectProject').checked,
                autoAnalyze: document.getElementById('autoAnalyze').checked,
                browserHeadless: document.getElementById('browserHeadless').checked,
                defaultTimeout: document.getElementById('defaultTimeout').value,
                securityTestLevel: document.getElementById('securityTestLevel').value
            };
            
            vscode.postMessage({ command: 'saveSettings', settings });
        }

        function toggleProviderFields() {
            const provider = document.getElementById('aiProvider').value;
            const apiKeyGroup = document.getElementById('apiKeyGroup');
            const baseUrlGroup = document.getElementById('baseUrlGroup');

            // API key is needed for OpenRouter, Gemini, DeepSeek, and BYO API
            const needsApiKey = ['openrouter', 'google-gemini', 'deepseek', 'byoApi'].includes(provider);
            apiKeyGroup.style.display = needsApiKey ? 'block' : 'none';

            // Base URL is needed for DeepSeek, Ollama, LM Studio, and BYO API
            const needsBaseUrl = ['deepseek', 'ollama', 'lmstudio', 'byoApi'].includes(provider);
            baseUrlGroup.style.display = needsBaseUrl ? 'block' : 'none';
            
            // Set defaults if empty
            const baseUrlInput = document.getElementById('aiBaseUrl');
            if (!baseUrlInput.value) {
                if (provider === 'google-gemini') baseUrlInput.value = 'https://generativelanguage.googleapis.com/v1beta';
                if (provider === 'deepseek') baseUrlInput.value = 'https://api.deepseek.com/v1';
                if (provider === 'ollama') baseUrlInput.value = 'http://localhost:11434';
                if (provider === 'lmstudio') baseUrlInput.value = 'http://localhost:1234';
            }
        }

        function testConnection() {
            const apiKey = document.getElementById('aiApiKey').value;
            const model = document.getElementById('aiModel').value;
            const provider = document.getElementById('aiProvider').value;
            const baseUrl = document.getElementById('aiBaseUrl').value;
            
            const needsApiKey = ['openrouter', 'google-gemini', 'deepseek', 'byoApi'].includes(provider);
            if (needsApiKey && !apiKey) {
                showToast('Please enter an API key first', 'error');
                return;
            }
            
            document.getElementById('testBtnText').innerHTML = '<span class="loading"></span>';
            document.getElementById('connectionStatus').textContent = 'Testing...';
            
            vscode.postMessage({ command: 'testConnection', apiKey, model, provider, baseUrl });
        }

        function showConnectionResult(result) {
            document.getElementById('testBtnText').textContent = 'Test';
            const statusDiv = document.getElementById('connectionStatus');
            
            if (result.success) {
                statusDiv.innerHTML = \`<span class="status-indicator status-success">✓ Connected: \${result.message}</span>\`;
            } else {
                statusDiv.innerHTML = \`<span class="status-indicator status-error">✗ Failed: \${result.message}</span>\`;
            }
        }

        function resetToDefaults() {
            document.getElementById('aiEnabled').checked = true;
            document.getElementById('aiProvider').value = 'openrouter';
            document.getElementById('aiApiKey').value = '';
            selectModel('x-ai/grok-beta');
            document.getElementById('autoDetectProject').checked = true;
            document.getElementById('autoAnalyze').checked = true;
            document.getElementById('browserHeadless').checked = true;
            document.getElementById('defaultTimeout').value = 30000;
            document.getElementById('securityTestLevel').value = 'standard';
            
            showToast('Reset to defaults - click Save to apply', 'success');
        }

        function showToast(message, type) {
            const toast = document.createElement('div');
            toast.className = \`toast toast-\${type}\`;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.remove();
            }, 3000);
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

