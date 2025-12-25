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

/**
 * OpenRouter API client for AI-powered test generation
 */
export class OpenRouterClient {
    private client: AxiosInstance;
    private apiKey: string | null = null;
    private currentModel: string = 'x-ai/grok-beta';
    private fallbackModel: string = 'mistralai/mistral-7b-instruct:free';
    
    // Status bar item to show current AI model
    private statusBarItem: vscode.StatusBarItem | null = null;

    // Available free models on OpenRouter
    static readonly FREE_MODELS = [
        'meta-llama/llama-3.1-8b-instruct:free',
        'google/gemma-2-9b-it:free',
        'mistralai/mistral-7b-instruct:free'
    ];

    // Preferred models (may have costs)
    static readonly PREFERRED_MODELS = [
        'x-ai/grok-beta',
        'x-ai/grok-2-1212',
        'anthropic/claude-3.5-sonnet',
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
        this.apiKey = config.get<string>('ai.apiKey') || null;
        this.currentModel = config.get<string>('ai.model') || 'x-ai/grok-beta';
        this.fallbackModel = config.get<string>('ai.fallbackModel') || 'meta-llama/llama-3.1-8b-instruct:free';
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
        return aiEnabled && !!this.apiKey;
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

        const model = options?.model || this.currentModel;

        try {
            const response = await this.client.post<OpenRouterResponse>('/chat/completions', {
                model,
                messages,
                max_tokens: options?.maxTokens || 4096,
                temperature: options?.temperature || 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].message.content;
            }

            throw new Error('No response from AI model');
        } catch (error: any) {
            // If primary model fails, try fallback models
            if (error.response?.status !== 401) {
                // Try fallback models in order
                for (const fallbackModel of OpenRouterClient.FREE_MODELS) {
                    if (fallbackModel !== model && fallbackModel !== this.currentModel) {
                        try {
                            console.log(`Model ${model} failed, trying fallback: ${fallbackModel}`);
                            return this.chat(messages, { ...options, model: fallbackModel });
                        } catch (fallbackError) {
                            console.log(`Fallback model ${fallbackModel} also failed, continuing...`);
                            continue;
                        }
                    }
                }
            }

            if (error.response?.status === 401) {
                throw new Error('Invalid OpenRouter API key');
            } else if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded. Please wait and try again.');
            } else if (error.response?.data?.error) {
                throw new Error(error.response.data.error.message || 'AI request failed');
            }

            throw error;
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
${context.authFlows.join('\n') || 'None detected'}

Generate at least 20-30 diverse test cases covering:
1. Smoke tests for critical paths
2. Functional tests for forms and user flows
3. API tests for endpoints
4. Security tests (SQL injection, XSS, auth bypass, CSRF)
5. Edge cases and boundary values
6. Performance considerations

Return ONLY valid JSON, no markdown or explanation.`;

        return this.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], { maxTokens: 8000 });
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

