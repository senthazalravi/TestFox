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

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, force: boolean = false): void {
        console.log('🎯 Onboarding Panel: createOrShow called', { force });
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
            apiKeyLength: apiKey?.length || 0,
            force: force
        });

        if (setupCompleted && apiKey && !force) {
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
        } catch (error: any) {
            console.log('❌ Onboarding Panel: Test connection failed with exception');
            console.log('❌ Onboarding Panel: Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack',
                type: error?.constructor?.name || 'Unknown'
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

                case 'byo-api':
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
            openRouter.setApiKey(apiKey);

            // Test the selected model
            const testResult = await openRouter.testConnection();

            if (testResult.success) {
                this._panel.webview.postMessage({
                    command: 'modelSelected',
                    success: true,
                    message: `Model "${modelId}" selected and verified successfully!`
                });

                // Auto-advance to complete setup after a delay
                setTimeout(() => {
                    this._handleCompleteSetup();
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
        // Disable AI and mark setup as completed
        const config = vscode.workspace.getConfiguration('testfox');
        await config.update('ai.enabled', false, vscode.ConfigurationTarget.Global);
        await this._context.globalState.update('testfox.setupCompleted', true);
        
        this._panel.dispose();
        vscode.window.showInformationMessage(
            'TestFox configured for rule-based testing. Use "AI Config" button in Test Control Center to enable AI features later.'
        );
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
        // Just complete setup
        await this._handleCompleteSetup();
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
            // Top Free Models
            { value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free) ⭐' },
            { value: 'google/gemini-2.0-pro-exp-02-05:free', label: 'Gemini 2.0 Pro (Free) 🚀' },
            { value: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (Free) 🧠' },
            { value: 'deepseek/deepseek-v3:free', label: 'DeepSeek V3 (Free) ⚡' },
            { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free) 🔥' },
            { value: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder (Free) 💻' },
            
            // Top Premium Models
            { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet 👑' },
            { value: 'openai/gpt-4o', label: 'GPT-4o 🤖' },
            { value: 'x-ai/grok-2-1212', label: 'Grok 2 🌌' },
            { value: 'mistralai/mistral-large-2411', label: 'Mistral Large 2 🇫🇷' }
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
                        <option value="byo-api">🔑 Bring Your Own API</option>
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
                                <option value="deepseek/deepseek-r1:free">DeepSeek R1 (Free) ⭐</option>
                                <option value="qwen/qwen-2.5-coder-32b:free">Qwen 2.5 Coder 32B (Free) 🔥</option>
                                <option value="z-ai/glm-4-9b-chat:free">GLM 4 9B (Free) ⭐</option>
                            </optgroup>
                            <optgroup label="💎 Premium Models">
                                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet (Anthropic) 🧠</option>
                                <option value="anthropic/claude-3-opus">Claude 3 Opus (Anthropic) 👑</option>
                                <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (Meta) 🔥</option>
                                <option value="openai/gpt-4o">OpenAI GPT-4o</option>
                                <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini</option>
                                <option value="mistralai/mistral-large-2411">Mistral Large 2</option>
                                <option value="cohere/command-r-plus">Cohere Command R+</option>
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
                <div id="byo-apiConfig" class="provider-config" style="display: none;">
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
        
        // --- Elements ---
        const aiProviderSelect = document.getElementById('aiProvider');
        const testConnectionBtn = document.getElementById('testConnection');
        const saveAndContinueBtn = document.getElementById('saveAndContinue');
        const connectionStatus = document.getElementById('connectionStatus');
        const skipBtn = document.getElementById('skip');
        const authGitHubBtn = document.getElementById('authGitHub');
        const authStatus = document.getElementById('authStatus');
        const analyzeProjectBtn = document.getElementById('analyzeProject');
        const analyzeStatus = document.getElementById('analyzeStatus');

        // --- State ---
        let isConnecting = false;

        // --- AI Provider Toggle ---
        if (aiProviderSelect) {
            aiProviderSelect.addEventListener('change', () => {
                const provider = aiProviderSelect.value;
                console.log('Provider selected:', provider);
                
                // Hide all configs
                const configs = ['openrouter', 'google-gemini', 'deepseek', 'ollama', 'lmstudio', 'byo-api'];
                configs.forEach(p => {
                    const el = document.getElementById(p + 'Config');
                    if (el) el.style.display = 'none';
                });

                // Show selected config
                if (provider) {
                    const el = document.getElementById(provider + 'Config');
                    if (el) {
                        el.style.display = 'block';
                        console.log('Showing config:', provider + 'Config');
                    }
                }

                // Clear status
                if (connectionStatus) {
                    connectionStatus.className = 'test-result hidden';
                    connectionStatus.textContent = '';
                }
            });

            // Initial toggle if a provider is already selected
            if (aiProviderSelect.value) {
                const event = new Event('change');
                aiProviderSelect.dispatchEvent(event);
            }
        }

        // --- AI Helper Functions ---
        function getAIConfig() {
            if (!aiProviderSelect) return null;
            const provider = aiProviderSelect.value;
            if (!provider) return null;

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
                case 'byo-api':
                    apiKey = document.getElementById('byoApiKey').value;
                    baseUrl = document.getElementById('byoBaseUrl').value;
                    modelId = document.getElementById('byoModel').value;
                    break;
            }

            return { provider, apiKey, baseUrl, modelId };
        }

        function showConnectionStatus(success, message) {
            if (!connectionStatus) return;
            connectionStatus.className = 'test-result ' + (success ? 'success' : 'error');
            connectionStatus.textContent = message;
            connectionStatus.classList.remove('hidden');
        }

        // --- AI Event Listeners ---
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => {
                if (isConnecting) return;
                const config = getAIConfig();
                if (!config) {
                    showConnectionStatus(false, 'Please select an AI provider');
                    return;
                }
                
                if ((config.provider === 'openrouter' || config.provider === 'google-gemini' || config.provider === 'deepseek' || config.provider === 'byo-api') && !config.apiKey) {
                    showConnectionStatus(false, 'Please enter an API key');
                    return;
                }

                isConnecting = true;
                testConnectionBtn.disabled = true;
                testConnectionBtn.textContent = '🧪 Testing...';

                vscode.postMessage({
                    command: 'testConnection',
                    ...config
                });
            });
        }

        if (saveAndContinueBtn) {
            saveAndContinueBtn.addEventListener('click', () => {
                if (isConnecting) return;
                const config = getAIConfig();
                if (!config) {
                    showConnectionStatus(false, 'Please select an AI provider');
                    return;
                }

                if ((config.provider === 'openrouter' || config.provider === 'google-gemini' || config.provider === 'deepseek' || config.provider === 'byo-api') && !config.apiKey) {
                    showConnectionStatus(false, 'Please enter an API key');
                    return;
                }

                isConnecting = true;
                saveAndContinueBtn.disabled = true;
                saveAndContinueBtn.textContent = '💾 Saving...';

                vscode.postMessage({
                    command: 'saveAndContinue',
                    ...config
                });
            });
        }

        // --- Other Step Listeners ---
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
                    // Initial authentication handled by extension
                    vscode.postMessage({ command: 'authenticateGitHub' });
                } catch (error) {
                    vscode.postMessage({
                        command: 'authStatus',
                        status: 'error',
                        message: 'Authentication failed: ' + error.message
                    });
                }
            });
        }

        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'skip' });
            });
        }

        // --- Message Handler ---
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'connectionStatus':
                    isConnecting = false;
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
                case 'analyzeResult':
                    if (analyzeProjectBtn) {
                        analyzeProjectBtn.disabled = false;
                        analyzeProjectBtn.textContent = '🔍 Analyze Project';
                    }
                    if (analyzeStatus) {
                        analyzeStatus.className = 'test-result ' + (message.success ? 'success' : 'error');
                        analyzeStatus.textContent = message.message;
                        analyzeStatus.classList.remove('hidden');
                    }
                    break;
                case 'authStatus':
                    if (authGitHubBtn) {
                        if (message.status === 'success') {
                            authGitHubBtn.disabled = true;
                            authGitHubBtn.textContent = '✓ Authenticated';
                        } else {
                            authGitHubBtn.disabled = false;
                            authGitHubBtn.textContent = '🔐 Authenticate with GitHub';
                        }
                    }
                    if (authStatus) {
                        authStatus.className = 'test-result ' + message.status;
                        authStatus.textContent = message.message;
                        authStatus.classList.remove('hidden');
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

