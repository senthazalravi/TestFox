import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * OpenRouter Service - AI-powered test generation using OpenRouter API
 * Uses native fetch API for requests
 */
export interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | OpenRouterContent[];
}

export interface OpenRouterContent {
    type: 'text' | 'image_url' | 'input_audio' | 'video_url';
    text?: string;
    image_url?: {
        url: string;
    };
    input_audio?: {
        data: string;
        format: string;
    };
    video_url?: {
        url: string;
    };
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

export class OpenRouterService {
    private apiKey: string | null = null;
    private baseUrl = 'https://openrouter.ai/api/v1';
    private model: string;
    private httpReferer: string;
    private siteName: string;
    private outputChannel: vscode.OutputChannel;

    constructor(model = 'google/gemini-2.0-flash-exp:free') {
        this.model = model;
        this.httpReferer = 'https://testfox.dev';
        this.siteName = 'TestFox';
        this.outputChannel = vscode.window.createOutputChannel('TestFox OpenRouter');
        
        // Load API key from .env file
        this.loadApiKeyFromEnv();
    }

    /**
     * Parse .env file content into key-value pairs
     */
    private parseEnvFile(content: string): Record<string, string> {
        const env: Record<string, string> = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (match) {
                const key = match[1];
                let value = match[2].trim();
                
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                
                env[key] = value;
            }
        }
        
        return env;
    }

    /**
     * Load API key from .env file in workspace or extension directory
     */
    private loadApiKeyFromEnv(): void {
        try {
            // Try to load from workspace .env
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
                if (fs.existsSync(envPath)) {
                    const envConfig = this.parseEnvFile(fs.readFileSync(envPath, 'utf8'));
                    if (envConfig.OPENROUTER_API_KEY) {
                        this.apiKey = envConfig.OPENROUTER_API_KEY;
                        this.outputChannel.appendLine('✅ OpenRouter API key loaded from workspace .env');
                    }
                    if (envConfig.OPENROUTER_HTTP_REFERER) {
                        this.httpReferer = envConfig.OPENROUTER_HTTP_REFERER;
                    }
                    if (envConfig.OPENROUTER_SITE_NAME) {
                        this.siteName = envConfig.OPENROUTER_SITE_NAME;
                    }
                    if (envConfig.OPENROUTER_MODEL) {
                        this.model = envConfig.OPENROUTER_MODEL;
                    }
                }
            }

            // Fallback: try extension directory
            if (!this.apiKey) {
                const extensionPath = vscode.extensions.getExtension('TestFox.testfox')?.extensionPath;
                if (extensionPath) {
                    const envPath = path.join(extensionPath, '.env');
                    if (fs.existsSync(envPath)) {
                        const envConfig = this.parseEnvFile(fs.readFileSync(envPath, 'utf8'));
                        if (envConfig.OPENROUTER_API_KEY) {
                            this.apiKey = envConfig.OPENROUTER_API_KEY;
                            this.outputChannel.appendLine('✅ OpenRouter API key loaded from extension .env');
                        }
                    }
                }
            }

            if (!this.apiKey) {
                this.outputChannel.appendLine('⚠️ No OpenRouter API key found in .env file');
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Error loading .env file: ${error.message}`);
        }
    }

    /**
     * Check if API key is configured
     */
    isConfigured(): boolean {
        return !!this.apiKey && this.apiKey.length > 0;
    }

    /**
     * Set API key manually
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.outputChannel.appendLine('✅ OpenRouter API key set manually');
    }

    /**
     * Get current model
     */
    getModel(): string {
        return this.model;
    }

    /**
     * Set model
     */
    setModel(model: string): void {
        this.model = model;
        this.outputChannel.appendLine(`📝 Model set to: ${model}`);
    }

    /**
     * Send chat completion request using fetch API
     */
    async chatCompletion(
        messages: OpenRouterMessage[],
        options?: {
            model?: string;
            maxTokens?: number;
            temperature?: number;
        }
    ): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY in .env file');
        }

        const model = options?.model || this.model;
        const maxTokens = options?.maxTokens || 4000;
        const temperature = options?.temperature || 0.7;

        this.outputChannel.appendLine(`🚀 Sending request to OpenRouter (model: ${model})...`);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.httpReferer,
                    'X-OpenRouter-Title': this.siteName,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as OpenRouterResponse;

            if (!data.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from OpenRouter API');
            }

            const content = data.choices[0].message.content;
            const tokens = data.usage?.total_tokens || 0;
            
            this.outputChannel.appendLine(`✅ Response received (${tokens} tokens)`);
            
            return content;
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ OpenRouter request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate test cases for a component/feature
     */
    async generateTestCases(context: {
        name: string;
        type: string;
        description?: string;
        framework?: string;
    }): Promise<string> {
        const messages: OpenRouterMessage[] = [
            {
                role: 'system',
                content: 'You are TestFox AI, an expert software testing assistant. Generate comprehensive test cases in a structured format.'
            },
            {
                role: 'user',
                content: `Generate comprehensive test cases for the following:

Component: ${context.name}
Type: ${context.type}
Framework: ${context.framework || 'Unknown'}
Description: ${context.description || 'No description provided'}

Please generate test cases covering:
1. Functional tests (positive scenarios)
2. Edge cases and boundary conditions
3. Error handling and negative tests
4. Security tests (OWASP Top 10 considerations)
5. Performance considerations

Format the response as a structured test plan with clear steps and expected results.`
            }
        ];

        return this.chatCompletion(messages);
    }

    /**
     * Generate test code (e.g., Playwright, Selenium, etc.)
     */
    async generateTestCode(
        testDescription: string,
        framework: 'playwright' | 'selenium' | 'cypress' | 'jest' = 'playwright'
    ): Promise<string> {
        const messages: OpenRouterMessage[] = [
            {
                role: 'system',
                content: `You are an expert test automation engineer. Generate production-ready ${framework} test code.`
            },
            {
                role: 'user',
                content: `Generate ${framework} test code for the following test scenario:

${testDescription}

Requirements:
1. Use best practices for ${framework}
2. Include proper error handling
3. Add meaningful comments
4. Follow Page Object Model pattern if applicable
5. Include necessary imports and setup
6. Make the code ready to run with minimal modifications`
            }
        ];

        return this.chatCompletion(messages);
    }

    /**
     * Analyze code for testability and suggest improvements
     */
    async analyzeCodeForTestability(code: string, language: string): Promise<string> {
        const messages: OpenRouterMessage[] = [
            {
                role: 'system',
                content: 'You are a code quality expert. Analyze code for testability and provide actionable recommendations.'
            },
            {
                role: 'user',
                content: `Analyze the following ${language} code for testability:

\`\`\`${language}
${code}
\`\`\`

Please provide:
1. Testability score (1-10) with explanation
2. Specific areas that need refactoring for better testing
3. Suggested test cases based on the code structure
4. Recommendations for dependency injection or mocking
5. Any security concerns that should be tested`
            }
        ];

