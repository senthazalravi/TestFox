import * as vscode from 'vscode';
import { getOpenRouterClient } from './openRouterClient';
import { checkAndRecordUsage, PremiumService, PremiumFeature } from '../premium/premiumService';
import { ContextAnalyzer } from '../core/contextAnalyzer';

/**
 * AI Provider Types
 */
export enum AIProvider {
    OPENROUTER = 'openrouter',
    GOOGLE_GEMINI = 'google-gemini',
    DEEPSEEK = 'deepseek',
    OLLAMA = 'ollama',
    LMSTUDIO = 'lmstudio',
    BYO_API = 'byo-api'
}

/**
 * AI Model Configuration
 */
export interface AIModel {
    id: string;
    name: string;
    provider: AIProvider;
    contextLength: number;
    pricing?: {
        prompt: number; // per 1M tokens
        completion: number; // per 1M tokens
    };
    capabilities: string[];
}

/**
 * AI Service Configuration
 */
export interface AIServiceConfig {
    provider: AIProvider;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * AI Generation Request
 */
export interface AIGenerationRequest {
    type: 'test-cases' | 'test-details' | 'payloads' | 'analysis';
    context: any;
    prompt: string;
    options?: {
        temperature?: number;
        maxTokens?: number;
        model?: string;
    };
}

/**
 * AI Service Response
 */
export interface AIServiceResponse {
    success: boolean;
    data?: any;
    error?: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}

/**
 * Comprehensive AI Service for TestFox
 * Supports multiple AI providers with unified interface
 */
export class AIService {
    private config: AIServiceConfig;
    private openRouterClient = getOpenRouterClient();
    private contextAnalyzer = new ContextAnalyzer();
    private premiumService = PremiumService.getInstance();

    constructor(config: AIServiceConfig) {
        this.config = config;
        this.initializeProvider();
    }

    /**
     * Initialize the AI provider
     */
    private initializeProvider(): void {
        switch (this.config.provider) {
            case AIProvider.OPENROUTER:
                if (this.config.apiKey) {
                    this.openRouterClient.setApiKey(this.config.apiKey);
                }
                if (this.config.model) {
                    this.openRouterClient.setModel(this.config.model);
                }
                break;

            case AIProvider.DEEPSEEK:
                // Initialize DeepSeek client
                console.log('🧠 AI Service: Initializing DeepSeek client');
                break;

            case AIProvider.OLLAMA:
                // Initialize Ollama client
                console.log('🧠 AI Service: Initializing Ollama client');
                break;

            case AIProvider.LMSTUDIO:
                // Initialize LMStudio client
                console.log('🧠 AI Service: Initializing LMStudio client');
                break;

            case AIProvider.BYO_API:
                // Initialize BYO API client
                console.log('🧠 AI Service: Initializing BYO API client');
                break;

            default:
                throw new Error(`Unsupported AI provider: ${this.config.provider}`);
        }
    }

    /**
     * Update service configuration
     */
    updateConfig(config: Partial<AIServiceConfig>): void {
        this.config = { ...this.config, ...config };
        this.initializeProvider();
    }

    /**
     * Check if the AI service is available and configured
     */
    async isAvailable(): Promise<boolean> {
        try {
            switch (this.config.provider) {
            case AIProvider.OPENROUTER:
                return await this.checkOpenRouterAvailability();

                case AIProvider.GOOGLE_GEMINI:
                    return await this.checkGoogleGeminiAvailability();

                case AIProvider.DEEPSEEK:
                    return await this.checkDeepSeekAvailability();

                case AIProvider.OLLAMA:
                    return await this.checkOllamaAvailability();

                case AIProvider.LMSTUDIO:
                    return await this.checkLMStudioAvailability();

                case AIProvider.BYO_API:
                    return await this.checkBYOApiAvailability();

                default:
                    return false;
            }
        } catch (error) {
            console.error('❌ AI Service: Availability check failed:', error);
            return false;
        }
    }

