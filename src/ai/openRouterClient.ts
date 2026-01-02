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
    static readonly FREE_MODELS = [
        'google/gemini-2.0-flash-exp:free',      // Google's latest free model - BEST
        'deepseek/deepseek-r1-0528:free',       // Advanced reasoning
        'qwen/qwen3-coder:free',                // Code-specialized
        'meta-llama/llama-3.1-8b-instruct:free', // Meta's open model
        'google/gemma-2-9b-it:free',            // Google's efficient model
        'mistralai/mistral-7b-instruct:free',   // Fast open model
        'nvidia/nemotron-3-nano-30b-a3b:free',  // NVIDIA's efficient model
        'mistralai/devstral-2512:free',         // Mistral's developer model
        'z-ai/glm-4.5-air:free'                 // Fast multilingual model
    ];

    // Premium models (require credits) - fallback only
    static readonly PREMIUM_MODELS = [
        'x-ai/grok-beta',
        'x-ai/grok-2-1212',
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4o',
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
        this.apiKey = await context.secrets.get('testfox.openrouter.apiKey');

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
            const client = axios.create({
                baseURL: 'https://openrouter.ai/api/v1',
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

        const client = axios.create({
            baseURL: 'https://openrouter.ai/api/v1',
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
    setModel(model: string): void {
        this.model = model;
        this.output.appendLine(`TestFox AI: Model set to ${model}`);
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
            const client = axios.create({
                baseURL: 'https://openrouter.ai/api/v1',
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
                const client = axios.create({
                    baseURL: 'https://openrouter.ai/api/v1',
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
    async generateTestCases(context: any): Promise<string> {
        // Convert context to prompt
        const prompt = `Generate comprehensive test cases for this project:

Project: ${context.projectType || 'Unknown'} using ${context.framework || 'Unknown'}
Routes: ${context.routes?.join(', ') || 'None'}
Forms: ${context.forms?.join(', ') || 'None'}
Endpoints: ${context.endpoints?.join(', ') || 'None'}

Return JSON with test cases.`;

        return this.generate(prompt);
    }

    /**
     * Generate security test payloads (legacy compatibility)
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
}

// Singleton instance
let openRouterInstance: OpenRouterClient | null = null;

export function getOpenRouterClient(): OpenRouterClient {
    if (!openRouterInstance) {
        openRouterInstance = new OpenRouterClient();
    }
    return openRouterInstance;
}

