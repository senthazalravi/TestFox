import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { getOpenRouterClient } from './openRouterClient';
import { TestStore } from '../store/testStore';
import {
    TestCase,
    TestCategory,
    AutomationLevel,
    TestPriority,
    AnalysisResult
} from '../types';
import { ContextAnalyzer, PageContext } from '../core/contextAnalyzer';

/**
 * AI-enhanced test generator using OpenRouter
 */
export class TestGeneratorAI {
    private openRouter = getOpenRouterClient();
    private contextAnalyzer = new ContextAnalyzer();

    constructor(private testStore: TestStore) {}

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
     * Generate tests using AI
     */
    async generateWithAI(): Promise<TestCase[]> {
        const projectInfo = this.testStore.getProjectInfo();
        const analysisResult = this.testStore.getAnalysisResult();

        if (!projectInfo) {
            throw new Error('Project not analyzed. Run analysis first.');
        }

        if (!analysisResult) {
            throw new Error('Analysis result not available. Run analysis first.');
        }

        // Ensure analysis result has valid structure
        this.ensureValidAnalysisResult(analysisResult);

        if (!this.openRouter.isEnabled()) {
            vscode.window.showWarningMessage(
                'AI is not configured. Using rule-based test generation.',
                'Configure AI'
            ).then(selection => {
                if (selection === 'Configure AI') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.ai');
                }
            });
            return [];
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox AI: Generating tests...',
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
                        mainContent: pc.mainContent,
                        suggestedTests: pc.suggestedTests
                    }))
                };

                progress.report({ message: 'Calling AI model...' });

                console.log('TestFox AI: Calling OpenRouter to generate test cases...');
                console.log('TestFox AI: Context:', {
                    projectType: context.projectType,
                    framework: context.framework,
                    routesCount: context.routes.length,
                    formsCount: context.forms.length,
                    endpointsCount: context.endpoints.length,
                    pageContextsCount: context.pageContexts.length
                });

                const response = await this.openRouter.generateTestCases(context);
                console.log('TestFox AI: Received response from OpenRouter, length:', response?.length || 0);

                progress.report({ message: 'Processing AI response...' });

                const tests = this.parseAIResponse(response);

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
        
        try {
            // Check if application is running
            const axios = require('axios').default;
            const portsToCheck = [3000, 8080, 4200, 5000, 8000, 4000, 5173];
            let appUrl: string | null = null;

            for (const port of portsToCheck) {
                try {
                    const url = `http://localhost:${port}`;
                    const response = await axios.get(url, {
                        timeout: 2000,
                        validateStatus: () => true
                    });
                    if (response.status < 500) {
                        appUrl = url;
                        break;
                    }
                } catch {
                    continue;
                }
            }

            if (!appUrl) {
                console.log('TestFox AI: Application not running, skipping page context analysis');
                return contexts;
            }

            // Analyze main page
            try {
                const response = await axios.get(appUrl, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'TestFox/1.0'
                    }
                });
                
                if (response.data && typeof response.data === 'string') {
                    const pageContext = await this.contextAnalyzer.analyzePageContent(response.data, appUrl);
                    contexts.push(pageContext);
                }
            } catch (error) {
                console.error('TestFox AI: Failed to analyze main page:', error);
            }

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
    private parseAIResponse(response: string): TestCase[] {
        try {
            // Try to extract JSON from response
            let jsonStr = response;
            
            // Handle markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            // Parse the JSON
            const parsed = JSON.parse(jsonStr.trim());
            const testsArray = parsed.tests || parsed;

            if (!Array.isArray(testsArray)) {
                console.error('AI response is not an array:', parsed);
                return [];
            }

            return testsArray.map((test: any) => this.convertToTestCase(test));
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            console.error('Response was:', response);
            return [];
        }
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
        if (!this.openRouter.isEnabled()) {
            return tests;
        }

        const enhanced: TestCase[] = [];

        for (const test of tests) {
            try {
                const enhancement = await this.openRouter.enhanceTestDescription(
                    test.name,
                    test.category
                );

                enhanced.push({
                    ...test,
                    description: enhancement.description || test.description,
                    steps: enhancement.steps.map((step, i) => ({
                        order: i + 1,
                        action: step,
                        expected: ''
                    })),
                    expectedResult: enhancement.expectedResult || test.expectedResult
                });
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
        if (!this.openRouter.isEnabled()) {
            return [];
        }

        const tests: TestCase[] = [];

        // Generate security payloads for each form field
        for (const form of analysisResult.forms) {
            for (const field of form.fields) {
                try {
                    const payloads = await this.openRouter.generateSecurityPayloads({
                        inputType: field.type as any,
                        fieldName: field.name,
                        endpoint: form.action
                    });

                    tests.push({
                        id: uuidv4(),
                        name: `Security: AI-Generated payloads for ${form.name}.${field.name}`,
                        description: `Test ${field.name} with AI-generated security payloads`,
                        category: 'security',
                        subcategory: 'ai_generated',
                        automationLevel: 'full',
                        priority: 'high',
                        tags: ['AI', 'Security', 'OWASP'],
                        steps: payloads.map((payload, i) => ({
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
                } catch {
                    // Skip if AI fails for this field
                }
            }
        }

        return tests;
    }
}