    /**
     * Generate content using AI with enhanced context analysis
     */
    async generate(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            // Check usage limits before proceeding
            if (!checkAndRecordUsage('aiRequests')) {
                return {
                    success: false,
                    error: 'AI request limit exceeded. Upgrade to Pro for unlimited AI generation.'
                };
            }

            console.log(`🤖 AI Service: Generating ${request.type} using ${this.config.provider} with context analysis`);

            console.log(`🤖 AI Service: Generating ${request.type} using ${this.config.provider}`);

            switch (this.config.provider) {
                case AIProvider.OPENROUTER:
                    return await this.generateWithOpenRouter(request);

                case AIProvider.GOOGLE_GEMINI:
                    return await this.generateWithGoogleGemini(request);

                case AIProvider.DEEPSEEK:
                    return await this.generateWithDeepSeek(request);

                case AIProvider.OLLAMA:
                    return await this.generateWithOllama(request);

                case AIProvider.LMSTUDIO:
                    return await this.generateWithLMStudio(request);

                case AIProvider.BYO_API:
                    return await this.generateWithBYOApi(request);

                default:
                    throw new Error(`Unsupported provider: ${this.config.provider}`);
            }
        } catch (error) {
            console.error('❌ AI Service: Generation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown AI service error'
            };
        }
    }

