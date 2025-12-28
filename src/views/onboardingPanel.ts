import * as vscode from 'vscode';
import * as path from 'path';
import { getOpenRouterClient } from '../ai/openRouterClient';

/**
 * Onboarding panel for first-time setup
 */
export class OnboardingPanel {
    public static currentPanel: OnboardingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveApiKey':
                        await this._handleSaveApiKey(message.apiKey, message.model);
                        return;
                    case 'testApiKey':
                        await this._handleTestApiKey(message.apiKey);
                        return;
                    case 'skip':
                        await this._handleSkip();
                        return;
                    case 'openSettings':
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.ai');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (OnboardingPanel.currentPanel) {
            OnboardingPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'testfoxOnboarding',
            'TestFox Setup',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true
            }
        );

        OnboardingPanel.currentPanel = new OnboardingPanel(panel, extensionUri);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
        OnboardingPanel.currentPanel = new OnboardingPanel(panel, extensionUri);
    }

    public dispose(): void {
        OnboardingPanel.currentPanel = undefined;

        // Clean up our resources
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update(): Promise<void> {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private async _handleSaveApiKey(apiKey: string, model: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'error',
                message: 'API key is required'
            });
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            this._panel.webview.postMessage({
                command: 'error',
                message: 'Invalid API key format. OpenRouter keys should start with "sk-"'
            });
            return;
        }

        try {
            // Save API key
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
            
            // Save model if provided
            if (model) {
                await config.update('ai.model', model, vscode.ConfigurationTarget.Global);
            }

            // Update OpenRouter client
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            openRouter.loadConfiguration();

            // Test the connection
            try {
                await openRouter.testConnection();
                this._panel.webview.postMessage({
                    command: 'success',
                    message: 'API key saved and verified successfully!'
                });

                // Close panel after a short delay
                setTimeout(() => {
                    this._panel.dispose();
                    vscode.window.showInformationMessage(
                        'TestFox: AI configuration complete! You can now generate tests with AI.',
                        'Generate Tests'
                    ).then(selection => {
                        if (selection === 'Generate Tests') {
                            vscode.commands.executeCommand('testfox.generateTests');
                        }
                    });
                }, 1500);
            } catch (error) {
                this._panel.webview.postMessage({
                    command: 'error',
                    message: `API key saved but connection test failed: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'error',
                message: `Failed to save API key: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleTestApiKey(apiKey: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'testResult',
                success: false,
                message: 'Please enter an API key first'
            });
            return;
        }

        try {
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            const isValid = await openRouter.testConnection();
            
            this._panel.webview.postMessage({
                command: 'testResult',
                success: isValid,
                message: isValid 
                    ? 'API key is valid and working!' 
                    : 'API key test failed. Please check your key.'
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'testResult',
                success: false,
                message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleSkip(): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            'TestFox can work without AI, but AI-powered test generation will be disabled. You can configure it later from settings.',
            'Continue Without AI',
            'Configure Now'
        );

        if (result === 'Continue Without AI') {
            this._panel.dispose();
            vscode.window.showInformationMessage(
                'TestFox: You can configure AI later using "TestFox: Configure AI Settings" command.'
            );
        } else if (result === 'Configure Now') {
            // Keep panel open
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get paths to resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'onboarding.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'onboarding.css')
        );

        // Get available models
        const freeModels = [
            { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (FREE)' },
            { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (FREE)' },
            { value: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (FREE)' },
            { value: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (FREE)' }
        ];

        const premiumModels = [
            { value: 'x-ai/grok-beta', label: 'Grok Beta' },
            { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
            { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
            { value: 'openai/gpt-4o', label: 'GPT-4o' }
        ];

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>TestFox Setup</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦊 Welcome to TestFox!</h1>
            <p class="subtitle">Let's set up AI-powered test generation</p>
        </div>

        <div class="content">
            <div class="step">
                <h2>Step 1: Get Your API Key</h2>
                <p>TestFox uses OpenRouter to access multiple AI models. You can get a free API key:</p>
                <div class="info-box">
                    <p><strong>Free Tier Available:</strong> OpenRouter offers free credits for testing</p>
                    <a href="https://openrouter.ai/keys" target="_blank" class="button-link">
                        Get Free API Key →
                    </a>
                </div>
            </div>

            <div class="step">
                <h2>Step 2: Enter Your API Key</h2>
                <div class="form-group">
                    <label for="apiKey">OpenRouter API Key</label>
                    <input 
                        type="password" 
                        id="apiKey" 
                        placeholder="sk-or-v1-..." 
                        class="input-field"
                        autocomplete="off"
                    />
                    <small>Your API key starts with "sk-" and is stored securely in VS Code settings</small>
                </div>
                <div class="button-group">
                    <button id="testKey" class="button secondary">Test Connection</button>
                    <button id="saveKey" class="button primary">Save & Continue</button>
                </div>
                <div id="testResult" class="test-result hidden"></div>
            </div>

            <div class="step">
                <h2>Step 3: Choose AI Model (Optional)</h2>
                <div class="form-group">
                    <label for="model">AI Model</label>
                    <select id="model" class="input-field">
                        <optgroup label="Free Models (Recommended)">
                            ${freeModels.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
                        </optgroup>
                        <optgroup label="Premium Models">
                            ${premiumModels.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
                        </optgroup>
                    </select>
                    <small>You can change this later in settings. Free models work great for most cases!</small>
                </div>
            </div>

            <div class="actions">
                <button id="skip" class="button link">Skip for now</button>
                <button id="save" class="button primary large">Complete Setup</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Elements
        const apiKeyInput = document.getElementById('apiKey');
        const modelSelect = document.getElementById('model');
        const testKeyBtn = document.getElementById('testKey');
        const saveKeyBtn = document.getElementById('saveKey');
        const saveBtn = document.getElementById('save');
        const skipBtn = document.getElementById('skip');
        const testResult = document.getElementById('testResult');

        // Test API key
        testKeyBtn.addEventListener('click', () => {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                showTestResult(false, 'Please enter an API key');
                return;
            }
            
            testKeyBtn.disabled = true;
            testKeyBtn.textContent = 'Testing...';
            vscode.postMessage({
                command: 'testApiKey',
                apiKey: apiKey
            });
        });

        // Save API key
        saveKeyBtn.addEventListener('click', () => {
            saveApiKey();
        });

        // Complete setup
        saveBtn.addEventListener('click', () => {
            saveApiKey();
        });

        // Skip
        skipBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'skip' });
        });

        function saveApiKey() {
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            
            if (!apiKey) {
                showTestResult(false, 'Please enter an API key');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            vscode.postMessage({
                command: 'saveApiKey',
                apiKey: apiKey,
                model: model
            });
        }

        function showTestResult(success, message) {
            testResult.className = 'test-result ' + (success ? 'success' : 'error');
            testResult.textContent = message;
            testResult.classList.remove('hidden');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'testResult':
                    testKeyBtn.disabled = false;
                    testKeyBtn.textContent = 'Test Connection';
                    showTestResult(message.success, message.message);
                    break;
                case 'success':
                    showTestResult(true, message.message);
                    break;
                case 'error':
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Complete Setup';
                    showTestResult(false, message.message);
                    break;
            }
        });

        // Auto-focus API key input
        apiKeyInput.focus();
    </script>
</body>
</html>`;
    }
}

