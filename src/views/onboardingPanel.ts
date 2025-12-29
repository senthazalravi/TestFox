import * as vscode from 'vscode';
import * as path from 'path';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { GitAuth } from '../core/gitAuth';

/**
 * Onboarding panel for first-time setup
 */
export class OnboardingPanel {
    public static currentPanel: OnboardingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private needsAISetup: boolean = true;
    private needsGitHubAuth: boolean = false;
    private needsProjectAnalysis: boolean = false;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, needsAISetup: boolean = true, needsGitHubAuth: boolean = false, needsProjectAnalysis: boolean = false) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.needsAISetup = needsAISetup;
        this.needsGitHubAuth = needsGitHubAuth;
        this.needsProjectAnalysis = needsProjectAnalysis;

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
                    case 'discoverModels':
                        await this._handleDiscoverModels(message.apiKey);
                        return;
                    case 'selectModel':
                        await this._handleSelectModel(message.apiKey, message.model);
                        return;
                    case 'authenticateGitHub':
                        await this._handleGitHubAuth();
                        return;
                    case 'skip':
                        await this._handleSkip();
                        return;
                    case 'openSettings':
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.ai');
                        return;
                    case 'analyzeProject':
                        await this._handleAnalyzeProject();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, needsAISetup: boolean = true, needsGitHubAuth: boolean = false, needsProjectAnalysis: boolean = false): void {
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

        OnboardingPanel.currentPanel = new OnboardingPanel(panel, extensionUri, needsAISetup, needsGitHubAuth, needsProjectAnalysis);
    }

    public static showGitHubAuth(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            'testfoxGitHubAuth',
            'TestFox: GitHub Authentication',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true
            }
        );

        const authPanel = new OnboardingPanel(panel, extensionUri, false, true);
        // Override HTML to show only GitHub auth
        authPanel._panel.webview.html = authPanel._getGitHubAuthHtml(authPanel._panel.webview);
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
                const testResult = await openRouter.testConnection();
                if (testResult.success) {
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
                } else {
                    this._panel.webview.postMessage({
                        command: 'error',
                        message: `API key saved but connection test failed: ${testResult.error || 'Unknown error'}`
                    });
                }
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
            const testResult = await openRouter.testConnection();
            
            this._panel.webview.postMessage({
                command: 'testResult',
                success: testResult.success,
                message: testResult.success 
                    ? 'API key is valid and working! Connected to free AI model.' 
                    : (testResult.error || 'API key test failed. Please check your key.')
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'testResult',
                success: false,
                message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleDiscoverModels(apiKey: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'discoverResult',
                success: false,
                message: 'Please enter an API key first'
            });
            return;
        }

        try {
            this._panel.webview.postMessage({
                command: 'discoverStatus',
                status: 'discovering',
                message: 'Discovering available AI models...'
            });

            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            
            const availableModels = await openRouter.discoverWorkingModels();
            
            const workingModels = availableModels.filter(m => m.isWorking);
            const failedModels = availableModels.filter(m => !m.isWorking);

            this._panel.webview.postMessage({
                command: 'discoverResult',
                success: true,
                models: availableModels,
                workingCount: workingModels.length,
                totalCount: availableModels.length,
                message: `Found ${workingModels.length} working model(s) out of ${availableModels.length} tested`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'discoverResult',
                success: false,
                message: `Model discovery failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleSelectModel(apiKey: string, modelId: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'selectResult',
                success: false,
                message: 'API key is required'
            });
            return;
        }

        if (!modelId) {
            this._panel.webview.postMessage({
                command: 'selectResult',
                success: false,
                message: 'Please select a model'
            });
            return;
        }

        try {
            // Save API key and model
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
            await config.update('ai.model', modelId, vscode.ConfigurationTarget.Global);

            // Update OpenRouter client
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            openRouter.loadConfiguration();

            // Test the selected model
            const testResult = await openRouter.testConnection();
            
            if (testResult.success) {
                this._panel.webview.postMessage({
                    command: 'selectResult',
                    success: true,
                    message: `Model "${modelId}" selected and verified successfully!`
                });

                // Close panel after a short delay
                setTimeout(() => {
                    this._panel.dispose();
                    vscode.window.showInformationMessage(
                        `TestFox: AI configured with ${modelId}! You can now generate tests with AI.`,
                        'Generate Tests'
                    ).then(selection => {
                        if (selection === 'Generate Tests') {
                            vscode.commands.executeCommand('testfox.generateTests');
                        }
                    });
                }, 1500);
            } else {
                this._panel.webview.postMessage({
                    command: 'selectResult',
                    success: false,
                    message: `Model selected but verification failed: ${testResult.error}`
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'selectResult',
                success: false,
                message: `Failed to select model: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleGitHubAuth(): Promise<void> {
        try {
            this._panel.webview.postMessage({
                command: 'authStatus',
                status: 'authenticating',
                message: 'Opening GitHub authentication...'
            });

            const session = await GitAuth.getSession(true);
            
            if (session) {
                const username = await GitAuth.getUsername();
                this._panel.webview.postMessage({
                    command: 'authStatus',
                    status: 'success',
                    message: `Successfully authenticated as ${username || 'GitHub user'}!`
                });

                // Close panel after a short delay
                setTimeout(() => {
                    this._panel.dispose();
                    vscode.window.showInformationMessage(
                        'TestFox: GitHub authentication complete! You can now create issues for failed tests.',
                        'Generate Tests'
                    ).then(selection => {
                        if (selection === 'Generate Tests') {
                            vscode.commands.executeCommand('testfox.generateTests');
                        }
                    });
                }, 2000);
            } else {
                this._panel.webview.postMessage({
                    command: 'authStatus',
                    status: 'error',
                    message: 'GitHub authentication was cancelled or failed. Please try again.'
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'authStatus',
                status: 'error',
                message: `GitHub authentication failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleSkip(): Promise<void> {
        if (this.needsProjectAnalysis) {
            // Project analysis is required for basic functionality
            vscode.window.showWarningMessage('TestFox: Project analysis is required for test generation.');
            return;
        }

        if (this.needsGitHubAuth && !this.needsAISetup) {
            // Only GitHub auth needed
            this._panel.dispose();
            vscode.window.showInformationMessage(
                'TestFox: You can authenticate with GitHub later to enable issue creation for failed tests.'
            );
            return;
        }

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

    private async _handleAnalyzeProject(): Promise<void> {
        try {
            this._panel.webview.postMessage({
                command: 'analyzeStatus',
                status: 'analyzing',
                message: 'Analyzing your project...'
            });

            // Import the analyzeProject function dynamically
            const { analyzeProject } = await import('../extension');
            await analyzeProject();

            this._panel.webview.postMessage({
                command: 'analyzeResult',
                success: true,
                message: 'Project analysis completed successfully!'
            });

            // Check if we need to continue with other steps
            const needsMoreSetup = this.needsAISetup || this.needsGitHubAuth;
            if (!needsMoreSetup) {
                // Everything is set up
                setTimeout(() => {
                    this._panel.dispose();
                    vscode.window.showInformationMessage(
                        'TestFox: Setup complete! You can now generate tests.',
                        'Generate Tests'
                    ).then(selection => {
                        if (selection === 'Generate Tests') {
                            vscode.commands.executeCommand('testfox.generateTests');
                        }
                    });
                }, 1500);
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'analyzeResult',
                success: false,
                message: `Project analysis failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private _getGitHubAuthHtml(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'onboarding.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>GitHub Authentication</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 GitHub Authentication</h1>
            <p class="subtitle">Connect GitHub to enable issue creation for failed tests</p>
        </div>

        <div class="content">
            <div class="step">
                <h2>Why GitHub Authentication?</h2>
                <p>TestFox can automatically create GitHub issues when tests fail. This requires GitHub authentication to:</p>
                <ul>
                    <li>Create issues in your repository</li>
                    <li>Link failed tests to commits</li>
                    <li>Track defects across test runs</li>
                </ul>
            </div>

            <div class="step">
                <h2>Authenticate with GitHub</h2>
                <p>Click the button below to authenticate with GitHub. VS Code will handle the authentication securely.</p>
                <div class="button-group">
                    <button id="authGitHub" class="button primary large">🔐 Authenticate with GitHub</button>
                </div>
                <div id="authStatus" class="test-result hidden"></div>
            </div>

            <div class="actions">
                <button id="skip" class="button link">Skip for now</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const authBtn = document.getElementById('authGitHub');
        const skipBtn = document.getElementById('skip');
        const authStatus = document.getElementById('authStatus');

        authBtn.addEventListener('click', () => {
            authBtn.disabled = true;
            authBtn.textContent = 'Authenticating...';
            vscode.postMessage({ command: 'authenticateGitHub' });
        });

        skipBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'skip' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'authStatus') {
                authStatus.className = 'test-result ' + message.status;
                authStatus.textContent = message.message;
                authStatus.classList.remove('hidden');
                
                if (message.status === 'success') {
                    authBtn.disabled = true;
                    authBtn.textContent = '✓ Authenticated';
                } else if (message.status === 'error') {
                    authBtn.disabled = false;
                    authBtn.textContent = '🔐 Authenticate with GitHub';
                }
            }
        });
    </script>
</body>
</html>`;
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

        let stepNumber = 0;

        const projectAnalysisHtml = this.needsProjectAnalysis ? `
            <div class="step">
                <h2>${++stepNumber}: Analyze Your Project</h2>
                <p>TestFox needs to analyze your codebase to understand your project structure and generate appropriate tests.</p>
                <div class="info-box">
                    <p><strong>What TestFox will do:</strong></p>
                    <ul>
                        <li>Detect your project type (React, Node.js, Python, etc.)</li>
                        <li>Identify routes, forms, and APIs</li>
                        <li>Set up testing parameters</li>
                        <li>Configure test generation rules</li>
                    </ul>
                </div>
                <div class="button-group">
                    <button id="analyzeProject" class="button primary">🔍 Analyze Project</button>
                </div>
                <div id="analyzeStatus" class="test-result hidden"></div>
            </div>
        ` : '';

        const aiSetupHtml = this.needsAISetup ? `
            <div class="step">
                <h2>${this.needsProjectAnalysis ? ++stepNumber : ++stepNumber}: Get Your API Key</h2>
                <p>TestFox uses OpenRouter to access multiple AI models. You can get a free API key:</p>
                <div class="info-box">
                    <p><strong>Free Tier Available:</strong> OpenRouter offers free credits for testing</p>
                    <a href="https://openrouter.ai/keys" target="_blank" class="button-link">
                        Get Free API Key →
                    </a>
                </div>
            </div>

            <div class="step">
                <h2>${this.needsProjectAnalysis ? ++stepNumber : ++stepNumber}: Enter Your API Key</h2>
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
                <h2>${this.needsProjectAnalysis ? ++stepNumber : ++stepNumber}: Discover & Choose AI Model</h2>
                <p>Let TestFox discover which AI models are available and working with your API key:</p>
                <div class="button-group">
                    <button id="discoverModels" class="button primary">🔍 Discover Available Models</button>
                </div>
                <div id="discoverStatus" class="test-result hidden"></div>

                <div id="modelSelection" class="hidden" style="margin-top: 20px;">
                    <h3>Available Models</h3>
                    <p id="discoverSummary" style="margin-bottom: 15px;"></p>
                    <div id="modelsList" style="max-height: 400px; overflow-y: auto; border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 10px;">
                        <!-- Models will be populated here -->
                    </div>
                    <div class="button-group" style="margin-top: 15px;">
                        <button id="selectModel" class="button primary" disabled>Select Model & Continue</button>
                    </div>
                    <div id="selectResult" class="test-result hidden"></div>
                </div>
            </div>
        ` : '';

        // Reset step counter for GitHub auth
        stepNumber = this.needsAISetup ? stepNumber : (this.needsProjectAnalysis ? 1 : 0);

        const githubAuthHtml = this.needsGitHubAuth ? `
            <div class="step">
                <h2>${++stepNumber}: GitHub Authentication</h2>
                <p>Connect GitHub to enable automatic issue creation for failed tests:</p>
                <ul>
                    <li>🎯 Create GitHub issues when tests fail</li>
                    <li>🔗 Link failed tests to commits</li>
                    <li>📊 Track defects across test runs</li>
                    <li>👥 Collaborate with team on bug fixes</li>
                </ul>
                <div class="info-box">
                    <p><strong>Why GitHub Integration?</strong></p>
                    <p>Failed tests get unique defect IDs (FUN-0001, UI-0002, etc.) and can be automatically turned into GitHub issues with full context, stack traces, and reproduction steps.</p>
                </div>
                <div class="button-group">
                    <button id="authGitHub" class="button primary">🔐 Authenticate with GitHub</button>
                </div>
                <div id="authStatus" class="test-result hidden"></div>
            </div>
        ` : '';

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
            <p class="subtitle">Complete setup to unlock AI-powered testing with GitHub issue creation</p>
        </div>

        <div class="content">
            ${projectAnalysisHtml}
            ${aiSetupHtml}
            ${githubAuthHtml}

            <div class="actions">
                <button id="skip" class="button link">Skip for now</button>
                ${this.needsAISetup ? '<button id="save" class="button primary large">Complete Setup</button>' : ''}
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Elements (may be null if not needed)
        const apiKeyInput = document.getElementById('apiKey');
        const modelSelect = document.getElementById('model');
        const testKeyBtn = document.getElementById('testKey');
        const saveKeyBtn = document.getElementById('saveKey');
        const saveBtn = document.getElementById('save');
        const skipBtn = document.getElementById('skip');
        const testResult = document.getElementById('testResult');
        const authGitHubBtn = document.getElementById('authGitHub');
        const authStatus = document.getElementById('authStatus');
        const discoverModelsBtn = document.getElementById('discoverModels');
        const discoverStatus = document.getElementById('discoverStatus');
        const modelSelection = document.getElementById('modelSelection');
        const modelsList = document.getElementById('modelsList');
        const discoverSummary = document.getElementById('discoverSummary');
        const selectModelBtn = document.getElementById('selectModel');
        const selectResult = document.getElementById('selectResult');
        
        let selectedModelId = null;

        // Test API key (if element exists)
        if (testKeyBtn && apiKeyInput) {
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
        }

        // Save API key (if element exists)
        if (saveKeyBtn) {
            saveKeyBtn.addEventListener('click', () => {
                saveApiKey();
            });
        }

        // Complete setup (if element exists)
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                saveApiKey();
            });
        }

        // GitHub authentication (if element exists)
        if (authGitHubBtn) {
            authGitHubBtn.addEventListener('click', () => {
                authGitHubBtn.disabled = true;
                authGitHubBtn.textContent = 'Authenticating...';
                vscode.postMessage({ command: 'authenticateGitHub' });
            });
        }

        // Skip
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'skip' });
            });
        }

        // Analyze project handler
        if (analyzeProjectBtn) {
            analyzeProjectBtn.addEventListener('click', () => {
                analyzeProjectBtn.disabled = true;
                analyzeProjectBtn.textContent = 'Analyzing...';
                if (analyzeStatus) {
                    analyzeStatus.className = 'test-result info';
                    analyzeStatus.textContent = 'Analyzing your project structure...';
                    analyzeStatus.classList.remove('hidden');
                }
                vscode.postMessage({ command: 'analyzeProject' });
            });
        }

        // GitHub auth handler
        if (authGitHubBtn) {
            authGitHubBtn.addEventListener('click', async () => {
                authGitHubBtn.disabled = true;
                authGitHubBtn.textContent = 'Authenticating...';
                if (authStatus) {
                    authStatus.className = 'test-result info';
                    authStatus.textContent = 'Connecting to GitHub...';
                    authStatus.classList.remove('hidden');
                }

                try {
                    // Try to get GitHub session
                    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });

                    if (session) {
                        vscode.postMessage({
                            command: 'authResult',
                            success: true,
                            message: 'Successfully authenticated with GitHub!'
                        });
                    } else {
                        throw new Error('GitHub authentication failed');
                    }
                } catch (error) {
                    vscode.postMessage({
                        command: 'authResult',
                        success: false,
                        message: 'GitHub authentication failed. Please try again.'
                    });
                }
            });
        }

        // Skip setup handler
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'skip' });
            });
        }

        // Open settings handler
        const openSettingsBtn = document.getElementById('openSettings');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'openSettings' });
            });
        }

        // Discover models handler
        if (discoverModelsBtn && apiKeyInput) {
            discoverModelsBtn.addEventListener('click', () => {
                const apiKey = apiKeyInput.value.trim();
                if (!apiKey) {
                    if (discoverStatus) {
                        discoverStatus.className = 'test-result error';
                        discoverStatus.textContent = 'Please enter an API key first';
                        discoverStatus.classList.remove('hidden');
                    }
                    return;
                }
                
                discoverModelsBtn.disabled = true;
                discoverModelsBtn.textContent = 'Discovering...';
                if (discoverStatus) {
                    discoverStatus.className = 'test-result info';
                    discoverStatus.textContent = 'Testing available models... This may take a moment.';
                    discoverStatus.classList.remove('hidden');
                }
                
                vscode.postMessage({
                    command: 'discoverModels',
                    apiKey: apiKey
                });
            });
        }

        // Select model handler
        if (selectModelBtn) {
            selectModelBtn.addEventListener('click', () => {
                if (!selectedModelId || !apiKeyInput) {
                    if (selectResult) {
                        selectResult.className = 'test-result error';
                        selectResult.textContent = 'Please select a model';
                        selectResult.classList.remove('hidden');
                    }
                    return;
                }
                
                selectModelBtn.disabled = true;
                selectModelBtn.textContent = 'Saving...';
                
                vscode.postMessage({
                    command: 'selectModel',
                    apiKey: apiKeyInput.value.trim(),
                    model: selectedModelId
                });
            });
        }

        function saveApiKey() {
            if (!apiKeyInput || !modelSelect) return;
            
            const apiKey = apiKeyInput.value.trim();
            const model = modelSelect.value;
            
            if (!apiKey) {
                showTestResult(false, 'Please enter an API key');
                return;
            }

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }
            vscode.postMessage({
                command: 'saveApiKey',
                apiKey: apiKey,
                model: model
            });
        }

        function showTestResult(success, message) {
            if (!testResult) return;
            testResult.className = 'test-result ' + (success ? 'success' : 'error');
            testResult.textContent = message;
            testResult.classList.remove('hidden');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'testResult':
                    if (testKeyBtn) {
                        testKeyBtn.disabled = false;
                        testKeyBtn.textContent = 'Test Connection';
                    }
                    showTestResult(message.success, message.message);
                    break;
            if (message.command === 'discoverStatus') {
                    if (discoverStatus) {
                        discoverStatus.className = 'test-result ' + message.status;
                        discoverStatus.textContent = message.message;
                        discoverStatus.classList.remove('hidden');
                    }
                    break;
            if (message.command === 'discoverResult') {
                    if (discoverModelsBtn) {
                        discoverModelsBtn.disabled = false;
                        discoverModelsBtn.textContent = '🔍 Discover Available Models';
                    }
                    
                    if (message.success && modelSelection && modelsList && discoverSummary) {
                        const models = message.models || [];
                        const workingModels = models.filter(m => m.isWorking);
                        const failedModels = models.filter(m => !m.isWorking);
                        
                        discoverSummary.textContent = \`Found \${workingModels.length} working model(s) out of \${models.length} tested\`;
                        
                        // Show working models first
                        let html = '';
                        if (workingModels.length > 0) {
                            html += '<div style="margin-bottom: 15px;"><strong style="color: var(--vscode-textLink-foreground);">✅ Working Models:</strong></div>';
                            workingModels.forEach(model => {
                                const displayName = model.name || model.id.split('/').pop();
                                const responseTime = model.responseTime ? \` (\${model.responseTime}ms)\` : '';
                                html += \`
                                    <label style="display: block; padding: 10px; margin: 5px 0; border: 1px solid var(--vscode-input-border); border-radius: 4px; cursor: pointer; background: var(--vscode-input-background);">
                                        <input type="radio" name="model" value="\${model.id}" style="margin-right: 10px;" />
                                        <strong>\${displayName}</strong>\${responseTime}
                                        \${model.isFree ? '<span style="color: var(--vscode-textLink-foreground); margin-left: 10px;">(FREE)</span>' : ''}
                                    </label>
                                \`;
                            });
                        }
                        
                        if (failedModels.length > 0) {
                            html += '<div style="margin-top: 20px; margin-bottom: 10px;"><strong style="color: var(--vscode-errorForeground);">❌ Unavailable Models:</strong></div>';
                            failedModels.forEach(model => {
                                const displayName = model.name || model.id.split('/').pop();
                                html += \`
                                    <div style="padding: 8px; margin: 5px 0; border: 1px solid var(--vscode-input-border); border-radius: 4px; opacity: 0.6;">
                                        <strong>\${displayName}</strong>
                                        <span style="color: var(--vscode-errorForeground); margin-left: 10px;">\${model.error || 'Failed'}</span>
                                    </div>
                                \`;
                            });
                        }
                        
                        modelsList.innerHTML = html;
                        
                        // Add radio button listeners
                        const radioButtons = modelsList.querySelectorAll('input[type="radio"]');
                        radioButtons.forEach(radio => {
                            radio.addEventListener('change', (e) => {
                                selectedModelId = e.target.value;
                                if (selectModelBtn) {
                                    selectModelBtn.disabled = false;
                                }
                            });
                        });
                        
                        // Auto-select first working model
                        if (workingModels.length > 0 && radioButtons.length > 0) {
                            radioButtons[0].checked = true;
                            selectedModelId = workingModels[0].id;
                            if (selectModelBtn) {
                                selectModelBtn.disabled = false;
                            }
                        }
                        
                        modelSelection.classList.remove('hidden');
                        
                        if (discoverStatus) {
                            discoverStatus.className = 'test-result success';
                            discoverStatus.textContent = message.message;
                        }
                    } else {
                        if (discoverStatus) {
                            discoverStatus.className = 'test-result error';
                            discoverStatus.textContent = message.message || 'Model discovery failed';
                        }
                    }
                    break;
            if (message.command === 'selectResult') {
                    if (selectModelBtn) {
                        selectModelBtn.disabled = false;
                        selectModelBtn.textContent = 'Select Model & Continue';
                    }
                    if (selectResult) {
                        selectResult.className = 'test-result ' + (message.success ? 'success' : 'error');
                        selectResult.textContent = message.message;
                        selectResult.classList.remove('hidden');
                    }
                    break;
                case 'success':
                    showTestResult(true, message.message);
                    break;
                case 'error':
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Complete Setup';
                    }
                    showTestResult(false, message.message);
                    break;
                case 'authStatus':
                    if (authStatus) {
                        authStatus.className = 'test-result ' + message.status;
                        authStatus.textContent = message.message;
                        authStatus.classList.remove('hidden');
                    }
                    if (authGitHubBtn) {
                        if (message.status === 'success') {
                            authGitHubBtn.disabled = true;
                            authGitHubBtn.textContent = '✓ Authenticated';
                        } else if (message.status === 'error') {
                            authGitHubBtn.disabled = false;
                            authGitHubBtn.textContent = '🔐 Authenticate with GitHub';
                        }
                    }
                    break;
            }
        });

        // Auto-focus API key input if it exists
        if (apiKeyInput) {
            apiKeyInput.focus();
        }
    </script>
</body>
</html>`;
    }
}

