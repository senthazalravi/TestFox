import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { createAIService, AIProvider } from './aiService';
import { TestStore } from '../store/testStore';
import {
    TestCase,
    TestCategory,
    AutomationLevel,
    TestPriority,
    AnalysisResult
} from '../types';
import { ContextAnalyzer, PageContext } from '../core/contextAnalyzer';
import { RuntimeAppInfo } from '../runtime/runtimeAppAnalyzer';

/**
 * AI-enhanced test generator using OpenRouter
 * OpenRouter provides access to multiple AI models through a unified API
 */
export class TestGeneratorAI {
    private aiService: any;
    private contextAnalyzer = new ContextAnalyzer();

    constructor(private testStore: TestStore) {
        this.initializeAIService();
    }

    private initializeAIService(): void {
        try {
            // Read AI configuration from VS Code settings
            const config = vscode.workspace.getConfiguration('testfox');
            const provider = config.get<string>('ai.provider') || 'openrouter';
            const apiKey = config.get<string>('ai.apiKey') || '';
            const baseUrl = config.get<string>('ai.baseUrl') || '';
            const model = config.get<string>('ai.model') || '';

            // Initialize AI service with OpenRouter as primary provider
            this.aiService = createAIService({
                provider: provider as AIProvider,
                apiKey,
                baseUrl,
                model
            });
            console.log('🤖 TestFox AI: Initialized AI service with OpenRouter provider:', provider);
        } catch (error) {
            console.error('❌ TestFox AI: Failed to initialize AI service:', error);
            // Fallback to basic OpenRouter setup
            this.aiService = createAIService({
                provider: AIProvider.OPENROUTER,
                model: 'google/gemini-2.0-flash-exp:free'
            });
            console.log('🤖 TestFox AI: Using OpenRouter as fallback provider');
        }
    }

    private ensureValidAnalysisResult(analysisResult: AnalysisResult): void {
        if (!analysisResult.routes || !Array.isArray(analysisResult.routes)) {
            analysisResult.routes = [];
        }
        if (!analysisResult.forms || !Array.isArray(analysisResult.forms)) {
            analysisResult.forms = [];
        }
        if (!analysisResult.endpoints || !Array.isArray(analysisResult.endpoints)) {
            analysisResult.endpoints = [];
        }
        if (!analysisResult.authFlows || !Array.isArray(analysisResult.authFlows)) {
            analysisResult.authFlows = [];
        }
        if (!analysisResult.databaseQueries || !Array.isArray(analysisResult.databaseQueries)) {
            analysisResult.databaseQueries = [];
        }
        if (!analysisResult.externalApis || !Array.isArray(analysisResult.externalApis)) {
            analysisResult.externalApis = [];
        }
        if (!analysisResult.components || !Array.isArray(analysisResult.components)) {
            analysisResult.components = [];
        }
    }

