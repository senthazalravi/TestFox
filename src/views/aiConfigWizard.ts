import * as vscode from 'vscode';
import { AIProvider, AIServiceConfig, createAIService, getDefaultAIConfig } from '../ai/aiService';

/**
 * AI Configuration Wizard - Provides guided setup for AI providers
 */
export class AIConfigWizard {
    private config: AIServiceConfig;
    private service: any;

    constructor() {
        this.config = getDefaultAIConfig(AIProvider.OPENROUTER);
        this.service = createAIService(this.config);
    }

    /**
     * Start the AI configuration wizard
     */
    async startWizard(): Promise<void> {
        // Step 1: Select provider
        const provider = await this.selectProvider();
        if (!provider) return; // User cancelled

        // Step 2: Configure provider
        await this.configureProvider(provider);
    }

    /**
     * Step 1: Guide user through provider selection
     */
    private async selectProvider(): Promise<AIProvider | undefined> {
        // Show welcome message
        const choice = await vscode.window.showQuickPick([
            {
                label: '🔗 OpenRouter',
                description: 'Access 8+ free AI models (recommended for beginners)',
                detail: 'Google Gemini, DeepSeek, Llama & more via single API key'
            },
            {
                label: '🐳 Ollama',
                description: 'Run AI models locally on your machine',
                detail: 'Private, no API keys needed, requires installation'
            },
            {
                label: '🎭 LM Studio',
                description: 'Another local AI option with nice UI',
                detail: 'Easy model management, runs locally'
            },
            {
                label: '🤖 Google Gemini',
                description: 'Direct access to Google\'s AI models',
                detail: 'Requires Google AI Studio API key'
            },
            {
                label: '🧠 DeepSeek',
                description: 'High-quality reasoning models',
                detail: 'Cost-effective, direct API access'
            },
            {
                label: '🔑 Bring Your Own API',
                description: 'Connect to any OpenAI-compatible API',
                detail: 'Maximum flexibility, supports custom endpoints'
            }
        ], {
            placeHolder: 'Choose your AI provider',
            title: '🦊 TestFox AI Setup Wizard'
        });

        if (!choice) return undefined;

        // Map choice to provider enum
        const providerMap: Record<string, AIProvider> = {
            '🔗 OpenRouter': AIProvider.OPENROUTER,
            '🐳 Ollama': AIProvider.OLLAMA,
            '🎭 LM Studio': AIProvider.LMSTUDIO,
            '🤖 Google Gemini': AIProvider.GOOGLE_GEMINI,
            '🧠 DeepSeek': AIProvider.DEEPSEEK,
            '🔑 Bring Your Own API': AIProvider.BYO_API
        };

        return providerMap[choice.label];
    }

    /**
     * Step 2: Configure the selected provider with guided wizard
     */
    private async configureProvider(provider: AIProvider): Promise<void> {
        switch (provider) {
            case AIProvider.OPENROUTER:
                await this.configureOpenRouter();
                break;
            case AIProvider.OLLAMA:
                await this.configureOllama();
                break;
            case AIProvider.LMSTUDIO:
                await this.configureLMStudio();
                break;
            case AIProvider.GOOGLE_GEMINI:
                await this.configureGoogleGemini();
                break;
            case AIProvider.DEEPSEEK:
                await this.configureDeepSeek();
                break;
            case AIProvider.BYO_API:
                await this.configureBYOApi();
                break;
        }
    }