        return this.chatCompletion(messages);
    }

    /**
     * Test the API connection
     */
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        if (!this.apiKey) {
            return { success: false, error: 'API key not configured' };
        }

        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.httpReferer,
                    'X-OpenRouter-Title': this.siteName,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { 
                    success: false, 
                    error: `API request failed (${response.status}): ${errorText}` 
                };
            }

            // Test with a minimal chat completion
            const chatResponse = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.httpReferer,
                    'X-OpenRouter-Title': this.siteName,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 5
                })
            });

            if (!chatResponse.ok) {
                const errorText = await chatResponse.text();
                return { 
                    success: false, 
                    error: `Chat completion failed (${chatResponse.status}): ${errorText}` 
                };
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get available models from OpenRouter
     */
    async getAvailableModels(): Promise<Array<{ id: string; name: string; description: string }>> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey || ''}`,
                    'HTTP-Referer': this.httpReferer,
                    'X-OpenRouter-Title': this.siteName,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json() as { data: Array<{ id: string; name?: string; description?: string }> };
            
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.name || model.id,
                description: model.description || ''
            }));
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Failed to get models: ${error.message}`);
            // Return default free models
            return [
                { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', description: 'Fast, free model from Google' },
                { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', description: 'Advanced reasoning model' },
                { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', description: 'Meta open model' }
            ];
        }
    }

    /**
     * Stream chat completion (for real-time responses)
     */
    async *streamChatCompletion(
        messages: OpenRouterMessage[],
        options?: {
            model?: string;
            maxTokens?: number;
            temperature?: number;
        }
    ): AsyncGenerator<string, void, unknown> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        const model = options?.model || this.model;
        const maxTokens = options?.maxTokens || 4000;
        const temperature = options?.temperature || 0.7;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.httpReferer,
                    'X-OpenRouter-Title': this.siteName,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`Stream request failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body available for streaming');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') return;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Stream error: ${error.message}`);
            throw error;
        }
    }
}

// Singleton instance
let openRouterService: OpenRouterService | null = null;

export function getOpenRouterService(): OpenRouterService {
    if (!openRouterService) {
        openRouterService = new OpenRouterService();
    }
    return openRouterService;
}

export function resetOpenRouterService(): void {
    openRouterService = null;
}