    /**
     * Generate tests using AI powered by OpenRouter
     */
    async generateWithAI(): Promise<TestCase[]> {
        console.log('🤖 TestFox AI: Starting AI-powered test generation via OpenRouter');
        console.log('🤖 TestFox AI: Timestamp:', new Date().toISOString());

        const projectInfo = this.testStore.getProjectInfo();
        const analysisResult = this.testStore.getAnalysisResult();

        console.log('🤖 AI Test Generator: Retrieved project info:', !!projectInfo);
        console.log('🤖 AI Test Generator: Retrieved analysis result:', !!analysisResult);

        if (!projectInfo) {
            console.error('❌ AI Test Generator: Project not analyzed - throwing error');
            throw new Error('Project not analyzed. Run analysis first.');
        }

        if (!analysisResult) {
            throw new Error('Analysis result not available. Run analysis first.');
        }

        // Ensure analysis result has valid structure
        this.ensureValidAnalysisResult(analysisResult);

        // Check if AI service is available
        const isAvailable = await this.aiService?.isAvailable();
        if (!isAvailable) {
            vscode.window.showWarningMessage(
                'AI service is not available. Please check your configuration and ensure the AI provider is running.',
                'Configure AI'
            ).then(selection => {
                if (selection === 'Configure AI') {
                    vscode.commands.executeCommand('testfox.openOnboarding');
                }
            });
            return [];
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox AI via OpenRouter: Generating tests...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Analyzing project structure...' });

                // Ensure arrays exist before mapping (defensive programming)
                const routes = Array.isArray(analysisResult.routes) ? analysisResult.routes : [];
                const forms = Array.isArray(analysisResult.forms) ? analysisResult.forms : [];
                const endpoints = Array.isArray(analysisResult.endpoints) ? analysisResult.endpoints : [];
                const authFlows = Array.isArray(analysisResult.authFlows) ? analysisResult.authFlows : [];

                // Analyze page contexts if application is running
                let pageContexts: PageContext[] = [];
                try {
                    progress.report({ message: 'Analyzing page contexts...' });
                    pageContexts = await this.analyzePageContexts(projectInfo);
                    console.log(`TestFox AI: Analyzed ${pageContexts.length} page contexts`);
                } catch (error) {
                    console.log('TestFox AI: Could not analyze page contexts:', error);
                    // Continue without page contexts
                }

                console.log('🔍 AI Test Generator: Building comprehensive context for AI analysis...');

                // Try to read application documentation and core logic files
                const documentationContext = await this.gatherApplicationDocumentation(projectInfo);
                const applicationLogicContext = await this.gatherApplicationLogic(projectInfo);

                const context = {
                    projectType: projectInfo.type,
                    framework: projectInfo.framework || 'unknown',
                    routes: routes.map(r => `${r.method || 'GET'} ${r.path || '/'}`),
                    forms: forms.map(f => f.name || 'Unnamed Form'),
                    endpoints: endpoints.map(e => `${e.method || 'GET'} ${e.path || '/'}`),
                    authFlows: authFlows.map(a => a.type || 'unknown'),
                    pageContexts: pageContexts.map(pc => ({
                        url: pc.url,
                        title: pc.title,
                        pageType: pc.pageType,
                        hasLogin: pc.hasLogin,
                        hasSignup: pc.hasSignup,
                        hasSearch: pc.hasSearch,
                        hasForms: pc.hasForms,
                        mainContent: pc.mainContent?.substring(0, 500) || '', // Limit content length
                        suggestedTests: pc.suggestedTests
                    })),
                    documentation: documentationContext,
                    applicationLogic: applicationLogicContext,
                    analysisSummary: {
                        totalRoutes: routes.length,
                        totalForms: forms.length,
                        totalEndpoints: endpoints.length,
                        analyzedPages: pageContexts.length,
                        hasDocumentation: !!documentationContext.readme || !!documentationContext.apiDocs,
                        hasCoreLogic: applicationLogicContext.length > 0
                    }
                };

                console.log('✅ AI Test Generator: Context built successfully');
                console.log('✅ AI Test Generator: Analysis summary:', context.analysisSummary);

                progress.report({ message: '🚀 Sending context to AI model...' });

                console.log('🤖 TestFox AI: Calling AI to generate test cases...');
                console.log('🤖 TestFox AI: Context summary:', {
                    projectType: context.projectType,
                    framework: context.framework,
                    routesCount: context.routes.length,
                    formsCount: context.forms.length,
                    endpointsCount: context.endpoints.length,
                    pageContextsCount: context.pageContexts.length,
                    hasDocumentation: !!context.documentation?.readme,
                    hasApplicationLogic: context.applicationLogic?.length || 0
                });

                // Show detailed progress to user
                vscode.window.showInformationMessage('🤖 TestFox AI: Analyzing your application context and generating intelligent test cases...');

                // If the configured provider is Ollama, request structured output with Playwright and manual tests
                const config = vscode.workspace.getConfiguration('testfox');
                const provider = config.get<string>('ai.provider') || 'openrouter';

                let promptText = `Generate comprehensive test cases for this project based on the analysis above. Focus on functional testing, API testing, security testing (OWASP Top 10), and edge cases. Only generate tests for features that actually exist based on the page analysis.

IMPORTANT REQUIREMENTS:
1. Generate tests for ALL categories: smoke, functional, API, security, performance, UI, E2E, database, payment, integration, accessibility, regression, load, stress, monkey, negative, boundary, idempotency, webhooks, concurrency, state_integrity, reliability, failure_recovery, api_contract, stability, compliance, observability
2. Each test must include: name, description, priority (critical/high/medium/low), category, steps with clear actions and expected results
3. For security tests: include SQL injection, XSS, CSRF, directory traversal, header checks
4. For API tests: cover happy path, missing fields, invalid types, wrong methods, auth required
5. For UI tests: viewport responsiveness, interactive elements, loading states
6. For performance: Core Web Vitals, response times, caching
7. Add contextual information about WHY this test matters and what it validates
8. Ensure tests can run without errors by including proper setup and teardown`;

                if (provider === 'ollama') {
                    promptText = `Return a JSON object with two arrays: \n{ "playwright_tests": [ ... ], "manual_tests": [ ... ] }\n\n- Each item in "playwright_tests" should include: name, description, priority, code (full Playwright test code as a single string), and tags.\n- Each item in "manual_tests" should include: name, description, priority, steps (array of human-readable steps), expectedResult, category.\n\nMake sure the JSON is the only content in the response (no surrounding markdown or commentary).`;
                }

                // Generate test cases using AI service
                const aiResponse = await this.aiService.generate({
                    type: 'test-cases',
                    context: context,
                    prompt: promptText
                });

                if (!aiResponse.success) {
                    console.error('❌ TestFox AI: AI generation failed:', aiResponse.error);
                    throw new Error(aiResponse.error || 'AI generation failed');
                }

                const response = aiResponse.data;
                console.log('✅ TestFox AI: Received response from AI service, type:', typeof response);

                progress.report({ message: '🔄 Processing AI-generated tests...' });

                // Process tests progressively for streaming effect
                const rawResponse = typeof response === 'string' ? response : JSON.stringify(response);

                // Try to parse JSON directly to detect structured playwright/manual outputs
                let parsedResponse: any = null;
                try {
                    parsedResponse = JSON.parse(rawResponse);
                } catch (e) {
                    // Fallback to streaming parser which extracts JSON blocks
                }

                let tests: any[] = [];
                if (parsedResponse && (Array.isArray(parsedResponse.playwright_tests) || Array.isArray(parsedResponse.manual_tests))) {
                    // Convert structured response into TestCase[]
                    const playwright = Array.isArray(parsedResponse.playwright_tests) ? parsedResponse.playwright_tests : [];
                    const manual = Array.isArray(parsedResponse.manual_tests) ? parsedResponse.manual_tests : [];

                    // Convert playwright tests
                    for (const pt of playwright) {
                        const tc = this.convertPlaywrightToTestCase(pt);
                        tests.push(tc);
                    }

                    // Convert manual tests
                    for (const mt of manual) {
                        const tc = this.convertManualToTestCase(mt);
                        tests.push(tc);
                    }
                } else {
                    // Fallback to the generic streaming parser
                    tests = await this.parseAIResponseStreaming(rawResponse, progress);
                }

                // Ensure tests is an array
                if (!tests || !Array.isArray(tests)) {
                    console.warn('TestFox AI: parseAIResponse returned invalid result, using empty array');
                    return [];
                }

                // Add contextual tests from page analysis
                if (pageContexts.length > 0) {
                    progress.report({ message: 'Generating contextual tests from page analysis...' });
                    for (const pageContext of pageContexts) {
                        try {
                            const contextualTests = await this.contextAnalyzer.generateContextualTests(pageContext);
                            tests.push(...contextualTests);
                            console.log(`TestFox AI: Generated ${contextualTests.length} contextual tests for ${pageContext.url}`);
                        } catch (error) {
                            console.error(`TestFox AI: Failed to generate contextual tests for ${pageContext.url}:`, error);
                        }
                    }
                }

                // Add tests to store
                if (tests.length > 0) {
                    this.testStore.addTests(tests);
                    const contextualCount = pageContexts.length > 0 ? ` (including ${pageContexts.length} page${pageContexts.length > 1 ? 's' : ''} analyzed)` : '';
                    vscode.window.showInformationMessage(
                        `TestFox AI: Generated ${tests.length} test cases${contextualCount}`
                    );
                } else {
                    console.log('TestFox AI: No tests generated from AI response');
                }

                return tests;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.log('AI test generation failed, falling back to rule-based:', message);

                // Show warning but don't block test generation
                // Only show error if AI was explicitly enabled but failed
                // Don't show error if AI is simply not configured (onboarding will handle that)
                const config = vscode.workspace.getConfiguration('testfox');
                const apiKey = config.get<string>('ai.apiKey');
                if (apiKey) {
                    // API key exists but connection failed - show error
                    vscode.window.showWarningMessage(`TestFox AI failed: ${message}. Using rule-based generation.`);
                } else {
                    // No API key - silently fall back (onboarding will prompt if needed)
                    console.log('TestFox: AI not configured, using rule-based generation');
                }

                // Return empty array to trigger fallback to rule-based generation
                return [];
            }
        });
    }

    /**
     * Analyze page contexts from running application
     */
    private async analyzePageContexts(projectInfo: any): Promise<PageContext[]> {
        const contexts: PageContext[] = [];

        console.log('🔍 AI Test Generator: Starting comprehensive application context analysis');
        console.log('🔍 AI Test Generator: Project type:', projectInfo.type);
        console.log('🔍 AI Test Generator: Framework:', projectInfo.framework);

        try {
            const axios = require('axios').default;
            const AppRunner = require('../core/appRunner').AppRunner;
            const appRunner = new AppRunner();

            // Check if application is running, if not try to start it
            console.log('🔍 AI Test Generator: Checking if application is running...');
            let appUrl = await appRunner.detectRunningApplication(projectInfo);

            if (!appUrl) {
                console.log('🔍 AI Test Generator: Application not detected, attempting to start it...');

                // Try to start the application
                try {
                    const startResult = await appRunner.start(projectInfo);
                    if (startResult) {
                        console.log('✅ AI Test Generator: Application started successfully');
                        console.log('✅ AI Test Generator: Waiting for application to be ready...');

                        // Wait a bit for the app to start up
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        // Check again if it's now running
                        appUrl = await appRunner.detectRunningApplication(projectInfo);
                        if (appUrl) {
                            console.log('✅ AI Test Generator: Application is now running at:', appUrl);
                        } else {
                            console.log('⚠️ AI Test Generator: Application started but URL not detected');
                        }
                    } else {
                        console.log('❌ AI Test Generator: Failed to start application automatically');
                    }
                } catch (error) {
                    console.log('❌ AI Test Generator: Error starting application:', error);
                }
            } else {
                console.log('✅ AI Test Generator: Application is already running at:', appUrl);
            }

            if (!appUrl) {
                console.log('⚠️ AI Test Generator: Cannot analyze page contexts - application not accessible');
                return contexts;
            }

            console.log('🔍 AI Test Generator: Analyzing main application page...');
            // Analyze main page
            try {
                const response = await axios.get(appUrl, {
                    timeout: 10000, // Increased timeout for comprehensive analysis
                    headers: {
                        'User-Agent': 'TestFox-AI-Analyzer/1.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });

                if (response.data && typeof response.data === 'string') {
                    console.log('✅ AI Test Generator: Main page loaded successfully, analyzing content...');
                    const pageContext = await this.contextAnalyzer.analyzePageContent(response.data, appUrl);
                    contexts.push(pageContext);
                    console.log('✅ AI Test Generator: Main page analysis complete');
                }
            } catch (error) {
                console.error('❌ AI Test Generator: Failed to analyze main page:', error);
            }

            console.log('🔍 AI Test Generator: Analyzing additional routes and pages...');
            // Analyze additional routes if available
            const analysisResult = this.testStore.getAnalysisResult();
            if (analysisResult && analysisResult.routes && analysisResult.routes.length > 0) {
                // Analyze top 5 routes
                const routesToAnalyze = analysisResult.routes.slice(0, 5);
                for (const route of routesToAnalyze) {
                    try {
                        const routeUrl = `${appUrl}${route.path}`;
                        const response = await axios.get(routeUrl, {
                            timeout: 3000,
                            headers: {
                                'User-Agent': 'TestFox/1.0'
                            },
                            validateStatus: () => true
                        });
                        
                        if (response.status === 200 && typeof response.data === 'string') {
                            const pageContext = await this.contextAnalyzer.analyzePageContent(response.data, routeUrl);
                            contexts.push(pageContext);
                        }
                    } catch (error) {
                        // Skip routes that fail
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error('TestFox AI: Error analyzing page contexts:', error);
        }

        return contexts;
    }

    /**
     * Parse AI response into TestCase objects
     */
    private async parseAIResponseStreaming(response: string, progress: any): Promise<TestCase[]> {
        try {
            // Try to extract JSON from response
            let jsonStr = response;

            // Handle markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // Parse the JSON with error handling
            let parsed;
            try {
                parsed = JSON.parse(jsonStr.trim());
            } catch (parseError) {
                console.error('❌ AI Test Generator: Failed to parse JSON response:', parseError);
                console.error('❌ AI Test Generator: Raw response:', jsonStr.substring(0, 500));
                throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
            }

            const testsArray = parsed?.tests || parsed;

            if (!Array.isArray(testsArray)) {
                console.error('❌ AI Test Generator: AI response is not an array:', parsed);
                console.error('❌ AI Test Generator: Expected array, got:', typeof testsArray);
                return [];
            }

            console.log(`🎯 TestFox AI: AI generated ${testsArray.length} test cases, processing progressively...`);

            const processedTests: TestCase[] = [];
            const batchSize = 5; // Process tests in batches for streaming effect

            for (let i = 0; i < testsArray.length; i += batchSize) {
                const batch = testsArray.slice(i, i + batchSize);
                const batchTests = batch.map((test: any) => this.convertToTestCase(test));

                // Add batch to results
                processedTests.push(...batchTests);

                // Update progress
                const progressPercent = Math.round(((i + batch.length) / testsArray.length) * 100);
                progress.report({
                    message: `🔄 Processing AI tests... ${i + batch.length}/${testsArray.length} (${progressPercent}%)`
                });

                // Small delay for visual streaming effect
                await new Promise(resolve => setTimeout(resolve, 100));

                // Show progress notification
                if (i + batch.length < testsArray.length) {
                    vscode.window.showInformationMessage(
                        `🔄 TestFox AI: Processed ${i + batch.length} of ${testsArray.length} AI-generated test cases...`
                    );
                }
            }

            console.log(`✅ TestFox AI: Successfully processed ${processedTests.length} AI-generated test cases`);
            vscode.window.showInformationMessage(
                `🎉 TestFox AI: Successfully processed ${processedTests.length} intelligent test cases!`
            );

            return processedTests;
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.error('Response was:', response);
            vscode.window.showWarningMessage('⚠️ TestFox AI: Could not parse AI response, falling back to rule-based generation');
            return [];
        }
    }

    private async parseAIResponse(response: string): Promise<TestCase[]> {
        // Keep the old method for backward compatibility
        return await this.parseAIResponseStreaming(response, { report: () => {} });
    }

    /**
     * Convert AI response item to TestCase
     */
    private convertToTestCase(aiTest: any): TestCase {
        const category = this.normalizeCategory(aiTest.category);
        const priority = this.normalizePriority(aiTest.priority);
        const automationLevel = this.normalizeAutomationLevel(aiTest.automationLevel);

        // Convert steps to proper format
        const steps = (aiTest.steps || []).map((step: string, index: number) => ({
            order: index + 1,
            action: step,
            expected: ''
        }));

        return {
            id: uuidv4(),
            name: aiTest.name || 'Unnamed Test',
            description: aiTest.description || '',
            category,
            subcategory: aiTest.subcategory,
            automationLevel,
            priority,
            tags: aiTest.tags || [],
            steps,
            expectedResult: aiTest.expectedResult || 'Test should pass',
            targetElement: aiTest.targetElement,
            istqbTechnique: aiTest.istqbTechnique,
            securityType: aiTest.securityType
        };
    }

    /**
     * Convert a Playwright test object returned by AI into a TestCase
     */
    private convertPlaywrightToTestCase(playwrightTest: any): TestCase {
        const name = playwrightTest.name || 'Playwright Test';
        const description = playwrightTest.description || '';
        const priority = this.normalizePriority(playwrightTest.priority || 'high');

        const steps = [] as any[];
        const code = playwrightTest.code || playwrightTest.playwright || '';
        if (code) {
            steps.push({ order: 1, action: 'playwright-code', data: code, expected: 'Run Playwright script' });
        }

        return {
            id: uuidv4(),
            name,
            description,
            category: 'e2e',
            subcategory: undefined,
            automationLevel: 'full',
            priority,
            tags: (playwrightTest.tags || []).concat(['AI', 'playwright']),
            steps: steps.map((s: any) => ({ order: s.order, action: s.action, expected: s.expected, data: s.data } as any)),
            expectedResult: playwrightTest.expectedResult || 'Playwright test should pass',
            targetElement: undefined,
            istqbTechnique: undefined,
            securityType: undefined
        } as TestCase;
    }

    /**
     * Convert a manual test object returned by AI into a TestCase
     */
    private convertManualToTestCase(manualTest: any): TestCase {
        const name = manualTest.name || 'Manual Test';
        const description = manualTest.description || '';
        const priority = this.normalizePriority(manualTest.priority || 'medium');

        const steps = (manualTest.steps || []).map((s: string, i: number) => ({ order: i + 1, action: s, expected: '' }));

        return {
            id: uuidv4(),
            name,
            description,
            category: (manualTest.category || 'functional') as TestCategory,
            subcategory: manualTest.subcategory,
            automationLevel: 'manual',
            priority,
            tags: (manualTest.tags || []).concat(['AI', 'manual']),
            steps,
            expectedResult: manualTest.expectedResult || '',
            targetElement: undefined,
            istqbTechnique: undefined,
            securityType: undefined
        } as TestCase;
    }

    /**
     * Normalize category string to TestCategory
     */
    private normalizeCategory(category: string): TestCategory {
        const categoryMap: Record<string, TestCategory> = {
            'smoke': 'smoke',
            'sanity': 'sanity',
            'regression': 'regression',
            'functional': 'functional',
            'api': 'api',
            'ui': 'ui',
            'e2e': 'e2e',
            'integration': 'integration',
            'database': 'database',
            'security': 'security',
            'performance': 'performance',
            'load': 'load',
            'stress': 'stress',
            'edge_cases': 'functional', // Map edge cases to functional
            'edge': 'functional',
            'boundary': 'functional',
            'monkey': 'ui', // Map monkey testing to UI
            'feature': 'functional', // Map feature to functional
            'exploratory': 'ui',
            'usability': 'ui',
            'accessibility': 'ui',
            'compatibility': 'ui'
        };

        const normalized = (category || 'functional').toLowerCase().replace(/\s+/g, '_');
        return categoryMap[normalized] || 'functional';
    }

    /**
     * Normalize priority string to TestPriority
     */
    private normalizePriority(priority: string): TestPriority {
        const priorityMap: Record<string, TestPriority> = {
            'critical': 'critical',
            'high': 'high',
            'medium': 'medium',
            'low': 'low'
        };

        const normalized = (priority || 'medium').toLowerCase();
        return priorityMap[normalized] || 'medium';
    }

    /**
     * Normalize automation level
     */
    private normalizeAutomationLevel(level: string): AutomationLevel {
        const levelMap: Record<string, AutomationLevel> = {
            'full': 'full',
            'fully automated': 'full',
            'automated': 'full',
            'partial': 'partial',
            'semi-automated': 'partial',
            'manual': 'manual'
        };

        const normalized = (level || 'full').toLowerCase();
        return levelMap[normalized] || 'full';
    }

    /**
     * Enhance existing tests with AI
     */
    async enhanceTests(tests: TestCase[]): Promise<TestCase[]> {
        if (!this.aiService) {
            return tests;
        }

        const enhanced: TestCase[] = [];

        for (const test of tests) {
            try {
                const response = await this.aiService.generate({
                    type: 'test-details',
                    context: { testName: test.name, category: test.category },
                    prompt: `Enhance the following test case with more detailed steps and a clearer description.
                    Test Name: ${test.name}
                    Category: ${test.category}
                    
                    Return a JSON object with "description", "steps" (array of strings), and "expectedResult".`
                });

                if (response.success && response.data) {
                    const enhancement = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                    enhanced.push({
                        ...test,
                        description: enhancement.description || test.description,
                        steps: (enhancement.steps || []).map((step: string, i: number) => ({
                            order: i + 1,
                            action: step,
                            expected: ''
                        })),
                        expectedResult: enhancement.expectedResult || test.expectedResult
                    });
                } else {
                    enhanced.push(test);
                }
            } catch {
                enhanced.push(test);
            }
        }

        return enhanced;
    }

    /**
     * Generate security-specific tests with AI payloads
     */
    async generateSecurityTestsWithAI(analysisResult: AnalysisResult): Promise<TestCase[]> {
        if (!this.aiService) {
            return [];
        }

        const tests: TestCase[] = [];

        // Generate security payloads for each form field
        for (const form of analysisResult.forms) {
            for (const field of form.fields) {
                try {
                    const response = await this.aiService.generate({
                        type: 'payloads',
                        context: {
                            inputType: field.type,
                            fieldName: field.name,
                            endpoint: form.action
                        },
                        prompt: `Generate 5 specialized security testing payloads for the following input field:
                        Field Name: ${field.name}
                        Field Type: ${field.type}
                        Form Action: ${form.action}
                        
                        Return a JSON array of strings.`
                    });

                    if (response.success && response.data) {
                        const payloads = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                        if (Array.isArray(payloads)) {
                            tests.push({
                                id: uuidv4(),
                                name: `Security: AI-Generated payloads for ${form.name}.${field.name}`,
                                description: `Test ${field.name} with AI-generated security payloads`,
                                category: 'security',
                                subcategory: 'ai_generated',
                                automationLevel: 'full',
                                priority: 'high',
                                tags: ['AI', 'Security', 'OWASP'],
                                steps: payloads.map((payload: string, i: number) => ({
                                    order: i + 1,
                                    action: `Enter payload: ${payload}`,
                                    expected: 'Input sanitized or rejected'
                                })),
                                expectedResult: 'All malicious payloads are properly handled',
                                targetElement: {
                                    type: 'element',
                                    selector: `[name="${field.name}"]`
                                },
                                securityType: 'input_validation'
                            });
                        }
                    }
                } catch {
                    // Skip if AI fails for this field
                }
            }
        }

        return tests;
    }

    /**
     * Gather application documentation for better AI context
     */
    private async gatherApplicationDocumentation(projectInfo: any): Promise<{
        readme: string | null;
        apiDocs: string | null;
        packageJson: any | null;
    }> {
        console.log('📚 AI Test Generator: Gathering application documentation...');

        const fs = require('fs').promises;
        const path = require('path');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            console.log('⚠️ AI Test Generator: No workspace folder available');
            return { readme: null, apiDocs: null, packageJson: null };
        }

        const docs = {
            readme: null as string | null,
            apiDocs: null as string | null,
            packageJson: null as any | null
        };

        try {
            // Read README files
            const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'readme.txt'];
            for (const readmeFile of readmeFiles) {
                try {
                    const readmePath = path.join(workspaceFolder, readmeFile);
                    const content = await fs.readFile(readmePath, 'utf8');
                    docs.readme = content.substring(0, 2000); // Limit size
                    console.log('✅ AI Test Generator: README found and loaded');
                    break;
                } catch {
                    continue;
                }
            }

            // Read package.json
            try {
                const packagePath = path.join(workspaceFolder, 'package.json');
                const content = await fs.readFile(packagePath, 'utf8');
                docs.packageJson = JSON.parse(content);
                console.log('✅ AI Test Generator: package.json found and loaded');
            } catch (error) {
                console.log('⚠️ AI Test Generator: Could not read package.json:', error);
            }

            // Look for API documentation
            const apiDocFiles = ['API.md', 'api.md', 'docs/API.md', 'docs/api.md', 'swagger.json', 'openapi.json'];
            for (const apiFile of apiDocFiles) {
                try {
                    const apiPath = path.join(workspaceFolder, apiFile);
                    const content = await fs.readFile(apiPath, 'utf8');
                    docs.apiDocs = content.substring(0, 1500); // Limit size
                    console.log('✅ AI Test Generator: API documentation found and loaded');
                    break;
                } catch {
                    continue;
                }
            }

        } catch (error) {
            console.log('⚠️ AI Test Generator: Error gathering documentation:', error);
        }

        return docs;
    }

    /**
     * Gather core application logic files for better AI understanding
     */
    private async gatherApplicationLogic(projectInfo: any): Promise<string[]> {
        console.log('🧠 AI Test Generator: Gathering core application logic...');

        const fs = require('fs').promises;
        const path = require('path');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            console.log('⚠️ AI Test Generator: No workspace folder available');
            return [];
        }

        const logicFiles: string[] = [];
        const maxFiles = 5; // Limit number of files to avoid overwhelming the AI
        const maxFileSize = 1000; // Limit file size in characters

        try {
            // Define patterns for core logic files based on framework
            const patterns: Record<string, string[]> = {
                'react': ['src/App.js', 'src/App.tsx', 'src/index.js', 'src/index.tsx', 'src/main.js', 'src/main.tsx'],
                'vue': ['src/App.vue', 'src/main.js', 'src/main.ts'],
                'angular': ['src/app/app.component.ts', 'src/app/app.module.ts', 'src/main.ts'],
                'nextjs': ['pages/_app.js', 'pages/_app.tsx', 'src/app/layout.tsx', 'src/app/page.tsx'],
                'nuxt': ['pages/index.vue', 'nuxt.config.js'],
                'svelte': ['src/App.svelte', 'src/main.js'],
                'express': ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js'],
                'flask': ['app.py', 'application.py', 'server.py'],
                'django': ['manage.py', 'settings.py', 'urls.py'],
                'spring': ['src/main/java/**/*.java'],
                'dotnet': ['Program.cs', 'Startup.cs', 'Controllers/**/*.cs']
            };

            const framework = projectInfo.framework?.toLowerCase() || 'unknown';
            const filePatterns = patterns[framework] || ['index.js', 'main.js', 'app.js', 'server.js'];

            for (const pattern of filePatterns) {
                if (logicFiles.length >= maxFiles) break;

                try {
                    const filePath = path.join(workspaceFolder, pattern);
                    const stats = await fs.stat(filePath);

                    if (stats.isFile()) {
                        const content = await fs.readFile(filePath, 'utf8');
                        const truncatedContent = content.substring(0, maxFileSize);
                        logicFiles.push(`${pattern}:\n${truncatedContent}`);
                        console.log('✅ AI Test Generator: Core logic file loaded:', pattern);
                    }
                } catch {
                    continue;
                }
            }

            // If no framework-specific files found, try to find main entry points
            if (logicFiles.length === 0) {
                const commonFiles = ['index.js', 'main.js', 'app.js', 'server.js', 'main.py', 'app.py'];
                for (const file of commonFiles) {
                    if (logicFiles.length >= maxFiles) break;

                    try {
                        const filePath = path.join(workspaceFolder, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const truncatedContent = content.substring(0, maxFileSize);
                        logicFiles.push(`${file}:\n${truncatedContent}`);
                        console.log('✅ AI Test Generator: Common logic file loaded:', file);
                    } catch {
                        continue;
                    }
                }
            }

        } catch (error) {
            console.log('⚠️ AI Test Generator: Error gathering application logic:', error);
        }

        console.log('✅ AI Test Generator: Gathered', logicFiles.length, 'logic files');
        return logicFiles;
    }

    /**
     * Enhance runtime-generated tests with AI
     */
    async enhanceRuntimeTests(runtimeTests: TestCase[], runtimeAppInfo: RuntimeAppInfo): Promise<TestCase[]> {
        if (!this.aiService) {
            console.log('⚠️ AI Test Generator: No AI service available, returning runtime tests as-is');
            return runtimeTests;
        }

        try {
            const prompt = `You are an expert QA engineer. I have analyzed a running web application and generated basic test cases. Now I need you to enhance these tests with more sophisticated scenarios and edge cases based on the application's actual UI elements.

Application Info:
- Title: ${runtimeAppInfo.title}
- URL: ${runtimeAppInfo.url}
- Has Login Form: ${runtimeAppInfo.hasLoginForm}
- Has Signup Form: ${runtimeAppInfo.hasSignupForm}
- Navigation Elements: ${runtimeAppInfo.navigationElements.length}
- Forms: ${runtimeAppInfo.formElements.length}
- Buttons: ${runtimeAppInfo.buttons.length}
- Links: ${runtimeAppInfo.links.length}

Current Runtime Tests:
${JSON.stringify(runtimeTests, null, 2)}

Please enhance these tests by:
1. Adding more realistic test data and edge cases
2. Including validation of error messages and success states
3. Adding tests for form validation rules
4. Testing different user flows and navigation paths
5. Adding accessibility and usability test scenarios
6. Including tests for responsive design and mobile compatibility
7. Adding security-focused test scenarios

Return the enhanced test cases in the same JSON format, keeping the existing test IDs and structure but improving the test steps, descriptions, and adding new test cases where appropriate.

Focus on tests that would be most valuable for a real application user experience.`;

            const response = await this.aiService.generate(prompt);
            console.log('🤖 AI Test Generator: Received enhancement response');

            try {
                // Parse the AI response as JSON
                const enhancedTests = JSON.parse(response);

                if (Array.isArray(enhancedTests) && enhancedTests.length > 0) {
                    // Validate that each test has the required structure
                    const validTests = enhancedTests.filter(test =>
                        test.id && test.name && test.steps && Array.isArray(test.steps)
                    );

                    console.log(`✅ AI Test Generator: Enhanced ${validTests.length} test cases`);
                    return validTests;
                } else {
                    console.log('⚠️ AI Test Generator: Invalid enhancement response format');
                    return runtimeTests;
                }
            } catch (parseError) {
                console.log('⚠️ AI Test Generator: Failed to parse AI enhancement response:', parseError);
                return runtimeTests;
            }

        } catch (error) {
            console.error('❌ AI Test Generator: Error enhancing runtime tests:', error);
            return runtimeTests;
        }
    }
}

