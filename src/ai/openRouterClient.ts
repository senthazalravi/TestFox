import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

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
 */
export class OpenRouterClient {
    private client: AxiosInstance;
    private apiKey: string | null = null;
    // Default to free Gemini 2.0 Flash model
    private currentModel: string = 'google/gemini-2.0-flash-exp:free';
    private fallbackModel: string = 'google/gemini-2.0-flash-exp:free';
    
    // Status bar item to show current AI model
    private statusBarItem: vscode.StatusBarItem | null = null;

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

    constructor() {
        this.client = axios.create({
            baseURL: 'https://openrouter.ai/api/v1',
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                'X-Title': 'TestFox VS Code Extension'
            }
        });

        this.loadConfiguration();
    }

    /**
     * Load configuration from VS Code settings
     */
    loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('testfox');
        const oldApiKey = this.apiKey;
        this.apiKey = config.get<string>('ai.apiKey') || null;
        
        // Log configuration changes
        if (oldApiKey !== this.apiKey) {
            if (this.apiKey) {
                console.log(`TestFox: API key loaded (length: ${this.apiKey.length})`);
            } else {
                console.log('TestFox: API key cleared');
            }
        }
        
        // Default to free Gemini 2.0 Flash if no model is configured
        const configuredModel = config.get<string>('ai.model');
        if (configuredModel) {
            this.currentModel = configuredModel;
            console.log(`TestFox: Using configured model: ${configuredModel}`);
        } else {
            // Default to best free model
            this.currentModel = 'google/gemini-2.0-flash-exp:free';
            console.log(`TestFox: Using default free model: ${this.currentModel}`);
        }
        
        // Use first free model as fallback
        this.fallbackModel = config.get<string>('ai.fallbackModel') || 'google/gemini-2.0-flash-exp:free';
        
        // If user selected a premium model but we want to prioritize free, 
        // check if it's a premium model and suggest free alternative
        if (this.isPremiumModel(this.currentModel) && this.apiKey) {
            console.log(`TestFox: Using premium model ${this.currentModel}. Consider using a free model to save credits.`);
        }
        
        // Update status bar
        this.updateStatusBar();
    }
    
    /**
     * Check if a model is premium (requires credits)
     */
    private isPremiumModel(model: string): boolean {
        return OpenRouterClient.PREMIUM_MODELS.includes(model) || 
               (!model.includes(':free') && !OpenRouterClient.FREE_MODELS.includes(model));
    }

    /**
     * Set the API key
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    /**
     * Check if AI is enabled and configured
     */
    isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('testfox');
        const aiEnabled = config.get<boolean>('ai.enabled', true);
        return aiEnabled && !!this.apiKey && this.apiKey.trim().length > 0;
    }
    
    /**
     * Check if AI is configured (has API key)
     */
    isConfigured(): boolean {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Get current model name for display
     */
    getCurrentModelName(): string {
        const modelName = this.currentModel.split('/').pop() || this.currentModel;
        return modelName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Initialize status bar
     */
    initStatusBar(statusBarItem: vscode.StatusBarItem): void {
        this.statusBarItem = statusBarItem;
        this.updateStatusBar();
    }

    /**
     * Update status bar with current AI status
     */
    updateStatusBar(): void {
        if (!this.statusBarItem) return;

        if (this.isEnabled()) {
            const modelName = this.getCurrentModelName();
            this.statusBarItem.text = `$(hubot) ${modelName}`;
            this.statusBarItem.tooltip = `TestFox AI: ${this.currentModel}\nClick to change model`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(hubot) AI: Off';
            this.statusBarItem.tooltip = 'TestFox AI is disabled. Click to configure.';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    /**
     * Fetch available models from OpenRouter
     */
    async fetchAvailableModels(): Promise<ModelInfo[]> {
        try {
            const response = await this.client.get('/models', {
                headers: {
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                },
                timeout: 30000
            });

            if (response.data && Array.isArray(response.data.data)) {
                return response.data.data as ModelInfo[];
            }
            return [];
        } catch (error: any) {
            console.error('TestFox: Failed to fetch models from OpenRouter:', error.message);
            return [];
        }
    }

    /**
     * Get free models from available models list
     */
    async getFreeModels(): Promise<ModelInfo[]> {
        const allModels = await this.fetchAvailableModels();
        // Filter for free models (models with :free suffix or pricing that indicates free)
        return allModels.filter(model => {
            const id = model.id.toLowerCase();
            return id.includes(':free') || 
                   (model.pricing && 
                    (model.pricing.prompt === '0' || model.pricing.prompt === 'free' ||
                     model.pricing.completion === '0' || model.pricing.completion === 'free'));
        });
    }

    /**
     * Test multiple models in parallel to find working ones
     */
    async testMultipleModels(models: string[]): Promise<AvailableModel[]> {
        if (!this.apiKey) {
            throw new Error('API key is not configured');
        }

        console.log(`TestFox: Testing ${models.length} models...`);
        
        // Test models in parallel (but limit concurrency)
        const results: AvailableModel[] = [];
        const batchSize = 5; // Test 5 models at a time
        
        for (let i = 0; i < models.length; i += batchSize) {
            const batch = models.slice(i, i + batchSize);
            const batchPromises = batch.map(async (modelId) => {
                const startTime = Date.now();
                try {
                    const response = await this.client.post('/chat/completions', {
                        model: modelId,
                        messages: [
                            { role: 'user', content: 'Say "OK" if you can read this.' }
                        ],
                        max_tokens: 5
                    }, {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                            'X-Title': 'TestFox VS Code Extension'
                        },
                        timeout: 10000 // 10 second timeout per model
                    });

                    const responseTime = Date.now() - startTime;
                    
                    if (response.status === 200 && response.data?.choices?.length > 0) {
                        const modelName = modelId.split('/').pop() || modelId;
                        console.log(`TestFox: ✅ ${modelId} is working (${responseTime}ms)`);
                        return {
                            id: modelId,
                            name: modelName,
                            isFree: modelId.includes(':free'),
                            isWorking: true,
                            responseTime
                        };
                    } else {
                        return {
                            id: modelId,
                            name: modelId.split('/').pop() || modelId,
                            isFree: modelId.includes(':free'),
                            isWorking: false,
                            error: 'No response from model'
                        };
                    }
                } catch (error: any) {
                    const responseTime = Date.now() - startTime;
                    const errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error';
                    console.log(`TestFox: ❌ ${modelId} failed: ${errorMsg}`);
                    return {
                        id: modelId,
                        name: modelId.split('/').pop() || modelId,
                        isFree: modelId.includes(':free'),
                        isWorking: false,
                        error: errorMsg,
                        responseTime
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Small delay between batches to avoid rate limiting
            if (i + batchSize < models.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Sort: working models first, then by response time
        results.sort((a, b) => {
            if (a.isWorking !== b.isWorking) {
                return a.isWorking ? -1 : 1;
            }
            if (a.isWorking && b.isWorking) {
                return (a.responseTime || Infinity) - (b.responseTime || Infinity);
            }
            return 0;
        });

        return results;
    }

    /**
     * Discover and test all available free models
     */
    async discoverWorkingModels(): Promise<AvailableModel[]> {
        if (!this.apiKey) {
            throw new Error('API key is not configured');
        }

        console.log('TestFox: Discovering available free models...');
        
        // First, try to fetch from OpenRouter API
        let freeModels: ModelInfo[] = [];
        try {
            freeModels = await this.getFreeModels();
            console.log(`TestFox: Found ${freeModels.length} free models from OpenRouter API`);
        } catch (error) {
            console.log('TestFox: Could not fetch models from API, using hardcoded list');
        }

        // If API fetch failed or returned few models, use our hardcoded list
        const modelIds = freeModels.length > 0 
            ? freeModels.map(m => m.id)
            : OpenRouterClient.FREE_MODELS;

        console.log(`TestFox: Testing ${modelIds.length} free models...`);
        
        // Test all models
        const results = await this.testMultipleModels(modelIds);
        
        const workingModels = results.filter(m => m.isWorking);
        console.log(`TestFox: Found ${workingModels.length} working models out of ${results.length} tested`);
        
        return results;
    }

    /**
     * Test API connection
     */
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        if (!this.apiKey) {
            return { success: false, error: 'API key is not configured' };
        }

        // Try free models first for connection testing
        const testModels = [
            'google/gemini-2.0-flash-exp:free',
            'deepseek/deepseek-r1-0528:free',
            'meta-llama/llama-3.1-8b-instruct:free'
        ];

        for (const testModel of testModels) {
            try {
                console.log(`TestFox: Testing connection with ${testModel}...`);
                console.log(`TestFox: API key present: ${!!this.apiKey}, length: ${this.apiKey?.length || 0}`);
                
                // Make a minimal test request
                const response = await this.client.post('/chat/completions', {
                    model: testModel,
                    messages: [
                        { role: 'user', content: 'Say "OK" if you can read this.' }
                    ],
                    max_tokens: 5
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                        'X-Title': 'TestFox VS Code Extension'
                    },
                    timeout: 15000 // 15 second timeout for test
                });

                if (response.status === 200 && response.data?.choices?.length > 0) {
                    console.log(`TestFox: ✅ Connection successful with ${testModel}`);
                    console.log(`TestFox: Response: ${JSON.stringify(response.data.choices[0]?.message?.content || 'No content')}`);
                    return { success: true };
                } else {
                    console.log(`TestFox: ⚠️ Unexpected response status: ${response.status}, choices: ${response.data?.choices?.length || 0}`);
                }
            } catch (error: any) {
                console.error(`TestFox: ❌ Connection test failed for ${testModel}:`, {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data
                });
                
                // If this is auth error, don't try other models
                if (error.response?.status === 401 || error.response?.status === 403) {
                    const errorMsg = error.response?.data?.error?.message || error.message;
                    if (error.response?.status === 401) {
                        return { success: false, error: `Invalid API key: ${errorMsg}` };
                    } else {
                        return { success: false, error: `Access forbidden: ${errorMsg}` };
                    }
                }
                
                // If network error, don't try other models
                if (!error.response) {
                    return { success: false, error: `Network error: ${error.message || 'Check your internet connection'}` };
                }
                
                // Try next model if this one failed
                console.log(`TestFox: ${testModel} failed (${error.response?.status || error.code}), trying next model...`);
                continue;
            }
        }

        return { success: false, error: 'Connection test failed with all free models. Please check your API key and internet connection.' };
    }

    /**
     * Send a chat completion request
     */
    async chat(messages: ChatMessage[], options?: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<string> {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured. Set testfox.ai.apiKey in settings.');
        }

        const requestedModel = options?.model || this.currentModel;
        const model = requestedModel;

        try {
            const response = await this.client.post<OpenRouterResponse>('/chat/completions', {
                model,
                messages,
                max_tokens: options?.maxTokens || 4096,
                temperature: options?.temperature || 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                },
                timeout: 60000, // 60 second timeout for AI requests
                validateStatus: (status) => status < 500 // Accept client errors, reject server errors
            });

            if (response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            }

            throw new Error('No response from AI model');
        } catch (error: any) {
            // Handle aborted/cancelled requests
            if (error.code === 'ECONNABORTED' || error.message?.includes('aborted') || error.message?.includes('cancelled')) {
                throw new Error('AI request was cancelled. Please try again.');
            }

            // Handle network errors
            if (!error.response) {
                console.error('TestFox: Network error connecting to OpenRouter:', error.message);
                throw new Error('Network error: Unable to connect to AI service. Check your internet connection.');
            }

            // If primary model fails (and it's not an auth error), try free fallback models first
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                // Prioritize free models as fallbacks
                const fallbackModels = [...OpenRouterClient.FREE_MODELS];
                
                // Remove the current model from fallback list
                const availableFallbacks = fallbackModels.filter(m => m !== model);
                
                for (const fallbackModel of availableFallbacks) {
                    try {
                        console.log(`TestFox: Model ${model} failed (${error.response?.status}), trying free fallback: ${fallbackModel}`);
                        const fallbackResponse = await this.client.post<OpenRouterResponse>('/chat/completions', {
                            model: fallbackModel,
                            messages,
                            max_tokens: options?.maxTokens || 4096,
                            temperature: options?.temperature || 0.7
                        }, {
                            headers: {
                                'Authorization': `Bearer ${this.apiKey}`,
                                'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                                'X-Title': 'TestFox VS Code Extension'
                            },
                            timeout: 60000,
                            validateStatus: (status) => status < 500
                        });

                        if (fallbackResponse.data.choices && fallbackResponse.data.choices.length > 0) {
                            console.log(`TestFox: Successfully used fallback model: ${fallbackModel}`);
                            return fallbackResponse.data.choices[0].message.content;
                        }
                    } catch (fallbackError: any) {
                        // If fallback is also aborted, don't continue trying
                        if (fallbackError.message?.includes('cancelled') || fallbackError.message?.includes('aborted')) {
                            throw fallbackError;
                        }
                        // If fallback succeeds but has no response, continue
                        if (fallbackError.response?.status === 200) {
                            continue;
                        }
                        console.log(`TestFox: Fallback model ${fallbackModel} also failed, trying next...`);
                        continue;
                    }
                }
            }

            // Handle specific error codes
            if (error.response?.status === 401) {
                throw new Error('Invalid OpenRouter API key. Please check your API key in settings.');
            } else if (error.response?.status === 403) {
                throw new Error('Access forbidden. Your API key may not have permission for this model.');
            } else if (error.response?.status === 429) {
                throw new Error('AI service rate limit exceeded. Please wait a moment and try again.');
            } else if (error.response?.status >= 500) {
                throw new Error('AI service is temporarily unavailable. Please try again later.');
            } else {
                const errorMessage = error.response?.data?.error?.message || error.response?.statusText || 'Unknown error';
                throw new Error(`AI request failed (${error.response?.status}): ${errorMessage}`);
            }
        }
    }

    /**
     * Generate test cases using AI
     */
    async generateTestCases(context: {
        projectType: string;
        framework: string;
        routes: string[];
        forms: string[];
        endpoints: string[];
        authFlows: string[];
    }): Promise<string> {
        console.log('TestFox: generateTestCases called');
        console.log('TestFox: API key configured:', !!this.apiKey);
        console.log('TestFox: Current model:', this.currentModel);
        console.log('TestFox: Is enabled:', this.isEnabled());
        
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not configured. Please set testfox.ai.apiKey in settings.');
        }
        
        const systemPrompt = `You are TestFox, an expert software testing AI assistant. Your role is to generate comprehensive test cases following ISTQB standards.

You understand:
- Functional testing, API testing, Security testing (OWASP Top 10)
- Boundary Value Analysis, Equivalence Partitioning
- Smoke testing, Regression testing, Edge case testing
- Performance and Load testing concepts

Generate test cases in JSON format with this structure:
{
  "tests": [
    {
      "name": "Test name",
      "category": "smoke|functional|api|security|performance|edge_cases",
      "priority": "critical|high|medium|low",
      "description": "What this test verifies",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "Expected outcome",
      "automationLevel": "full|partial|manual"
    }
  ]
}`;

        // Build page context information
        let pageContextInfo = '';
        if (context.pageContexts && context.pageContexts.length > 0) {
            pageContextInfo = '\n\n**Page Context Analysis (What Actually Exists on Pages):**\n';
            context.pageContexts.forEach((pc: any, index: number) => {
                pageContextInfo += `\nPage ${index + 1}: ${pc.title} (${pc.url})\n`;
                pageContextInfo += `- Type: ${pc.pageType}\n`;
                pageContextInfo += `- Has Login: ${pc.hasLogin ? 'YES' : 'NO'}\n`;
                pageContextInfo += `- Has Signup: ${pc.hasSignup ? 'YES' : 'NO'}\n`;
                pageContextInfo += `- Has Search: ${pc.hasSearch ? 'YES' : 'NO'}\n`;
                pageContextInfo += `- Has Forms: ${pc.hasForms ? 'YES' : 'NO'}\n`;
                pageContextInfo += `- Main Content: ${pc.mainContent || 'N/A'}\n`;
                if (pc.suggestedTests && pc.suggestedTests.length > 0) {
                    pageContextInfo += `- Suggested Tests: ${pc.suggestedTests.join(', ')}\n`;
                }
            });
            pageContextInfo += '\n**IMPORTANT:** Only generate tests for features that actually exist on the pages. ';
            pageContextInfo += 'For example, if a page does NOT have a login button (hasLogin: NO), do NOT generate login tests for that page.\n';
        }

        const userPrompt = `Generate comprehensive test cases for this project:

**Project Type:** ${context.projectType}
**Framework:** ${context.framework}

**Routes/Pages:** 
${context.routes.slice(0, 20).join('\n') || 'None detected'}

**Forms:**
${context.forms.slice(0, 10).join('\n') || 'None detected'}

**API Endpoints:**
${context.endpoints.slice(0, 20).join('\n') || 'None detected'}

**Authentication Flows:**
${context.authFlows.join('\n') || 'None detected'}${pageContextInfo}

Generate at least 20-30 diverse test cases covering:
1. Smoke tests for critical paths
2. Functional tests for forms and user flows (ONLY if forms exist on pages)
3. API tests for endpoints
4. Security tests (SQL injection, XSS, auth bypass, CSRF) - ONLY for pages that have forms/inputs
5. Edge cases and boundary values
6. Performance considerations

**CRITICAL RULES:**
- If a page does NOT have login functionality (hasLogin: NO), do NOT generate login tests for that page
- If a page does NOT have signup functionality (hasSignup: NO), do NOT generate signup tests for that page
- If a page does NOT have search functionality (hasSearch: NO), do NOT generate search tests for that page
- Only generate tests for features that actually exist on the analyzed pages
- For static pages without forms, focus on content verification and UI tests only

Return ONLY valid JSON, no markdown or explanation.`;

        try {
            console.log('TestFox: Sending chat request to OpenRouter...');
            const result = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ], { maxTokens: 8000 });
            console.log('TestFox: Chat request successful, response length:', result?.length || 0);
            return result;
        } catch (error: any) {
            console.error('TestFox: generateTestCases failed:', error.message);
            console.error('TestFox: Error details:', {
                message: error.message,
                code: error.code,
                response: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }

    /**
     * Generate test report summary using AI
     */
    async generateReportSummary(context: {
        totalTests: number;
        passed: number;
        failed: number;
        passRate: number;
        securityIssues: string[];
        performanceMetrics: { avgTime: number; slowEndpoints: string[] };
        failedTests: string[];
    }): Promise<string> {
        const systemPrompt = `You are TestFox, generating executive summaries for test reports. Be concise, professional, and actionable.`;

        const userPrompt = `Generate an executive summary and recommendations for this test run:

**Results:**
- Total Tests: ${context.totalTests}
- Passed: ${context.passed}
- Failed: ${context.failed}
- Pass Rate: ${context.passRate}%

**Security Issues Found:**
${context.securityIssues.length > 0 ? context.securityIssues.join('\n') : 'None'}

**Performance:**
- Average Response Time: ${context.performanceMetrics.avgTime}ms
- Slow Endpoints: ${context.performanceMetrics.slowEndpoints.join(', ') || 'None'}

**Failed Tests:**
${context.failedTests.slice(0, 10).join('\n') || 'None'}

Provide:
1. A 2-3 sentence executive summary
2. Top 3-5 prioritized recommendations
3. Risk assessment (Low/Medium/High/Critical)

Format as JSON:
{
  "summary": "...",
  "recommendations": ["...", "..."],
  "riskLevel": "Low|Medium|High|Critical",
  "releaseReady": true|false
}`;

        return this.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], { maxTokens: 1000 });
    }

    /**
     * Generate security test payloads using AI
     */
    async generateSecurityPayloads(context: {
        inputType: 'text' | 'email' | 'password' | 'number' | 'url';
        fieldName: string;
        endpoint?: string;
    }): Promise<string[]> {
        const prompt = `Generate 10 security test payloads for a ${context.inputType} input field named "${context.fieldName}"${context.endpoint ? ` on endpoint ${context.endpoint}` : ''}.

Include:
- SQL injection variants
- XSS payloads
- Command injection attempts
- Path traversal
- Input validation bypasses

Return as JSON array of strings only:
["payload1", "payload2", ...]`;

        try {
            const response = await this.chat([
                { role: 'user', content: prompt }
            ], { maxTokens: 500 });

            const parsed = JSON.parse(response);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            // Return default payloads if AI fails
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
     * Enhance test description using AI
     */
    async enhanceTestDescription(testName: string, category: string): Promise<{
        description: string;
        steps: string[];
        expectedResult: string;
    }> {
        const prompt = `For a ${category} test named "${testName}", provide:
1. A clear description of what this test verifies
2. 3-5 specific test steps
3. The expected result

Return as JSON:
{
  "description": "...",
  "steps": ["Step 1", "Step 2", ...],
  "expectedResult": "..."
}`;

        try {
            const response = await this.chat([
                { role: 'user', content: prompt }
            ], { maxTokens: 500 });

            return JSON.parse(response);
        } catch {
            return {
                description: `Verify ${testName}`,
                steps: ['Execute the test', 'Verify the result'],
                expectedResult: 'Test passes successfully'
            };
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