    /**
     * Configure OpenRouter with guided setup
     */
    private async configureOpenRouter(): Promise<void> {
        // Show helpful intro
        await vscode.window.showInformationMessage(
            '🔗 OpenRouter gives you access to 8+ free AI models including Gemini, DeepSeek, and Llama.',
            'Learn More',
            'Get API Key'
        );

        // Step 1: Get API Key
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your OpenRouter API Key',
            placeHolder: 'sk-or-v1-...',
            password: true,
            validateInput: (value) => {
                if (!value) return 'API key is required';
                if (!value.startsWith('sk-')) return 'OpenRouter keys start with "sk-"';
                return undefined;
            }
        });

        if (!apiKey) {
            vscode.window.showWarningMessage('OpenRouter configuration cancelled.');
            return;
        }

        // Step 2: Select model
        const model = await this.selectOpenRouterModel();
        if (!model) return;

        // Save configuration
        await this.saveConfig(AIProvider.OPENROUTER, apiKey, undefined, model);

        // Test connection
        await this.testConnection(AIProvider.OPENROUTER);
    }

    /**
     * Configure Ollama with automatic model discovery
     */
    private async configureOllama(): Promise<void> {
        // Step 0: Check if Ollama is installed
        const installed = await this.checkOllamaInstalled();
        if (!installed) {
            const installNow = await vscode.window.showInformationMessage(
                '🐳 Ollama is not running on your system.',
                'Learn How to Install',
                'I Have Ollama'
            );

            if (installNow === 'Learn How to Install') {
                vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai'));
                return;
            }
        }

        // Step 1: Enter or confirm base URL
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter your Ollama server URL',
            value: 'http://localhost:11434',
            validateInput: (value) => {
                if (!value) return 'Base URL is required';
                try {
                    new URL(value);
                    return undefined;
                } catch {
                    return 'Invalid URL format';
                }
            }
        });

        if (!baseUrl) {
            vscode.window.showWarningMessage('Ollama configuration cancelled.');
            return;
        }

        // Step 2: Fetch and display available models
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🐳 Fetching Ollama models...',
            cancellable: false
        }, async () => {
            const models = await this.fetchOllamaModels(baseUrl);

            if (models.length === 0) {
                const pullModel = await vscode.window.showWarningMessage(
                    'No models found on your Ollama server.',
                    'Pull a Model',
                    'Enter Model Name Manually'
                );

                if (pullModel === 'Pull a Model') {
                    vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai/models'));
                } else if (pullModel === 'Enter Model Name Manually') {
                    await this.enterOllamaModelManually(baseUrl);
                }
                return;
            }

            // Step 3: Select model from list
            const selectedModel = await vscode.window.showQuickPick(
                models.map(m => ({
                    label: m.name,
                    description: m.size ? `${(m.size / 1024 / 1024).toFixed(1)} MB` : undefined
                })),
                {
                    placeHolder: 'Select an Ollama model',
                    title: '🐳 Available Ollama Models'
                }
            );

            if (!selectedModel) {
                vscode.window.showWarningMessage('Ollama configuration cancelled.');
                return;
            }

            // Save configuration
            await this.saveConfig(AIProvider.OLLAMA, undefined, baseUrl, selectedModel.label);

            // Test connection
            await this.testConnection(AIProvider.OLLAMA);
        });
    }

    /**
     * Configure LM Studio
     */
    private async configureLMStudio(): Promise<void> {
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter your LM Studio server URL',
            value: 'http://localhost:1234',
            validateInput: (value) => {
                if (!value) return 'Base URL is required';
                try {
                    new URL(value);
                    return undefined;
                } catch {
                    return 'Invalid URL format';
                }
            }
        });

        if (!baseUrl) {
            vscode.window.showWarningMessage('LM Studio configuration cancelled.');
            return;
        }

        const model = await vscode.window.showInputBox({
            prompt: 'Enter the model name (from LM Studio)',
            placeHolder: 'e.g., llama-2-7b-chat'
        });

        if (!model) {
            vscode.window.showWarningMessage('LM Studio configuration cancelled.');
            return;
        }

        await this.saveConfig(AIProvider.LMSTUDIO, undefined, baseUrl, model);
        await this.testConnection(AIProvider.LMSTUDIO);
    }

    /**
     * Configure Google Gemini
     */
    private async configureGoogleGemini(): Promise<void> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Google Gemini API Key',
            placeHolder: 'AIza...',
            password: true,
            validateInput: (value) => {
                if (!value) return 'API key is required';
                if (!value.startsWith('AIza')) return 'Google API keys start with "AIza"';
                return undefined;
            }
        });

        if (!apiKey) {
            vscode.window.showWarningMessage('Google Gemini configuration cancelled.');
            return;
        }

        const model = await vscode.window.showQuickPick([
            { label: 'gemini-1.5-flash', description: 'Fast and efficient' },
            { label: 'gemini-1.5-pro', description: 'Advanced reasoning' },
            { label: 'gemini-1.0-pro', description: 'Stable release' }
        ], {
            placeHolder: 'Select a model',
            title: '🤖 Google Gemini Models'
        });

        if (!model) return;

        await this.saveConfig(AIProvider.GOOGLE_GEMINI, apiKey, 'https://generativelanguage.googleapis.com/v1beta', model.label);
        await this.testConnection(AIProvider.GOOGLE_GEMINI);
    }

    /**
     * Configure DeepSeek
     */
    private async configureDeepSeek(): Promise<void> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your DeepSeek API Key',
            placeHolder: 'sk-...',
            password: true,
            validateInput: (value) => {
                if (!value) return 'API key is required';
                return undefined;
            }
        });

        if (!apiKey) {
            vscode.window.showWarningMessage('DeepSeek configuration cancelled.');
            return;
        }

        const model = await vscode.window.showQuickPick([
            { label: 'deepseek-chat', description: 'General purpose chat' },
            { label: 'deepseek-coder', description: 'Optimized for code' }
        ], {
            placeHolder: 'Select a model',
            title: '🧠 DeepSeek Models'
        });

        if (!model) return;

        await this.saveConfig(AIProvider.DEEPSEEK, apiKey, 'https://api.deepseek.com/v1', model.label);
        await this.testConnection(AIProvider.DEEPSEEK);
    }

    /**
     * Configure BYO API
     */
    private async configureBYOApi(): Promise<void> {
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter your API base URL',
            placeHolder: 'https://api.openai.com/v1',
            validateInput: (value) => {
                if (!value) return 'Base URL is required';
                try {
                    new URL(value);
                    return undefined;
                } catch {
                    return 'Invalid URL format';
                }
            }
        });

        if (!baseUrl) return;

        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your API key',
            password: true
        });

        if (!apiKey) return;

        const model = await vscode.window.showInputBox({
            prompt: 'Enter the model name',
            placeHolder: 'gpt-3.5-turbo'
        });

        if (!model) return;

        await this.saveConfig(AIProvider.BYO_API, apiKey, baseUrl, model);
        await this.testConnection(AIProvider.BYO_API);
    }

    /**
     * Helper: Check if Ollama is installed
     */
    private async checkOllamaInstalled(): Promise<boolean> {
        try {
            const response = await fetch('http://localhost:11434/api/tags', { method: 'GET' });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Helper: Fetch available Ollama models
     */
    private async fetchOllamaModels(baseUrl: string): Promise<any[]> {
        try {
            const response = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
            if (!response.ok) return [];

            const data = await response.json();
            return data.models || [];
        } catch {
            return [];
        }
    }

    /**
     * Helper: Enter Ollama model manually
     */
    private async enterOllamaModelManually(baseUrl: string): Promise<void> {
        const model = await vscode.window.showInputBox({
            prompt: 'Enter the Ollama model name',
            placeHolder: 'llama2, codellama, mistral, etc.',
            validateInput: (value) => {
                if (!value) return 'Model name is required';
                return undefined;
            }
        });

        if (!model) return;

        await this.saveConfig(AIProvider.OLLAMA, undefined, baseUrl, model);
        await this.testConnection(AIProvider.OLLAMA);
    }

    /**
     * Helper: Select OpenRouter model
     */
    private async selectOpenRouterModel(): Promise<string | undefined> {
        return await vscode.window.showQuickPick([
            { label: 'google/gemini-2.0-flash-exp:free', description: '⭐ Best free model - Fast & powerful' },
            { label: 'deepseek/deepseek-r1:free', description: '🧠 Advanced reasoning' },
            { label: 'meta-llama/llama-3.3-70b-instruct:free', description: '🔥 Large context, open source' },
            { label: 'anthropic/claude-3.5-sonnet', description: '👑 Best overall quality (paid)' },
            { label: 'openai/gpt-4o', description: '🤖 Industry standard (paid)' }
        ], {
            placeHolder: 'Select an AI model',
            title: '🔗 OpenRouter Models'
        })?.then(choice => choice?.label);
    }

    /**
     * Helper: Save configuration
     */
    private async saveConfig(provider: AIProvider, apiKey?: string, baseUrl?: string, model?: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('testfox.ai');

        if (apiKey) {
            await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        }

        if (baseUrl) {
            await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Global);
        }

        if (model) {
            await config.update('model', model, vscode.ConfigurationTarget.Global);
        }

        await config.update('provider', provider, vscode.ConfigurationTarget.Global);

        // Mark setup as completed
        const globalConfig = vscode.workspace.getConfiguration('testfox');
        await globalConfig.update('setupCompleted', true, vscode.ConfigurationTarget.Global);
    }

    /**
     * Helper: Test connection
     */
    private async testConnection(provider: AIProvider): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing connection...',
            cancellable: false
        }, async () => {
            // Small delay to allow configuration to save
            await new Promise(resolve => setTimeout(resolve, 500));

            const service = createAIService({
                provider,
                apiKey: vscode.workspace.getConfiguration('testfox.ai').get<string>('apiKey'),
                baseUrl: vscode.workspace.getConfiguration('testfox.ai').get<string>('baseUrl'),
                model: vscode.workspace.getConfiguration('testfox.ai').get<string>('model')
            });

            const available = await service.isAvailable();

            if (available) {
                await vscode.window.showInformationMessage('✅ AI configured successfully!');
            } else {
                const retry = await vscode.window.showErrorMessage(
                    '❌ Connection failed. Please check your configuration.',
                    'Retry',
                    'Open Settings'
                );

                if (retry === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.ai');
                }
            }
        });
    }
}
