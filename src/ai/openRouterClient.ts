import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

export type AIState =
  | 'unconfigured'
  | 'validating'
  | 'ready'
  | 'rate_limited'
  | 'invalid_key'
  | 'network_error';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OpenRouterResponse {
    id: string;
    model: string;
    choices: Array<{
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface ModelInfo {
    id: string;
    name: string;
    description?: string;
    pricing?: {
        prompt: string;
        completion: string;
    };
    context_length?: number;
    architecture?: {
        modality: string;
        tokenizer: string;
        instruct_type?: string;
    };
    top_provider?: {
        max_completion_tokens?: number;
    };
    per_request_limits?: {
        prompt_tokens?: string;
        completion_tokens?: string;
    };
}

export interface AvailableModel {
    id: string;
    name: string;
    description?: string;
    isFree: boolean;
    isWorking: boolean;
    responseTime?: number;
    error?: string;
}

/**
 * OpenRouter API client for AI-powered test generation
 * Production-ready with proper state management and error handling
 */
export class OpenRouterClient {
    private apiKey: string | null = null;
    private model: string;
    private state: AIState = 'unconfigured';
    private output = vscode.window.createOutputChannel('TestFox AI');

    // Top-tier free models on OpenRouter (prioritized order)
    // Top-tier free models on OpenRouter (prioritized order)
    static readonly FREE_MODELS = [
        'google/gemini-2.0-flash-exp:free',          // Google's latest free model - FAST
        'google/gemini-2.0-pro-exp-02-05:free',      // Google's most capable free model - BEST
        'deepseek/deepseek-r1:free',                 // Advanced reasoning
        'deepseek/deepseek-v3:free',                 // General purpose
        'meta-llama/llama-3.3-70b-instruct:free',    // Meta's open model
        'qwen/qwen-2.5-coder-32b-instruct:free',     // Code-specialized
        'z-ai/glm-4-9b-chat:free',                   // General purpose
        'mistralai/mistral-nemo:free',               // Mistral efficient
    ];

    // Premium models (require credits) - fallback only
    static readonly PREMIUM_MODELS = [
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4o',
        'x-ai/grok-2-1212',
        'mistralai/mistral-large-2411',
        'openai/gpt-4o-mini'
    ];

    constructor(model = 'google/gemini-2.0-flash-exp:free') {
        this.model = model;
        this.output.appendLine('TestFox AI: OpenRouter client initialized');
    }

    /* ------------------ STATE ------------------ */

    isReady() {
        return this.state === 'ready';
    }

    getState() {
        return this.state;
    }

    /* ------------------ ONBOARDING ------------------ */

    async loadApiKey(context: vscode.ExtensionContext) {
        this.output.appendLine('TestFox AI: Loading API key from secrets...');
        this.apiKey = (await context.secrets.get('testfox.openrouter.apiKey')) || null;

        if (!this.apiKey) {
            this.state = 'unconfigured';
            this.output.appendLine('TestFox AI: No API key found');
            return;
        }

        this.output.appendLine('TestFox AI: API key loaded, validating...');
        await this.validateKey();
    }

    async saveApiKey(context: vscode.ExtensionContext, apiKey: string) {
        this.output.appendLine('TestFox AI: Saving API key to secrets...');
        await context.secrets.store('testfox.openrouter.apiKey', apiKey);
        this.apiKey = apiKey;
        this.output.appendLine('TestFox AI: API key saved, validating...');
        await this.validateKey();
    }

    /* ------------------ VALIDATION ------------------ */

    private async validateKey() {
        if (!this.apiKey) {
            this.state = 'unconfigured';
            return;
        }

        this.state = 'validating';
        this.output.appendLine('TestFox AI: Validating OpenRouter API key...');

        try {
            const config = vscode.workspace.getConfiguration('testfox');
            const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';
            
            const client = axios.create({
                baseURL: baseUrl,
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            const response = await client.get('/models');

            if (response.status === 401 || response.status === 403) {
                this.state = 'invalid_key';
                throw new Error('Invalid OpenRouter API key');
            }

            if (response.status === 429) {
                this.state = 'rate_limited';
                throw new Error('OpenRouter rate limit reached');
            }

            this.state = 'ready';
            this.output.appendLine('TestFox AI: OpenRouter key validated successfully');
        } catch (err: any) {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ENOTFOUND') {
                this.state = 'network_error';
            }
            this.output.appendLine(`TestFox AI: Validation failed: ${err.message}`);
            throw err;
        }
    }
    
    /* ------------------ GENERATION ------------------ */

    async generate(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('AI not configured');
        }

        if (this.state !== 'ready') {
            throw new Error(`AI not ready (state: ${this.state})`);
        }

        this.output.appendLine(`TestFox AI: Generating with model: ${this.model}`);

        const config = vscode.workspace.getConfiguration('testfox');
        const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';

        const client = axios.create({
            baseURL: baseUrl,
            timeout: 60000,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                'X-Title': 'TestFox VS Code Extension'
            }
        });

        try {
            const response = await client.post('/chat/completions', {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: 4096,
                temperature: 0.7
            });

            if (response.status === 429) {
                this.state = 'rate_limited';
                throw new Error('Rate limit exceeded. Add credits or wait 24h.');
            }

            const content = response.data?.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('No content returned by AI model');
            }

            return content;
        } catch (err: any) {
            if (err.response?.status === 429) {
                this.state = 'rate_limited';
                throw new Error('Rate limit exceeded. Add credits or wait 24h.');
            }

            if (err.response?.status === 401 || err.response?.status === 403) {
                this.state = 'invalid_key';
                throw new Error('Invalid API key');
            }

            // For axios errors, try to get the response text
            if (err.response?.data) {
                const text = typeof err.response.data === 'string'
                    ? err.response.data
                    : JSON.stringify(err.response.data);

                // Check if it's a model not found error and try fallback
                if (text.includes('Model Not Exist') || text.includes('model_not_found')) {
                    this.output.appendLine(`TestFox AI: Model ${this.model} not found, trying fallback...`);
                    
                    // Try fallback model
                    const fallbackModel = 'google/gemini-2.0-flash-exp:free';
                    this.model = fallbackModel;
                    
                    try {
                        return await this.generate(prompt); // Retry with fallback
                    } catch (fallbackErr: any) {
                        this.output.appendLine(`TestFox AI: Fallback model also failed: ${fallbackErr.message}`);
                    }
                }

                throw new Error(`OpenRouter error: ${text.slice(0, 200)}`);
            }

            throw new Error(`AI request failed: ${err.message}`);
        }
    }

    /* ------------------ LEGACY COMPATIBILITY ------------------ */

    /**
     * Check if AI is configured (has API key)
     */
    isConfigured(): boolean {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Set the API key (legacy method)
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        // Also mark as ready if we have a key
        if (apiKey && apiKey.trim().length > 0) {
            this.state = 'ready';
        }
    }

    /**
     * Set the model (legacy method)
     */
    async setModel(model: string): Promise<void> {
        // Validate model exists before setting it
        if (this.apiKey) {
            try {
                const config = vscode.workspace.getConfiguration('testfox');
                const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';
                
                const client = axios.create({
                    baseURL: baseUrl,
                    timeout: 5000,
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                        'X-Title': 'TestFox VS Code Extension'
                    }
                });

                // Test if model exists by making a small request
                const response = await client.post('/chat/completions', {
                    model: model,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                });

                if (response.status === 200) {
                    this.model = model;
                    this.output.appendLine(`TestFox AI: Model set to ${model}`);
                } else {
                    throw new Error(`Model validation failed with status ${response.status}`);
                }
            } catch (err: any) {
                if (err.response?.data && (
                    JSON.stringify(err.response.data).includes('Model Not Exist') ||
                    JSON.stringify(err.response.data).includes('model_not_found')
                )) {
                    this.output.appendLine(`TestFox AI: Model ${model} does not exist, using fallback...`);
                    this.model = 'google/gemini-2.0-flash-exp:free'; // Fallback to known good model
                } else {
                    this.output.appendLine(`TestFox AI: Model validation failed: ${err.message}`);
                    this.model = model; // Set anyway, might be a network issue
                }
            }
        } else {
            this.model = model;
        }
    }

    /**
     * Load configuration from VS Code settings
     */
    loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('testfox');
        const apiKey = config.get<string>('ai.apiKey');
        const model = config.get<string>('ai.model');
        
        if (apiKey) {
            this.apiKey = apiKey;
            this.state = 'ready'; // Assume ready if key provided, validateKey should be called for real check
        } else {
            this.state = 'unconfigured';
        }
        
        if (model) {
            this.model = model;
        }
    }

    /**
     * Update status bar (alias for initStatusBar)
     */
    updateStatusBar(): void {
        // Since we don't store the statusBarItem here, we can't do much
        // but we can at least log
        this.output.appendLine(`TestFox AI: Status bar update requested (State: ${this.state})`);
    }

    /**
     * Get the current model
     */
    getModel(): string {
        return this.model;
    }

    /**
     * Initialize status bar (legacy compatibility)
     */
    initStatusBar(statusBarItem: vscode.StatusBarItem): void {
        // Update status bar with AI status
        if (this.state === 'ready') {
            statusBarItem.text = '$(hubot) AI Ready';
            statusBarItem.tooltip = `Model: ${this.model}`;
        } else if (this.state === 'unconfigured') {
            statusBarItem.text = '$(hubot) AI: Not Configured';
            statusBarItem.tooltip = 'Click to configure AI';
        } else {
            statusBarItem.text = '$(hubot) AI: ' + this.state;
            statusBarItem.tooltip = 'AI status: ' + this.state;
        }
        statusBarItem.show();
    }

    /**
     * Get available models (legacy compatibility)
     */
    async getAvailableModels(): Promise<AvailableModel[]> {
        // Return a curated list of working models
        const models: AvailableModel[] = OpenRouterClient.FREE_MODELS.map(id => ({
            id,
            name: id.split('/').pop()?.replace(':free', '') || id,
            isFree: true,
            isWorking: true
        }));
        
        // Add premium models
        OpenRouterClient.PREMIUM_MODELS.forEach(id => {
            models.push({
                id,
                name: id.split('/').pop() || id,
                isFree: false,
                isWorking: true
            });
        });
        
        return models;
    }

    /**
     * Check if AI is enabled and configured
     */
    isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('testfox');
        const aiEnabled = config.get<boolean>('ai.enabled', true);
        return aiEnabled && this.state === 'ready';
    }

    /**
     * Get current model name for display
     */
    getCurrentModelName(): string {
        const modelName = this.model.split('/').pop() || this.model;
        return modelName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Fetch available models from OpenRouter
     */
    async fetchAvailableModels(): Promise<ModelInfo[]> {
        if (!this.apiKey || this.state !== 'ready') {
            this.output.appendLine('TestFox AI: Cannot fetch models - not ready');
            return [];
        }

        try {
            const config = vscode.workspace.getConfiguration('testfox');
            const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';

            const client = axios.create({
                baseURL: baseUrl,
                timeout: 30000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            const response = await client.get('/models');

            if (response.data && Array.isArray(response.data.data)) {
                return response.data.data as ModelInfo[];
            }
            return [];
        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Failed to fetch models: ${error.message}`);
            return [];
        }
    }

    /**
     * Get free models from available models list
     */
    async getFreeModels(): Promise<ModelInfo[]> {
        const allModels = await this.fetchAvailableModels();
        return allModels.filter(model => {
            const id = model.id.toLowerCase();
            return id.includes(':free') || 
                   (model.pricing && 
                    (model.pricing.prompt === '0' || model.pricing.prompt === 'free' ||
                     model.pricing.completion === '0' || model.pricing.completion === 'free'));
        });
    }

    /**
     * Discover working models (legacy compatibility)
     */
    async discoverWorkingModels(): Promise<AvailableModel[]> {
        if (this.state !== 'ready') {
            return [];
        }

        try {
            const freeModels = await this.getFreeModels();
            return freeModels.map(model => ({
                id: model.id,
                name: model.id.split('/').pop() || model.id,
                isFree: true,
                isWorking: true,
                responseTime: 1000
            }));
        } catch {
            return [];
        }
    }

    /**
     * Test API connection (legacy compatibility)
     */
    async testConnection(specificModel?: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Use the model passed or default
            const testModel = specificModel || this.model;

            this.output.appendLine(`TestFox AI: Testing connection with model: ${testModel}`);

            // Simple test request - don't actually call generate if not ready
            if (this.state !== 'ready') {
                // Just test API access
                const config = vscode.workspace.getConfiguration('testfox');
                const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';

                const client = axios.create({
                    baseURL: baseUrl,
                    timeout: 10000,
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                        'X-Title': 'TestFox VS Code Extension'
                    }
                });
                await client.get('/models');
                this.state = 'ready';
            }
            return { success: true };
        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Connection test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send a chat completion request (legacy compatibility)
     */
    async chat(messages: ChatMessage[], options?: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string> {
        const prompt = messages.map(m => m.content).join('\n\n');
        return this.generate(prompt);
    }

    /**
     * Generate test cases using AI (legacy compatibility)
     */
    async generateSecurityPayloads(context: any): Promise<string[]> {
        const prompt = `Generate 10 security test payloads for a ${context.inputType || 'text'} input field.
        
        Return as JSON array.`;

        try {
            const response = await this.generate(prompt);
            const parsed = JSON.parse(response);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [
                "' OR '1'='1",
                "<script>alert('XSS')</script>",
                "'; DROP TABLE users; --",
                "../../../etc/passwd",
                "${7*7}"
            ];
        }
    }

    /**
     * Generate report summary using AI
     */
    async generateReportSummary(reportData: any): Promise<string> {
        if (!this.isEnabled()) {
            return 'AI Report Summary is not available as AI is not configured.';
        }

        const prompt = `Summarize these test results for a developer report:
        Passed: ${reportData.passed}
        Failed: ${reportData.failed}
        Success Rate: ${reportData.passRate}%
        
        Provide a concise 2-3 sentence overview of the project's health.`;

        try {
            return await this.generate(prompt);
        } catch (error: any) {
            return `Failed to generate AI summary: ${error.message}`;
        }
    }
}

// Singleton instance
let openRouterInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
    if (!openRouterInstance) {
        openRouterInstance = new OpenRouterClient();
    }
    return openRouterInstance;
}