    /**
     * Generate tests with enhanced context analysis
     */
    async generateTestsWithContext(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            console.log('🔍 AI Service: Starting context-aware test generation');

            // Check if premium feature is available
            if (!this.premiumService.isFeatureAvailable(PremiumFeature.ADVANCED_ANALYTICS)) {
                console.log('⚠️ AI Service: Advanced analytics not available, using basic generation');
            }

            // Analyze application context if available
            let contextData = {};
            if (request.context?.pageContexts || request.context?.projectInfo) {
                contextData = {
                    pageContexts: request.context.pageContexts || [],
                    projectInfo: request.context.projectInfo || {},
                    documentation: request.context.documentation || '',
                    coreLogic: request.context.coreLogic || ''
                };
                console.log('📊 AI Service: Context data available for enhanced generation');
            }

            // Generate enhanced prompt with context
            const enhancedPrompt = this.buildEnhancedPrompt(request, contextData);

            // Create enhanced request
            const enhancedRequest: AIGenerationRequest = {
                ...request,
                prompt: enhancedPrompt,
                context: {
                    ...request.context,
                    ...contextData
                }
            };

            console.log('🚀 AI Service: Calling AI with enhanced context');
            return await this.generate(enhancedRequest);

        } catch (error) {
            console.error('❌ AI Service: Context-aware generation failed:', error);
            // Fallback to basic generation
            return await this.generate(request);
        }
    }

    /**
     * Generate test cases using OpenRouter with enhanced context
     */
    private async generateTestCasesWithContext(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            // Build enhanced prompt
            const enhancedPrompt = this.buildEnhancedPrompt(request, request.context || {});

            // Generate test cases using the enhanced prompt
            const response = await this.openRouterClient.generateTestCases({
                ...request.context,
                prompt: enhancedPrompt
            });

            // Parse JSON response safely
            try {
                const parsed = JSON.parse(response);
                return { success: true, data: parsed };
            } catch (parseError) {
                console.error('❌ OpenRouter: JSON parse error:', parseError);
                console.error('❌ OpenRouter: Raw response:', response.substring(0, 500));
                return { success: false, error: 'AI returned invalid JSON response' };
            }
        } catch (error: any) {
            // Handle specific rate limit errors
            if (error.message?.includes('free-models-per-day') || error.message?.includes('free tier limit')) {
                return {
                    success: false,
                    error: 'OpenRouter free tier limit exceeded. Add credits to your account or switch to Ollama/LM Studio for unlimited local AI.'
                };
            }
            throw error;
        }
    }

    /**
     * Build enhanced prompt with context analysis
     */
    private buildEnhancedPrompt(request: AIGenerationRequest, contextData: any): string {
        let prompt = request.prompt || 'Generate comprehensive test cases for this application.';

        // Add project information
        if (contextData.projectInfo) {
            prompt += `\n\n**Project Information:**
- Type: ${contextData.projectInfo.type || 'Unknown'}
- Framework: ${contextData.projectInfo.framework || 'Unknown'}
- Language: ${contextData.projectInfo.language || 'Unknown'}
- Entry Point: ${contextData.projectInfo.entryPoint || 'Unknown'}`;
        }

        // Add page contexts
        if (contextData.pageContexts && contextData.pageContexts.length > 0) {
            prompt += `\n\n**Application Pages Analyzed:**
${contextData.pageContexts.map((page: any, index: number) =>
    `${index + 1}. ${page.title} (${page.url})
   - Type: ${page.pageType}
   - Features: ${[
       page.hasLogin ? 'Login' : '',
       page.hasSignup ? 'Signup' : '',
       page.hasSearch ? 'Search' : '',
       page.hasForms ? 'Forms' : '',
       page.hasNavigation ? 'Navigation' : ''
   ].filter(Boolean).join(', ') || 'Basic content'}
   - Main Content: ${page.mainContent?.substring(0, 100) || 'N/A'}...`
).join('\n')}`;
        }

        // Add documentation context
        if (contextData.documentation) {
            prompt += `\n\n**Documentation Context:**
${contextData.documentation.substring(0, 2000)}...`;
        }

        // Add core logic context
        if (contextData.coreLogic) {
            prompt += `\n\n**Core Application Logic:**
${contextData.coreLogic.substring(0, 2000)}...`;
        }

        prompt += `\n\n**Generation Instructions:**
- Focus on features that actually exist in the application
- Generate tests based on the analyzed pages and functionality
- Prioritize critical user paths and business logic
- Include edge cases and error scenarios where appropriate
- Ensure test names are descriptive and actionable
- Return valid JSON only`;

        return prompt;
    }

    /**
     * Get available models for the current provider
     */
    async getAvailableModels(): Promise<AIModel[]> {
        try {
            switch (this.config.provider) {
                case AIProvider.OPENROUTER:
                    return await this.getOpenRouterModels();

                case AIProvider.GOOGLE_GEMINI:
                    return await this.getGoogleGeminiModels();

                case AIProvider.DEEPSEEK:
                    return await this.getDeepSeekModels();

                case AIProvider.OLLAMA:
                    return await this.getOllamaModels();

                case AIProvider.LMSTUDIO:
                    return await this.getLMStudioModels();

                case AIProvider.BYO_API:
                    return await this.getBYOApiModels();

                default:
                    return [];
            }
        } catch (error) {
            console.error('❌ AI Service: Failed to get models:', error);
            return [];
        }
    }

    // ===== OPENROUTER IMPLEMENTATION =====

    private async checkOpenRouterAvailability(): Promise<boolean> {
        try {
            if (!this.config.apiKey) return false;
            const result = await this.openRouterClient.testConnection();
            return result.success;
        } catch {
            return false;
        }
    }

    private async generateWithOpenRouter(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            switch (request.type) {
                case 'test-cases':
                    // Use enhanced context-aware generation for test cases
                    return await this.generateTestCasesWithContext(request);

                case 'test-details':
                    const details = await this.openRouterClient.generateTestDetails(request.context.testName);
                    return { success: true, data: details };

                case 'payloads':
                    const payloads = await this.openRouterClient.generateSecurityPayloads(request.context);
                    return { success: true, data: payloads };

                default:
                    return { success: false, error: `Unsupported generation type: ${request.type}` };
            }
        } catch (error: any) {
            if (error.message?.includes('free-models-per-day') || error.message?.includes('free tier limit')) {
                return {
                    success: false,
                    error: 'OpenRouter free tier limit exceeded. Add credits to your account or switch to Ollama/LM Studio for unlimited local AI.'
                };
            }
            throw error;
        }
    }

    private async getOpenRouterModels(): Promise<AIModel[]> {
        try {
            const models = await this.openRouterClient.getAvailableModels();
            return models.map(model => ({
                id: model.id,
                name: model.name,
                provider: AIProvider.OPENROUTER,
                contextLength: model.context_length || 4096,
                pricing: model.pricing,
                capabilities: ['text-generation', 'test-generation']
            }));
        } catch {
            return [];
        }
    }

    // ===== DEEPSEEK IMPLEMENTATION =====

    private async checkDeepSeekAvailability(): Promise<boolean> {
        try {
            // For DeepSeek, we assume it's available if configured
            return !!(this.config.apiKey && this.config.baseUrl);
        } catch {
            return false;
        }
    }

    private async generateWithDeepSeek(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model || 'deepseek-chat',
                    messages: [{ role: 'user', content: request.prompt }],
                    temperature: request.options?.temperature || this.config.temperature || 0.7,
                    max_tokens: request.options?.maxTokens || this.config.maxTokens || 4096
                })
            });

            if (!response.ok) {
                throw new Error(`DeepSeek API error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result.choices[0]?.message?.content };
        } catch (error) {
            console.error('❌ DeepSeek: Generation failed:', error);
            return { success: false, error: 'DeepSeek generation failed' };
        }
    }

    private async getDeepSeekModels(): Promise<AIModel[]> {
        // DeepSeek typically has a few models
        return [
            {
                id: 'deepseek-chat',
                name: 'DeepSeek Chat',
                provider: AIProvider.DEEPSEEK,
                contextLength: 32768,
                capabilities: ['text-generation', 'test-generation']
            },
            {
                id: 'deepseek-coder',
                name: 'DeepSeek Coder',
                provider: AIProvider.DEEPSEEK,
                contextLength: 16384,
                capabilities: ['text-generation', 'test-generation', 'code-generation']
            }
        ];
    }

    // ===== GOOGLE GEMINI IMPLEMENTATION =====

    private async checkGoogleGeminiAvailability(): Promise<boolean> {
        try {
            return !!(this.config.apiKey && this.config.baseUrl);
        } catch {
            return false;
        }
    }

    private async generateWithGoogleGemini(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            const url = `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: request.prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: request.options?.temperature || this.config.temperature || 0.7,
                        maxOutputTokens: request.options?.maxTokens || this.config.maxTokens || 4096,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Google Gemini API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                const content = data.candidates[0].content.parts[0].text;
                return { success: true, data: content };
            } else {
                throw new Error('No content generated by Google Gemini');
            }
        } catch (error) {
            console.error('❌ Google Gemini: Generation failed:', error);
            return { success: false, error: 'Google Gemini generation failed' };
        }
    }

    private async getGoogleGeminiModels(): Promise<AIModel[]> {
        // Google Gemini available models
        return [
            {
                id: 'gemini-1.5-flash',
                name: 'Gemini 1.5 Flash',
                provider: AIProvider.GOOGLE_GEMINI,
                contextLength: 1048576, // 1M tokens
                capabilities: ['text-generation', 'test-generation']
            },
            {
                id: 'gemini-1.5-pro',
                name: 'Gemini 1.5 Pro',
                provider: AIProvider.GOOGLE_GEMINI,
                contextLength: 2097152, // 2M tokens
                capabilities: ['text-generation', 'test-generation', 'code-generation']
            },
            {
                id: 'gemini-1.0-pro',
                name: 'Gemini 1.0 Pro',
                provider: AIProvider.GOOGLE_GEMINI,
                contextLength: 32768,
                capabilities: ['text-generation', 'test-generation']
            }
        ];
    }

    // ===== OLLAMA IMPLEMENTATION =====

    private async checkOllamaAvailability(): Promise<boolean> {
        try {
            // Check if Ollama is running locally
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:11434'}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    private async generateWithOllama(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:11434'}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.model || 'llama2',
                    prompt: request.prompt,
                    stream: false,
                    options: {
                        temperature: request.options?.temperature || this.config.temperature || 0.7,
                        num_predict: request.options?.maxTokens || this.config.maxTokens || 2048
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result.response };
        } catch (error) {
            console.error('❌ Ollama: Generation failed:', error);
            return { success: false, error: 'Ollama generation failed' };
        }
    }

    private async getOllamaModels(): Promise<AIModel[]> {
        try {
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:11434'}/api/tags`);
            if (!response.ok) return [];

            const data = await response.json();
            return data.models.map((model: any) => ({
                id: model.name,
                name: model.name,
                provider: AIProvider.OLLAMA,
                contextLength: 4096, // Default assumption
                capabilities: ['text-generation', 'test-generation']
            }));
        } catch {
            return [];
        }
    }

    // ===== LMSTUDIO IMPLEMENTATION =====

    private async checkLMStudioAvailability(): Promise<boolean> {
        try {
            // LMStudio typically runs on localhost:1234
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:1234'}/v1/models`);
            return response.ok;
        } catch {
            return false;
        }
    }

    private async generateWithLMStudio(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:1234'}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.model || 'local-model',
                    messages: [{ role: 'user', content: request.prompt }],
                    temperature: request.options?.temperature || this.config.temperature || 0.7,
                    max_tokens: request.options?.maxTokens || this.config.maxTokens || 2048
                })
            });

            if (!response.ok) {
                throw new Error(`LMStudio API error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result.choices[0]?.message?.content };
        } catch (error) {
            console.error('❌ LMStudio: Generation failed:', error);
            return { success: false, error: 'LMStudio generation failed' };
        }
    }

    private async getLMStudioModels(): Promise<AIModel[]> {
        try {
            const response = await fetch(`${this.config.baseUrl || 'http://localhost:1234'}/v1/models`);
            if (!response.ok) return [];

            const data = await response.json();
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.id,
                provider: AIProvider.LMSTUDIO,
                contextLength: 4096, // Default assumption
                capabilities: ['text-generation', 'test-generation']
            }));
        } catch {
            return [];
        }
    }

    // ===== BYO API IMPLEMENTATION =====

    private async checkBYOApiAvailability(): Promise<boolean> {
        // For BYO API, we assume it's available if configured
        return !!(this.config.apiKey && this.config.baseUrl);
    }

    private async generateWithBYOApi(request: AIGenerationRequest): Promise<AIServiceResponse> {
        try {
            const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: request.prompt }],
                    temperature: request.options?.temperature || this.config.temperature || 0.7,
                    max_tokens: request.options?.maxTokens || this.config.maxTokens || 2048
                })
            });

            if (!response.ok) {
                throw new Error(`BYO API error: ${response.status}`);
            }

            const result = await response.json();
            return { success: true, data: result.choices[0]?.message?.content };
        } catch (error) {
            console.error('❌ BYO API: Generation failed:', error);
            return { success: false, error: 'BYO API generation failed' };
        }
    }

    private async getBYOApiModels(): Promise<AIModel[]> {
        try {
            const response = await fetch(`${this.config.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                }
            });

            if (!response.ok) return [];

            const data = await response.json();
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.id,
                provider: AIProvider.BYO_API,
                contextLength: 4096, // Default assumption
                capabilities: ['text-generation', 'test-generation']
            }));
        } catch {
            return [];
        }
    }
}

