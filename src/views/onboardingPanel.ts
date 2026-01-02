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

    // Setup requirement flags
    private get needsProjectAnalysis(): boolean {
        // For now, assume project analysis is needed if onboarding is shown
        // This can be made smarter later
        return false;
    }

    private get needsAISetup(): boolean {
        // Check if AI is configured and setup is completed
        const config = vscode.workspace.getConfiguration('testfox');
        const apiKey = config.get<string>('ai.apiKey');
        const setupCompleted = this._context.globalState.get<boolean>('testfox.setupCompleted', false);
        return !apiKey || !setupCompleted;
    }

    private get needsGitHubAuth(): boolean {
        // GitHub auth is optional
        return false;
    }

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
                console.log('📨 Onboarding Panel: Received message from webview');
                console.log('📨 Onboarding Panel: Message command:', message.command);
                console.log('📨 Onboarding Panel: Message data keys:', Object.keys(message).filter(k => k !== 'command'));

                switch (message.command) {
                    case 'saveApiKey':
                        await this._handleSaveApiKey(message.apiKey);
                        return;
                    case 'testConnection':
                        await this._handleTestConnection(message.provider, message.apiKey, message.baseUrl, message.modelId);
                        return;
                    case 'saveAndContinue':
                        await this._handleSaveAndContinue(message.provider, message.apiKey, message.baseUrl, message.modelId);
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
        console.log('🎯 Onboarding Panel: createOrShow called');
        console.log('🎯 Onboarding Panel: Extension URI:', extensionUri.toString());
        console.log('🎯 Onboarding Panel: Context globalState keys:', Array.from(context.globalState.keys()));

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        console.log('🎯 Onboarding Panel: Active text editor column:', column);

        // Check if setup is already completed
        console.log('🎯 Onboarding Panel: Checking setup completion status...');
        const setupCompleted = context.globalState.get<boolean>('testfox.setupCompleted', false);
        const config = vscode.workspace.getConfiguration('testfox');
        const apiKey = config.get<string>('ai.apiKey');

        console.log('🎯 Onboarding Panel: Setup completion check:', {
            setupCompleted: setupCompleted,
            apiKeyConfigured: !!apiKey,
            apiKeyLength: apiKey?.length || 0
        });

        if (setupCompleted && apiKey) {
            // Setup is complete, direct users back to Test Control Center
            vscode.window.showInformationMessage(
                'TestFox: AI is already configured. Use the AI Config button in Test Control Center to modify settings.',
                'Open Test Control Center'
            ).then(selection => {
                if (selection === 'Open Test Control Center') {
                    vscode.commands.executeCommand('testfox.openTestControlCenter');
                }
            });
            return;
        }

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

    private async _handleTestConnection(provider: string, apiKey: string, baseUrl: string, modelId: string): Promise<void> {
        console.log('🎯 Onboarding Panel: Test connection initiated');
        console.log('🎯 Onboarding Panel: API key provided:', !!apiKey);
        console.log('🎯 Onboarding Panel: API key length:', apiKey?.length || 0);
        console.log('🎯 Onboarding Panel: API key prefix:', apiKey ? apiKey.substring(0, 12) + '...' : 'None');
        console.log('🎯 Onboarding Panel: Model selected:', modelId);

        if (!apiKey || !apiKey.trim()) {
            console.log('❌ Onboarding Panel: No API key provided');
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please enter an API key first'
            });
            return;
        }

        if (!modelId) {
            console.log('❌ Onboarding Panel: No model selected');
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please select an AI model'
            });
            return;
        }

        console.log(`🎯 Onboarding Panel: Testing ${provider} connection`);
        try {
            console.log('🎯 Onboarding Panel: Updating UI to show testing status');
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: true,
                message: `🧪 Testing ${provider.toUpperCase()} connection...`
            });

            console.log(`🎯 Onboarding Panel: Calling testAIService with provider: ${provider}, model: ${modelId}`);
            const testResult = await this.testAIService(provider, apiKey, baseUrl, modelId);
            console.log('🎯 Onboarding Panel: Test connection completed');
            console.log('🎯 Onboarding Panel: Test result:', testResult);
            
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: testResult.success,
                message: testResult.success 
                    ? `✅ Connection successful! ${modelId.split('/').pop()} is ready to use.`
                    : `❌ Connection failed: ${testResult.error || 'Please check your API key and try again.'}`
            });
        } catch (error) {
            console.log('❌ Onboarding Panel: Test connection failed with exception');
            console.log('❌ Onboarding Panel: Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack',
                type: error.constructor.name
            });

            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: `❌ Connection test failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async testAIService(provider: string, apiKey: string, baseUrl: string, modelId: string): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`🎯 Onboarding Panel: Testing ${provider} service`);

            if (provider === 'openrouter') {
                // Use the new OpenRouter client directly for proper validation
                const { getOpenRouterClient } = await import('../ai/openRouterClient');
                const client = getOpenRouterClient();

                // Temporarily save and validate the key
                const tempContext = { secrets: { store: async () => {}, get: () => null } } as any;
                await client.saveApiKey(tempContext, apiKey);

                if (client.isReady()) {
                    console.log('✅ Onboarding Panel: OpenRouter validation successful');
                    return { success: true };
                } else {
                    const state = client.getState();
                    console.log(`❌ Onboarding Panel: OpenRouter validation failed, state: ${state}`);
                    return { success: false, error: `AI validation failed: ${state}` };
                }
            }

            // For other providers, use the existing AI service for now
            const { createAIService, getDefaultAIConfig, AIProvider } = await import('../ai/aiService');

            let serviceConfig: any;
            switch (provider) {
                case 'google-gemini':
                    serviceConfig = {
                        provider: AIProvider.GOOGLE_GEMINI,
                        apiKey: apiKey,
                        baseUrl: baseUrl,
                        model: modelId
                    };
                    break;

                case 'deepseek':
                    serviceConfig = {
                        provider: AIProvider.DEEPSEEK,
                        apiKey: apiKey,
                        baseUrl: baseUrl,
                        model: modelId
                    };
                    break;

                case 'ollama':
                    serviceConfig = {
                        provider: AIProvider.OLLAMA,
                        baseUrl: baseUrl,
                        model: modelId
                    };
                    break;

                case 'lmstudio':
                    serviceConfig = {
                        provider: AIProvider.LMSTUDIO,
                        baseUrl: baseUrl,
                        model: modelId
                    };
                    break;

                case 'byoApi':
                    serviceConfig = {
                        provider: AIProvider.BYO_API,
                        apiKey: apiKey,
                        baseUrl: baseUrl,
                        model: modelId
                    };
                    break;

                default:
                    return { success: false, error: `Unsupported provider: ${provider}` };
            }

            const aiService = createAIService(serviceConfig);
            const isAvailable = await aiService.isAvailable();

            if (!isAvailable) {
                return { success: false, error: `${provider.toUpperCase()} service is not available. Please check your configuration.` };
            }

            // Test with a simple prompt
            const testResult = await aiService.generate({
                type: 'analysis',
                context: {},
                prompt: 'Say "OK" if you can read this test message.'
            });

            if (testResult.success) {
                return { success: true };
            } else {
                return { success: false, error: testResult.error || 'AI service test failed' };
            }

        } catch (error) {
            console.error('❌ Onboarding Panel: AI service test failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'AI service test failed'
            };
        }
    }

    private async _handleSaveAndContinue(provider: string, apiKey: string, baseUrl: string, modelId: string): Promise<void> {
        if (!provider) {
            this._panel.webview.postMessage({
                command: 'connectionStatus',
                success: false,
                message: 'Please select an AI provider'
            });
            return;
        }

        // Validate provider-specific requirements
        if (provider === 'openrouter' || provider === 'byo-api') {
            if (!apiKey || !apiKey.trim()) {
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    success: false,
                    message: 'Please enter an API key'
                });
                return;
            }
        }

        if (provider === 'ollama' || provider === 'lmstudio' || provider === 'byo-api') {
            if (!baseUrl || !baseUrl.trim()) {
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    success: false,
                    message: 'Please enter a base URL'
                });
                return;
            }
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
            // Save AI configuration securely
            const config = vscode.workspace.getConfiguration('testfox');
            await config.update('ai.provider', provider, vscode.ConfigurationTarget.Global);
            await config.update('ai.baseUrl', baseUrl || '', vscode.ConfigurationTarget.Global);
            await config.update('ai.model', modelId, vscode.ConfigurationTarget.Global);

            // For OpenRouter, save API key securely in secrets
            if (provider === 'openrouter' && apiKey) {
                const { getOpenRouterClient } = await import('../ai/openRouterClient');
                const client = getOpenRouterClient();
                await client.saveApiKey(this._context, apiKey);
            } else {
                // For other providers, still save in config for now
                await config.update('ai.apiKey', apiKey || '', vscode.ConfigurationTarget.Global);
            }

            // Test the AI service
            const testResult = await this.testAIService(provider, apiKey, baseUrl, modelId);

            if (testResult.success) {
                this._panel.webview.postMessage({
                    command: 'connectionStatus',
                    success: true,
                    message: `✅ AI configured successfully! Using ${provider.toUpperCase()} with ${modelId.split('/').pop()}`
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

        // Get available models by provider
        const openRouterModels = [
            { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash ⭐' },
            { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1 ⭐' },
            { value: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder 💻 ⭐' },
            { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano ⭐' },
            { value: 'mistralai/devstral-2512:free', label: 'Devstral 💻 ⭐' },
            { value: 'z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air ⭐' },
            { value: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B ⭐' },
            { value: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B ⭐' },
            { value: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B ⭐' },
            { value: 'x-ai/grok-beta', label: 'Grok Beta 💰' },
            { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet 💰' },
            { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini 💰' },
            { value: 'openai/gpt-4o', label: 'GPT-4o 💰' }
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
                <h2>${this.needsProjectAnalysis ? ++stepNumber : ++stepNumber}: Configure AI Provider</h2>
                <p>TestFox supports multiple AI providers for intelligent test generation. Choose your preferred option:</p>

                <div class="form-group">
                    <label for="aiProvider">AI Provider</label>
                    <select id="aiProvider" class="input-field">
                        <option value="">Select Provider...</option>
                        <option value="openrouter">🔗 OpenRouter (Multiple AI Providers)</option>
                        <option value="google-gemini">🤖 Google Gemini (AI Studio)</option>
                        <option value="deepseek">🧠 DeepSeek (Direct API)</option>
                        <option value="ollama">🐪 Ollama (Local AI)</option>
                        <option value="lmstudio">🎭 LM Studio (Local AI)</option>
                        <option value="byoApi">🔑 Bring Your Own API</option>
                    </select>
                    <small>Choose the AI provider that best fits your needs</small>
                </div>

                <!-- OpenRouter Configuration -->
                <div id="openrouterConfig" class="provider-config" style="display: none;">
                    <h3>🔗 OpenRouter Configuration</h3>
                    <div class="form-group">
                        <label for="aiModel">AI Model</label>
                        <select id="aiModel" class="input-field">
                            <optgroup label="🆓 Free Models">
                                <option value="google/gemini-2.0-flash-exp:free">Google Gemini 2.0 Flash (Free) ⭐</option>
                                <option value="qwen/qwen3-coder:free">Qwen 3 Coder (Free) 🔥</option>
                                <option value="deepseek/deepseek-r1-0528:free">DeepSeek R1 (Free)</option>
                                <option value="meta-llama/llama-3.1-8b-instruct:free">Meta Llama 3.1 8B (Free)</option>
                                <option value="z-ai/glm-4.5-air:free">GLM 4.5 Air (Free)</option>
                                <option value="google/gemma-2-9b-it:free">Google Gemma 2 9B (Free)</option>
                                <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                            </optgroup>
                            <optgroup label="💎 Premium Models">
                                <option value="anthropic/claude-sonnet-4">Claude Sonnet 4 (Anthropic) 🧠</option>
                                <option value="anthropic/claude-opus-4">Claude Opus 4.5 (Anthropic) 👑</option>
                                <option value="openai/gpt-4o">OpenAI GPT-4o</option>
                                <option value="openai/gpt-4.1">OpenAI GPT-4.1</option>
                                <option value="x-ai/grok-3">xAI Grok 3</option>
                                <option value="google/gemini-2.5-pro">Google Gemini 2.5 Pro</option>
                                <option value="qwen/qwen3-235b">Qwen 3 235B</option>
                            </optgroup>
                        </select>
                        <small>OpenRouter provides access to multiple AI providers through a single API</small>
            </div>

                <div class="form-group">
                    <label for="apiKey">OpenRouter API Key</label>
                    <input
                        type="password"
                        id="apiKey"
                        placeholder="sk-or-v1-..."
                        class="input-field"
                        autocomplete="off"
                    />
                        <small>Get your free API key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a></small>
                </div>
                </div>

                <!-- Google Gemini Configuration -->
                <div id="google-geminiConfig" class="provider-config" style="display: none;">
                    <h3>🤖 Google Gemini Configuration</h3>
                    <div class="info-box">
                        <p><strong>🎯 Google's Latest AI Models:</strong></p>
                        <ul>
                            <li>Gemini 1.5 Flash - Fast and efficient</li>
                            <li>Gemini 1.5 Pro - Advanced reasoning</li>
                            <li>Get your API key from Google AI Studio</li>
                        </ul>
            </div>

                    <div class="form-group">
                        <label for="googleGeminiApiKey">API Key</label>
                        <input
                            type="password"
                            id="googleGeminiApiKey"
                            placeholder="AIza..."
                            class="input-field"
                            autocomplete="off"
                        />
                        <small>Get your free API key from <a href="https://makersuite.google.com/app/apikey" target="_blank">Google AI Studio</a></small>
                </div>

                    <div class="form-group">
                        <label for="googleGeminiModel">Model</label>
                        <select id="googleGeminiModel" class="input-field">
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced)</option>
                            <option value="gemini-1.0-pro">Gemini 1.0 Pro</option>
                        </select>
                        <small>Select the Gemini model to use</small>
                    </div>
                    </div>

                <!-- DeepSeek Configuration -->
                <div id="deepseekConfig" class="provider-config" style="display: none;">
                    <h3>🧠 DeepSeek Configuration</h3>
                    <div class="info-box">
                        <p><strong>💡 DeepSeek AI:</strong></p>
                        <ul>
                            <li>Direct API access to DeepSeek models</li>
                            <li>High-quality reasoning and code generation</li>
                            <li>Cost-effective alternative to other providers</li>
                        </ul>
                </div>

                    <div class="form-group">
                        <label for="deepseekBaseUrl">API Base URL</label>
                        <input
                            type="text"
                            id="deepseekBaseUrl"
                            value="https://api.deepseek.com/v1"
                            class="input-field"
                        />
                        <small>DeepSeek API endpoint</small>
                </div>

                    <div class="form-group">
                        <label for="deepseekApiKey">API Key</label>
                        <input
                            type="password"
                            id="deepseekApiKey"
                            placeholder="sk-f4333d90ea9d47c9b5dbde24c3925cf8"
                            class="input-field"
                            autocomplete="off"
                        />
                        <small>Your DeepSeek API key</small>
                    </div>

                    <div class="form-group">
                        <label for="deepseekModel">Model</label>
                        <select id="deepseekModel" class="input-field">
                            <option value="deepseek-chat">DeepSeek Chat</option>
                            <option value="deepseek-coder">DeepSeek Coder</option>
                        </select>
                        <small>Select the DeepSeek model to use</small>
                    </div>
                </div>

                <!-- Ollama Configuration -->
                <div id="ollamaConfig" class="provider-config" style="display: none;">
                    <h3>🐪 Ollama Configuration</h3>
                    <div class="info-box">
                        <p><strong>📋 Prerequisites:</strong></p>
                        <ul>
                            <li>Install <a href="https://ollama.ai" target="_blank">Ollama</a></li>
                            <li>Run: <code>ollama serve</code></li>
                            <li>Pull a model: <code>ollama pull llama2</code></li>
                        </ul>
                    </div>

                    <div class="form-group">
                        <label for="ollamaBaseUrl">Base URL</label>
                        <input
                            type="text"
                            id="ollamaBaseUrl"
                            value="http://localhost:11434"
                            class="input-field"
                        />
                        <small>Default Ollama server URL</small>
                    </div>

                    <div class="form-group">
                        <label for="ollamaModel">Model</label>
                        <select id="ollamaModel" class="input-field">
                            <option value="llama2">Llama 2</option>
                            <option value="codellama">Code Llama</option>
                            <option value="mistral">Mistral</option>
                            <option value="vicuna">Vicuna</option>
                        </select>
                        <small>Select from your installed Ollama models</small>
                    </div>
                </div>

                <!-- LM Studio Configuration -->
                <div id="lmstudioConfig" class="provider-config" style="display: none;">
                    <h3>🎭 LM Studio Configuration</h3>
                    <div class="info-box">
                        <p><strong>📋 Prerequisites:</strong></p>
                        <ul>
                            <li>Install <a href="https://lmstudio.ai" target="_blank">LM Studio</a></li>
                            <li>Start the local server</li>
                            <li>Load a model</li>
                        </ul>
                    </div>

                    <div class="form-group">
                        <label for="lmstudioBaseUrl">Base URL</label>
                        <input
                            type="text"
                            id="lmstudioBaseUrl"
                            value="http://localhost:1234"
                            class="input-field"
                        />
                        <small>Default LM Studio server URL</small>
                    </div>

                    <div class="form-group">
                        <label for="lmstudioModel">Model</label>
                        <input
                            type="text"
                            id="lmstudioModel"
                            value="local-model"
                            class="input-field"
                        />
                        <small>The model name configured in LM Studio</small>
                    </div>
                </div>

                <!-- BYO API Configuration -->
                <div id="byoApiConfig" class="provider-config" style="display: none;">
                    <h3>🔑 Bring Your Own API Configuration</h3>
                    <div class="info-box">
                        <p><strong>💡 Compatible with:</strong></p>
                        <ul>
                            <li>OpenAI API compatible services</li>
                            <li>Anthropic API</li>
                            <li>Any OpenAI-compatible endpoint</li>
                        </ul>
                    </div>

                    <div class="form-group">
                        <label for="byoBaseUrl">API Base URL</label>
                        <input
                            type="text"
                            id="byoBaseUrl"
                            placeholder="https://api.openai.com/v1"
                            class="input-field"
                        />
                        <small>The base URL for your API provider</small>
                    </div>

                    <div class="form-group">
                        <label for="byoApiKey">API Key</label>
                        <input
                            type="password"
                            id="byoApiKey"
                            placeholder="sk-..."
                            class="input-field"
                            autocomplete="off"
                        />
                        <small>Your API key for the service</small>
                    </div>

                    <div class="form-group">
                        <label for="byoModel">Model</label>
                        <input
                            type="text"
                            id="byoModel"
                            placeholder="gpt-3.5-turbo"
                            class="input-field"
                        />
                        <small>The model name to use</small>
                    </div>
                </div>

                    <div class="info-box">
                        <p><strong>🔑 Need API Keys?</strong></p>
                        <p><strong>OpenRouter:</strong> <a href="https://openrouter.ai/keys" target="_blank">Get free credits</a></p>
                        <p><strong>Ollama:</strong> <a href="https://ollama.ai" target="_blank">Install locally</a></p>
                        <p><strong>LM Studio:</strong> <a href="https://lmstudio.ai" target="_blank">Download</a></p>
                        <p><strong>BYO API:</strong> Use any OpenAI-compatible service</p>
                    </div>

                    <div class="info-box" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin-top: 20px;">
                        <h3 style="margin: 0 0 10px 0; color: white;">🚀 Upgrade to TestFox Pro</h3>
                        <p style="margin: 5px 0;"><strong>✨ Unlimited AI Generation</strong></p>
                        <p style="margin: 5px 0;"><strong>📊 Advanced Analytics</strong></p>
                        <p style="margin: 5px 0;"><strong>🎯 Custom Test Templates</strong></p>
                        <p style="margin: 5px 0;"><strong>💰 5,000 AI requests/month</strong></p>
                        <p style="margin: 5px 0;"><strong>🔒 Priority Support</strong></p>
                        <p style="margin: 10px 0 0 0;">
                            <a href="https://testfox.ai/pricing" target="_blank" style="color: #ffd700; text-decoration: none; font-weight: bold;">
                                View Pricing →
                            </a>
                        </p>
                    </div>

                <div class="button-group">
                    <button id="testConnection" class="button secondary">🧪 Test Connection</button>
                    <button id="saveAndContinue" class="button primary">💾 Save & Continue</button>
                </div>

                <script>
                    document.addEventListener('DOMContentLoaded', function() {
                        console.log('TestFox: Onboarding panel DOM loaded');

                        function toggleProviderConfig() {
                            const provider = document.getElementById('aiProvider').value;
                            console.log('Provider selected:', provider);

                            // Hide all configs
                            document.getElementById('openrouterConfig').style.display = 'none';
                            document.getElementById('google-geminiConfig').style.display = 'none';
                            document.getElementById('deepseekConfig').style.display = 'none';
                            document.getElementById('ollamaConfig').style.display = 'none';
                            document.getElementById('lmstudioConfig').style.display = 'none';
                            document.getElementById('byoApiConfig').style.display = 'none';

                            // Show selected config
                            if (provider) {
                                const configEl = document.getElementById(provider + 'Config');
                                if (configEl) {
                                    configEl.style.display = 'block';
                                    console.log('Showing config:', provider + 'Config');
                                } else {
                                    console.error('Config not found:', provider + 'Config');
                                }
                            }
                        }

                        // Attach provider select change handler
                        const providerSelect = document.getElementById('aiProvider');
                        if (providerSelect) {
                            providerSelect.addEventListener('change', toggleProviderConfig);
                            console.log('Provider select handler attached');
                        }

                        // Button handlers
                    document.getElementById('testConnection').addEventListener('click', function() {
                        const provider = document.getElementById('aiProvider').value;
                        if (!provider) {
                            showStatus('Please select an AI provider first', false);
                            return;
                        }

                        let apiKey = '';
                        let baseUrl = '';
                        let modelId = '';

                        switch (provider) {
                            case 'openrouter':
                                apiKey = document.getElementById('apiKey').value;
                                modelId = document.getElementById('aiModel').value;
                                break;
                            case 'google-gemini':
                                apiKey = document.getElementById('googleGeminiApiKey').value;
                                baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
                                modelId = document.getElementById('googleGeminiModel').value;
                                break;
                            case 'deepseek':
                                apiKey = document.getElementById('deepseekApiKey').value;
                                baseUrl = document.getElementById('deepseekBaseUrl').value;
                                modelId = document.getElementById('deepseekModel').value;
                                break;
                            case 'ollama':
                                baseUrl = document.getElementById('ollamaBaseUrl').value;
                                modelId = document.getElementById('ollamaModel').value;
                                break;
                            case 'lmstudio':
                                baseUrl = document.getElementById('lmstudioBaseUrl').value;
                                modelId = document.getElementById('lmstudioModel').value;
                                break;
                            case 'byoApi':
                                apiKey = document.getElementById('byoApiKey').value;
                                baseUrl = document.getElementById('byoBaseUrl').value;
                                modelId = document.getElementById('byoModel').value;
                                break;
                        }

                        vscode.postMessage({
                            command: 'testConnection',
                            provider: provider,
                            apiKey: apiKey,
                            baseUrl: baseUrl,
                            modelId: modelId
                        });
                    });

                    document.getElementById('saveAndContinue').addEventListener('click', function() {
                        const provider = document.getElementById('aiProvider').value;
                        if (!provider) {
                            showStatus('Please select an AI provider first', false);
                            return;
                        }

                        let apiKey = '';
                        let baseUrl = '';
                        let modelId = '';

                        switch (provider) {
                            case 'openrouter':
                                apiKey = document.getElementById('apiKey').value;
                                modelId = document.getElementById('aiModel').value;
                                break;
                            case 'google-gemini':
                                apiKey = document.getElementById('googleGeminiApiKey').value;
                                baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
                                modelId = document.getElementById('googleGeminiModel').value;
                                break;
                            case 'deepseek':
                                apiKey = document.getElementById('deepseekApiKey').value;
                                baseUrl = document.getElementById('deepseekBaseUrl').value;
                                modelId = document.getElementById('deepseekModel').value;
                                break;
                            case 'ollama':
                                baseUrl = document.getElementById('ollamaBaseUrl').value;
                                modelId = document.getElementById('ollamaModel').value;
                                break;
                            case 'lmstudio':
                                baseUrl = document.getElementById('lmstudioBaseUrl').value;
                                modelId = document.getElementById('lmstudioModel').value;
                                break;
                            case 'byoApi':
                                apiKey = document.getElementById('byoApiKey').value;
                                baseUrl = document.getElementById('byoBaseUrl').value;
                                modelId = document.getElementById('byoModel').value;
                                break;
                        }

                        vscode.postMessage({
                            command: 'saveAndContinue',
                            provider: provider,
                            apiKey: apiKey,
                            baseUrl: baseUrl,
                            modelId: modelId
                        });
                        function showStatus(message, isSuccess) {
                            const statusDiv = document.getElementById('connectionStatus');
                            if (statusDiv) {
                                statusDiv.textContent = message;
                                statusDiv.className = 'test-result ' + (isSuccess ? '' : 'error');
                                statusDiv.style.display = 'block';
                            }
                        }

                    }); // End of DOMContentLoaded
                </script>
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

        // Track connection state
        let isConnecting = false;

        // Handle model selection changes
        if (aiModelSelect) {
            aiModelSelect.addEventListener('change', () => {
                // Stop any ongoing connection attempts
                isConnecting = false;

                // Re-enable buttons
                if (testConnectionBtn) {
                    testConnectionBtn.disabled = false;
                    testConnectionBtn.textContent = '🧪 Test Connection';
                }
                if (saveAndContinueBtn) {
                    saveAndContinueBtn.disabled = false;
                    saveAndContinueBtn.textContent = '💾 Save & Continue';
                }

                // Clear any status messages
                if (connectionStatus) {
                    connectionStatus.className = 'test-result hidden';
                    connectionStatus.textContent = '';
                }
            });
        }

        // Test connection (if elements exist)
        if (testConnectionBtn && apiKeyInput && aiModelSelect) {
            testConnectionBtn.addEventListener('click', () => {
                if (isConnecting) return; // Prevent multiple simultaneous requests

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

                isConnecting = true;
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
                if (isConnecting) return; // Prevent multiple simultaneous requests

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

                isConnecting = true;
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
                    isConnecting = false; // Reset connection state
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

