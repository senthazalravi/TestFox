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
    context_length?: number;
    pricing?: string;
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

    /**
     * Set API key directly (for AI service compatibility)
     */
    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.output.appendLine('TestFox AI: API key set');
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
            
            // First, test with a simple models endpoint call
            const modelsResponse = await axios.get(`${baseUrl}/models`, {
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            if (modelsResponse.status === 401 || modelsResponse.status === 403) {
                this.state = 'invalid_key';
                throw new Error('Invalid OpenRouter API key - authentication failed');
            }

            if (modelsResponse.status === 429) {
                this.state = 'rate_limited';
                throw new Error('OpenRouter rate limit reached - please try again later');
            }

            if (modelsResponse.status !== 200) {
                this.state = 'invalid_key';
                throw new Error(`OpenRouter API returned unexpected status: ${modelsResponse.status}`);
            }

            // Second, test with a minimal chat completion to ensure the key works for generation
            const chatResponse = await axios.post(`${baseUrl}/chat/completions`, {
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 1
            }, {
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            if (chatResponse.status === 401 || chatResponse.status === 403) {
                this.state = 'invalid_key';
                throw new Error('Invalid OpenRouter API key - chat completion failed');
            }

            if (chatResponse.status === 429) {
                this.state = 'rate_limited';
                throw new Error('OpenRouter rate limit reached - chat completion restricted');
            }

            if (chatResponse.status !== 200) {
                this.state = 'invalid_key';
                throw new Error(`OpenRouter chat API returned unexpected status: ${chatResponse.status}`);
            }

            // Check if we got a valid response
            if (!chatResponse.data?.choices?.[0]?.message?.content) {
                this.state = 'invalid_key';
                throw new Error('OpenRouter API key validation failed - no content returned');
            }

            this.state = 'ready';
            this.output.appendLine(`TestFox AI: OpenRouter key validated successfully - Models available: ${modelsResponse.data?.data?.length || 0}`);
            
        } catch (err: any) {
            // Handle network errors
            if (err.code === 'ECONNREFUSED') {
                this.state = 'network_error';
                this.output.appendLine('TestFox AI: Network error - connection refused');
                throw new Error('Network error - unable to connect to OpenRouter API');
            }
            
            if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
                this.state = 'network_error';
                this.output.appendLine('TestFox AI: Network error - host not found or timeout');
                throw new Error('Network error - unable to reach OpenRouter API');
            }

            // Handle HTTP errors
            if (err.response) {
                const status = err.response.status;
                if (status === 401 || status === 403) {
                    this.state = 'invalid_key';
                    throw new Error('Invalid OpenRouter API key - authentication failed');
                }
                if (status === 429) {
                    this.state = 'rate_limited';
                    throw new Error('OpenRouter rate limit reached - please try again later');
                }
                if (status >= 500) {
                    this.state = 'network_error';
                    throw new Error('OpenRouter server error - please try again later');
                }
            }

            this.state = 'invalid_key';
            this.output.appendLine(`TestFox AI: API key validation failed: ${err.message}`);
            throw new Error(`OpenRouter API key validation failed: ${err.message}`);
        }
    }
    
    /* ------------------ GENERATION ------------------ */

    async generate(prompt: string): Promise<string> {
        if (!this.apiKey) {
            // If no API key is configured, generate rule-based test cases
            return this.generateRuleBasedTests(prompt);
        }

        const config = vscode.workspace.getConfiguration('testfox');
        const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';
        const model = this.model || config.get<string>('ai.model') || 'google/gemini-2.0-flash-exp:free';

        try {
            const response = await axios.post<OpenRouterResponse>(
                `${baseUrl}/chat/completions`,
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are TestFox AI, a professional software testing assistant. Generate comprehensive, accurate test cases based on the provided requirements.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 4000,
                    temperature: 0.7
                },
                {
                    baseURL: baseUrl,
                    timeout: 120000, // Increased to 120 seconds for better reliability
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                        'X-Title': 'TestFox VS Code Extension'
                    }
                }
            );

            if (response.data?.choices?.[0]?.message?.content) {
                this.output.appendLine(`TestFox AI: Generated ${response.data.usage?.total_tokens || 0} tokens using ${model}`);
                return response.data.choices[0].message.content;
            }

            throw new Error('Invalid response from AI service');

        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Request failed: ${error.message}`);
            // Fall back to rule-based test generation on error
            this.output.appendLine('TestFox AI: Falling back to rule-based test generation');
            return this.generateRuleBasedTests(prompt);
        }
    }

    /* ------------------ RULE-BASED FALLBACK ------------------ */

    private generateRuleBasedTests(prompt: string): string {
        this.output.appendLine('TestFox AI: Generating rule-based test cases');
        
        // Extract test context from prompt
        const context = this.extractTestContext(prompt);
        
        let testCases = '';
        
        // Generate test cases based on common patterns
        if (context.type === 'api' || context.type === 'endpoint') {
            testCases = this.generateApiTests(context);
        } else if (context.type === 'form' || context.type === 'input') {
            testCases = this.generateFormTests(context);
        } else if (context.type === 'function' || context.type === 'method') {
            testCases = this.generateFunctionTests(context);
        } else {
            testCases = this.generateGenericTests(context);
        }
        
        return `# Rule-Based Test Cases

*Note: AI services are currently unavailable. These test cases were generated using predefined testing rules and patterns.*

${testCases}

## Test Coverage Areas
- ✅ Positive test cases
- ✅ Negative test cases  
- ✅ Boundary value testing
- ✅ Error handling
- ✅ Security testing basics
- ✅ Data validation

## Recommendation
Consider configuring AI API keys for more comprehensive and context-aware test case generation.`;
    }

    private extractTestContext(prompt: string): any {
        const context: any = {
            type: 'generic',
            name: 'Unknown',
            parameters: [],
            description: ''
        };
        
        // Try to extract test type from prompt
        if (prompt.toLowerCase().includes('api') || prompt.toLowerCase().includes('endpoint')) {
            context.type = 'api';
        } else if (prompt.toLowerCase().includes('form') || prompt.toLowerCase().includes('input')) {
            context.type = 'form';
        } else if (prompt.toLowerCase().includes('function') || prompt.toLowerCase().includes('method')) {
            context.type = 'function';
        }
        
        // Extract name/identifier
        const nameMatch = prompt.match(/(?:test|function|api|endpoint|method)\s+["']?(\w+)["']?/i);
        if (nameMatch) {
            context.name = nameMatch[1];
        }
        
        return context;
    }

    private generateApiTests(context: any): string {
        return `
## API Test Cases for ${context.name}

### 1. Positive Test Cases
- **GET /${context.name}** - Verify successful response (200 OK)
- **POST /${context.name}** - Create new resource with valid data
- **PUT /${context.name}/{id}** - Update existing resource with valid data
- **DELETE /${context.name}/{id}** - Delete existing resource

### 2. Negative Test Cases
- **GET /${context.name}/invalid** - Verify 404 Not Found
- **POST /${context.name}** - Send invalid JSON format (400 Bad Request)
- **POST /${context.name}** - Send missing required fields (400 Bad Request)
- **PUT /${context.name}/nonexistent** - Update non-existent resource (404 Not Found)
- **DELETE /${context.name}/nonexistent** - Delete non-existent resource (404 Not Found)

### 3. Security Test Cases
- **POST /${context.name}** - Test SQL injection attempts
- **POST /${context.name}** - Test XSS attempts in input fields
- **GET /${context.name}** - Test without authentication (401 Unauthorized)
- **POST /${context.name}** - Test with invalid authentication (401 Unauthorized)

### 4. Boundary Test Cases
- **POST /${context.name}** - Test with maximum allowed data size
- **POST /${context.name}** - Test with minimum required data
- **POST /${context.name}** - Test with empty data where not allowed`;
    }

    private generateFormTests(context: any): string {
        return `
## Form Test Cases for ${context.name}

### 1. Positive Test Cases
- **Valid Submission** - Submit form with all required fields filled correctly
- **Optional Fields** - Submit with optional fields both filled and empty
- **Default Values** - Verify default values are applied when fields are empty

### 2. Negative Test Cases
- **Missing Required Fields** - Submit without required fields
- **Invalid Email Format** - Test with malformed email addresses
- **Invalid Phone Format** - Test with invalid phone numbers
- **Invalid Date Format** - Test with invalid date formats
- **Exceeding Length Limits** - Test with text exceeding maximum length

### 3. Security Test Cases
- **SQL Injection** - Test input fields with SQL injection attempts
- **XSS Attempts** - Test with script tags and event handlers
- **CSRF Protection** - Verify CSRF tokens are validated
- **File Upload Security** - Test file upload restrictions and validation

### 4. Boundary Test Cases
- **Minimum Length** - Test with minimum allowed character counts
- **Maximum Length** - Test with maximum allowed character counts
- **Special Characters** - Test with various special characters
- **Unicode Characters** - Test with international characters`;
    }

    private generateFunctionTests(context: any): string {
        return `
## Function Test Cases for ${context.name}

### 1. Positive Test Cases
- **Valid Input** - Test with valid parameters
- **Edge Cases** - Test with boundary values
- **Null Handling** - Test with null/undefined parameters
- **Empty Input** - Test with empty strings/arrays

### 2. Negative Test Cases
- **Invalid Parameters** - Test with wrong data types
- **Missing Parameters** - Test without required parameters
- **Out of Range** - Test with values outside expected range
- **Division by Zero** - Test mathematical edge cases

### 3. Performance Test Cases
- **Large Input** - Test with large datasets
- **Concurrent Calls** - Test multiple simultaneous calls
- **Memory Usage** - Monitor memory consumption
- **Execution Time** - Verify performance within acceptable limits

### 4. Error Handling Test Cases
- **Exception Handling** - Verify proper error messages
- **Logging** - Verify errors are logged appropriately
- **Recovery** - Test system recovery after errors`;
    }

    private generateGenericTests(context: any): string {
        return `
## Generic Test Cases for ${context.name}

### 1. Functional Test Cases
- **Basic Functionality** - Verify core features work as expected
- **User Workflow** - Test complete user journeys
- **Data Integrity** - Verify data consistency throughout operations
- **Business Rules** - Test business logic validation

### 2. Negative Test Cases
- **Invalid Operations** - Test with invalid inputs/operations
- **Error Conditions** - Verify appropriate error handling
- **Resource Unavailability** - Test behavior when resources are unavailable
- **Concurrent Access** - Test multiple users accessing same resources

### 3. Usability Test Cases
- **User Interface** - Verify UI elements are accessible and functional
- **Navigation** - Test navigation flows and breadcrumbs
- **Responsive Design** - Test on different screen sizes
- **Accessibility** - Verify compliance with accessibility standards

### 4. Performance Test Cases
- **Load Testing** - Test system under expected load
- **Stress Testing** - Test system beyond expected limits
- **Response Time** - Verify acceptable response times
- **Resource Usage** - Monitor CPU and memory usage`;
    }

    /* ------------------ LEGACY COMPATIBILITY ------------------ */


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
     * Discover working models (legacy compatibility)
     */
    async discoverWorkingModels(): Promise<AvailableModel[]> {
        if (this.state !== 'ready') {
            return [];
        }

        try {
            const models = await this.getAvailableModels();
            return models.filter(model => model.isFree);
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

            const config = vscode.workspace.getConfiguration('testfox');
            const baseUrl = config.get<string>('ai.baseUrl') || 'https://openrouter.ai/api/v1';

            // Test 1: Check models endpoint
            this.output.appendLine('TestFox AI: Testing models endpoint...');
            const modelsResponse = await axios.get(`${baseUrl}/models`, {
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            if (modelsResponse.status !== 200) {
                throw new Error(`Models endpoint failed: ${modelsResponse.status}`);
            }

            // Test 2: Check chat completion endpoint
            this.output.appendLine('TestFox AI: Testing chat completion endpoint...');
            const chatResponse = await axios.post(`${baseUrl}/chat/completions`, {
                model: testModel || 'google/gemini-2.0-flash-exp:free',
                messages: [
                    {
                        role: 'user',
                        content: 'Connection test'
                    }
                ],
                max_tokens: 1
            }, {
                timeout: 15000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/testfox/testfox-vscode',
                    'X-Title': 'TestFox VS Code Extension'
                }
            });

            if (chatResponse.status !== 200) {
                throw new Error(`Chat completion failed: ${chatResponse.status}`);
            }

            if (!chatResponse.data?.choices?.[0]?.message?.content) {
                throw new Error('No content returned from chat completion');
            }

            this.state = 'ready';
            this.output.appendLine(`TestFox AI: Connection test successful - Models: ${modelsResponse.data?.data?.length || 0}`);
            return { success: true };
            
        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Connection test failed: ${error.message}`);
            
            // Set appropriate state based on error
            if (error.response) {
                const status = error.response.status;
                if (status === 401 || status === 403) {
                    this.state = 'invalid_key';
                } else if (status === 429) {
                    this.state = 'rate_limited';
                } else if (status >= 500) {
                    this.state = 'network_error';
                }
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
                this.state = 'network_error';
            } else {
                this.state = 'invalid_key';
            }
            
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
     * Check if enabled (has API key configured)
     */
    isEnabled(): boolean {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Check if AI is configured (alias for isEnabled)
     */
    isConfigured(): boolean {
        return this.isEnabled();
    }

    /**
     * Check if BYOK (Bring Your Own Key) is satisfied - user must provide their own key
     */
    isBYOKReady(): boolean {
        return !!this.apiKey && this.apiKey.trim().length > 0 && this.state === 'ready';
    }

    /**
     * Generate test cases using AI (legacy compatibility)
     */
    async generateTestCases(context: any): Promise<string> {
        const prompt = `Generate comprehensive test cases for this application based on the following context:

Project Type: ${context.projectType || 'Unknown'}
Framework: ${context.framework || 'Unknown'}
Routes: ${context.routes?.length || 0} routes
Forms: ${context.forms?.length || 0} forms
Endpoints: ${context.endpoints?.length || 0} endpoints
Page Contexts: ${context.pageContexts?.length || 0} pages analyzed

Additional Context:
${context.documentation ? `- Documentation available: Yes` : '- Documentation available: No'}
${context.applicationLogic ? `- Application logic files analyzed: Yes` : '- Application logic files analyzed: No'}

${context.prompt || ''}

Please generate comprehensive test cases in JSON format covering:
1. Functional testing for all routes and forms
2. API testing for all endpoints
3. Security testing (OWASP Top 10)
4. Edge cases and boundary testing
5. Error handling validation

Return the test cases as a JSON array with each test case having:
- name: Test case name
- category: Test category (functional, security, api, etc.)
- description: What the test does
- steps: Array of test steps
- expectedResult: Expected outcome`;

        try {
            return await this.generate(prompt);
        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Test case generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate test details using AI (legacy compatibility)
     */
    async generateTestDetails(testName: string): Promise<string> {
        const prompt = `Generate detailed test steps for "${testName}". Include:
1. Pre-conditions
2. Step-by-step test procedure
3. Expected results
4. Test data requirements
5. Potential issues to watch for`;

        try {
            return await this.generate(prompt);
        } catch (error: any) {
            this.output.appendLine(`TestFox AI: Test details generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate security payloads using AI (legacy compatibility)
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