/**
 * Factory function to create AI service instances
 */
export function createAIService(config: AIServiceConfig): AIService {
    return new AIService(config);
}

/**
 * Get default configurations for each provider
 */
export function getDefaultAIConfig(provider: AIProvider): AIServiceConfig {
    switch (provider) {
        case AIProvider.OPENROUTER:
            return {
                provider: AIProvider.OPENROUTER,
                model: 'google/gemini-2.0-flash-exp:free',
                temperature: 0.2,
                maxTokens: 4096
            };

        case AIProvider.GOOGLE_GEMINI:
            return {
                provider: AIProvider.GOOGLE_GEMINI,
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                model: 'gemini-1.5-flash',
                temperature: 0.7,
                maxTokens: 4096
            };

        case AIProvider.DEEPSEEK:
            return {
                provider: AIProvider.DEEPSEEK,
                baseUrl: 'https://api.deepseek.com/v1',
                model: 'deepseek-chat',
                temperature: 0.7,
                maxTokens: 4096
            };

        case AIProvider.OLLAMA:
            return {
                provider: AIProvider.OLLAMA,
                baseUrl: 'http://localhost:11434',
                model: 'llama2',
                temperature: 0.7,
                maxTokens: 2048
            };

        case AIProvider.LMSTUDIO:
            return {
                provider: AIProvider.LMSTUDIO,
                baseUrl: 'http://localhost:1234',
                model: 'local-model',
                temperature: 0.7,
                maxTokens: 2048
            };

        case AIProvider.BYO_API:
            return {
                provider: AIProvider.BYO_API,
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-3.5-turbo',
                temperature: 0.7,
                maxTokens: 2048
            };

        default:
            throw new Error(`No default config for provider: ${provider}`);
    }
}
