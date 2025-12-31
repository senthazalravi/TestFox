import * as vscode from 'vscode';
import * as path from 'path';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { GitAuth } from '../core/gitAuth';

/**
 * Simple onboarding panel for TestFox setup
 */
export class OnboardingPanel {
    public static currentPanel: OnboardingPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveApiKey':
                        await this._handleSaveApiKey(message.apiKey);
                        return;
                    case 'testConnection':
                        await this._handleTestConnection(message.apiKey, message.modelId);
                        return;
                    case 'saveAndContinue':
                        await this._handleSaveAndContinue(message.apiKey, message.modelId);
                        return;
                    case 'authenticateGitHub':
                        await this._handleGitHubAuth();
                        return;
                    case 'analyzeProject':
                        await this._handleAnalyzeProject();
                        return;
                    case 'completeSetup':
                        await this._handleCompleteSetup();
                        return;
                case 'skip':
                    await this._handleSkip();
                    return;
                    case 'openSettings':
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'testfox');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _update(): void {
        const webview = this._panel.webview;
        webview.html = this._getHtmlForWebview(webview);
    }

    public dispose(): void {
        OnboardingPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
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
            'TestFox Setup Wizard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true
            }
        );

        OnboardingPanel.currentPanel = new OnboardingPanel(panel, extensionUri, context);
    }

    public static showGitHubAuth(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
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

        const authPanel = new OnboardingPanel(panel, extensionUri, context);
        // Override HTML to show only GitHub auth
        authPanel._panel.webview.html = authPanel._getGitHubAuthHtml(authPanel._panel.webview);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
        OnboardingPanel.currentPanel = new OnboardingPanel(panel, extensionUri, context);
    }

    private async _handleSaveApiKey(apiKey: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'apiKeySaved',
                success: false,
                message: 'Please enter an API key'
            });
            return;
        }

        if (!apiKey.startsWith('sk-')) {
            this._panel.webview.postMessage({
                command: 'apiKeySaved',
                success: false,
                message: 'Invalid API key format. OpenRouter keys should start with "sk-"'
            });
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
            await config.update('ai.model', 'google/gemini-2.0-flash-exp:free', vscode.ConfigurationTarget.Global);

            // Update OpenRouter client
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            openRouter.loadConfiguration();

            this._panel.webview.postMessage({
                command: 'apiKeySaved',
                success: true,
                message: 'AI configured successfully!'
            });

            // Close panel after success
            setTimeout(() => {
                this._handleCompleteSetup();
            }, 1500);

        } catch (error) {
            this._panel.webview.postMessage({
                command: 'apiKeySaved',
                success: false,
                message: `Failed to save API key: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleTestConnection(apiKey: string, modelId: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please enter an API key first'
            });
            return;
        }

        if (!modelId) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please select an AI model'
            });
            return;
        }

        try {
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            openRouter.setModel(modelId);

            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: true,
                message: '🧪 Testing connection...'
            });

            const testResult = await openRouter.testConnection(modelId);

            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: testResult.success,
                message: testResult.success
                    ? `✅ Connection successful! ${modelId.split('/').pop()} is ready to use.`
                    : `❌ Connection failed: ${testResult.error || 'Please check your API key and try again.'}`
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: `❌ Connection test failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _handleSaveAndContinue(apiKey: string, modelId: string): Promise<void> {
        if (!apiKey || !apiKey.trim()) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please enter an API key'
            });
            return;
        }

        if (!modelId) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please select an AI model'
            });
            return;
        }

        try {
            // Save settings
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
            await config.update('ai.model', modelId, vscode.ConfigurationTarget.Global);

            // Update OpenRouter client
            const openRouter = getOpenRouterClient();
            openRouter.setApiKey(apiKey);
            openRouter.loadConfiguration();

            // Quick test to ensure it works
            const testResult = await openRouter.testConnection(modelId);

            if (testResult.success) {
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    success: true,
                    message: `✅ AI configured successfully! Using ${modelId.split('/').pop()}`
                });

                // Mark setup as completed
                await this._context.globalState.update('testfox.setupCompleted', true);

                // Close panel after success
                setTimeout(() => {
                    this._panel.dispose();
                    vscode.window.showInformationMessage(
                        `🎉 TestFox is ready! Configured with ${modelId.split('/').pop()}`,
                        'Generate Tests'
                    ).then(selection => {
                        if (selection === 'Generate Tests') {
                            vscode.commands.executeCommand('testfox.generateTests');
                        }
                    });
                }, 2000);
            } else {
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    success: false,
                    message: `❌ Configuration failed: ${testResult.error || 'Unable to connect to the model'}`
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: `❌ Configuration failed: ${error instanceof Error ? error.message : String(error)}`
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
        if (!modelId) {
            this._panel.webview.postMessage({
                command: 'stepError',
                step: 'ai-setup',
                message: 'Please select a model'
            });
            return;
        }

        try {
            // Save model
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.model', modelId, vscode.ConfigurationTarget.Global);

            // Update OpenRouter client
            const openRouter = getOpenRouterClient();
            openRouter.loadConfiguration();

            // Test the selected model
            const testResult = await openRouter.testConnection();

            if (testResult.success) {
                this._panel.webview.postMessage({
                    command: 'modelSelected',
                    success: true,
                    message: `Model "${modelId}" selected and verified successfully!`
                });

                // Mark AI setup as completed
                this.completedSteps.add(this.steps.findIndex(s => s.id === 'ai-setup'));
                this.stepData['ai-setup'] = { apiKey, model: modelId };

                // Auto-advance to next step after a delay
                setTimeout(() => {
                    this._handleNextStep({ apiKey, model: modelId });
                }, 1500);
            } else {
                this._panel.webview.postMessage({
                    command: 'modelSelected',
                    success: false,
                    message: `Model selected but verification failed: ${testResult.error}`
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'modelSelected',
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

    private async _handleSkipGitHub(): Promise<void> {
        // Mark GitHub auth as completed (skipped)
        this.completedSteps.add(this.steps.findIndex(s => s.id === 'github-auth'));
        this.stepData['github-auth'] = { skipped: true };

        // Move to complete step
        this.currentStep = this.steps.length - 1;
        this._update();
    }

    private async _handleCompleteSetup(): Promise<void> {
        try {
            // Mark setup as completed in global state
            const config = vscode.workspace.getConfiguration('testfox');
            const apiKey = config.get<string>('ai.apiKey');
            if (apiKey) {
                // Mark setup as completed in global state
                await this._context.globalState.update('testfox.setupCompleted', true);
            }

            this._panel.webview.postMessage({
                command: 'setupComplete',
                message: 'TestFox setup completed successfully!'
            });

            // Close panel after a delay
            setTimeout(() => {
                this._panel.dispose();

                // Show completion message with action
                vscode.window.showInformationMessage(
                    '🎉 TestFox is ready! Your AI-powered testing companion is now configured.',
                    'Generate Tests',
                    'Open Test Control Center'
                ).then(selection => {
                    if (selection === 'Generate Tests') {
                        vscode.commands.executeCommand('testfox.generateTests');
                    } else if (selection === 'Open Test Control Center') {
                        vscode.commands.executeCommand('testfox.openTestControlCenter');
                    }
                });
            }, 2000);

        } catch (error) {
            this._panel.webview.postMessage({
                command: 'setupError',
                message: `Setup completion failed: ${error instanceof Error ? error.message : String(error)}`
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
            { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash - Google ⭐' },
            { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 - DeepSeek ⭐' },
            { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder - Alibaba 💻 ⭐' },
            { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano - NVIDIA ⭐' },
            { value: 'mistralai/devstral-2512:free', label: 'Devstral - Mistral AI 💻 ⭐' },
            { value: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air - Zhipu AI ⭐' },
            { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B - Meta ⭐' },
            { value: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B - Google ⭐' },
            { value: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B - Mistral AI ⭐' }
        ];

        const premiumModels = [
            { value: 'x-ai/grok-beta', label: 'Grok Beta - xAI 💰' },
            { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet - Anthropic 💰' },
            { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini - OpenAI 💰' },
            { value: 'openai/gpt-4o', label: 'GPT-4o - OpenAI 💰' }
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
                <h2>${this.needsProjectAnalysis ? ++stepNumber : ++stepNumber}: Choose Your AI Model</h2>
                <p>TestFox uses OpenRouter to access multiple AI models. Select your preferred model and enter its API key:</p>

                <div class="form-group">
                    <label for="aiModel">AI Model</label>
                    <select id="aiModel" class="input-field">
                        <optgroup label="⭐ FREE Models">
                            ${freeModels.map(model => `<option value="${model.value}">${model.label}</option>`).join('')}
                        </optgroup>
                        <optgroup label="💰 Premium Models">
                            ${premiumModels.map(model => `<option value="${model.value}">${model.label}</option>`).join('')}
                        </optgroup>
                    </select>
                    <small>Choose from our curated selection of the best AI models for testing</small>
            </div>

                <div class="form-group">
                    <label for="apiKey">API Key</label>
                    <input
                        type="password"
                        id="apiKey"
                        placeholder="Enter your API key..."
                        class="input-field"
                        autocomplete="off"
                    />
                    <small>Your API key is stored securely in VS Code settings</small>
                </div>

                <div class="info-box">
                    <p><strong>🔑 Need an API Key?</strong></p>
                    <p>Get free credits for testing from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a></p>
                    <p>For premium models, get keys from the respective providers</p>
            </div>

                <div class="button-group">
                    <button id="testConnection" class="button secondary">🧪 Test Connection</button>
                    <button id="saveAndContinue" class="button primary">💾 Save & Continue</button>
                </div>
                <div id="connectionStatus" class="test-result hidden"></div>
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
        const aiModelSelect = document.getElementById('aiModel');
        const testConnectionBtn = document.getElementById('testConnection');
        const saveAndContinueBtn = document.getElementById('saveAndContinue');
        const skipBtn = document.getElementById('skip');
        const connectionStatus = document.getElementById('connectionStatus');
        const authGitHubBtn = document.getElementById('authGitHub');
        const authStatus = document.getElementById('authStatus');
        const analyzeProjectBtn = document.getElementById('analyzeProject');
        const analyzeStatus = document.getElementById('analyzeStatus');

        // Test connection (if elements exist)
        if (testConnectionBtn && apiKeyInput && aiModelSelect) {
            testConnectionBtn.addEventListener('click', () => {
                const apiKey = apiKeyInput.value.trim();
                const modelId = aiModelSelect.value;

                if (!apiKey) {
                    showConnectionStatus(false, 'Please enter an API key');
                    return;
                }
                
                if (!modelId) {
                    showConnectionStatus(false, 'Please select an AI model');
                    return;
                }

                testConnectionBtn.disabled = true;
                testConnectionBtn.textContent = '🧪 Testing...';

                vscode.postMessage({
                    command: 'testConnection',
                    apiKey: apiKey,
                    modelId: modelId
                });
            });
        }

        // Save and continue (if elements exist)
        if (saveAndContinueBtn && apiKeyInput && aiModelSelect) {
            saveAndContinueBtn.addEventListener('click', () => {
                const apiKey = apiKeyInput.value.trim();
                const modelId = aiModelSelect.value;

                if (!apiKey) {
                    showConnectionStatus(false, 'Please enter an API key');
                    return;
                }

                if (!modelId) {
                    showConnectionStatus(false, 'Please select an AI model');
                    return;
                }

                saveAndContinueBtn.disabled = true;
                saveAndContinueBtn.textContent = '💾 Saving...';

                vscode.postMessage({
                    command: 'saveAndContinue',
                    apiKey: apiKey,
                    modelId: modelId
                });
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

        function showConnectionStatus(success, message) {
            if (!connectionStatus) return;
            connectionStatus.className = 'test-result ' + (success ? 'success' : 'error');
            connectionStatus.textContent = message;
            connectionStatus.classList.remove('hidden');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'connectionStatus':
                    if (testConnectionBtn) {
                        testConnectionBtn.disabled = false;
                        testConnectionBtn.textContent = '🧪 Test Connection';
                    }
                    if (saveAndContinueBtn) {
                        saveAndContinueBtn.disabled = false;
                        saveAndContinueBtn.textContent = '💾 Save & Continue';
                    }
                    showConnectionStatus(message.success, message.message);
                    break;
                case 'success':
                    showConnectionStatus(true, message.message);
                    break;
                case 'error':
                    showConnectionStatus(false, message.message);
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

