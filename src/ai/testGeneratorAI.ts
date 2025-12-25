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

/**
 * AI-enhanced test generator using OpenRouter
 */
export class TestGeneratorAI {
    private openRouter = getOpenRouterClient();

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

                const context = {
                    projectType: projectInfo.type,
                    framework: projectInfo.framework || 'unknown',
                    routes: analysisResult.routes.map(r => `${r.method} ${r.path}`),
                    forms: analysisResult.forms.map(f => f.name),
                    endpoints: analysisResult.endpoints.map(e => `${e.method} ${e.path}`),
                    authFlows: analysisResult.authFlows.map(a => a.type)
                };

                progress.report({ message: 'Calling AI model...' });

                const response = await this.openRouter.generateTestCases(context);

                progress.report({ message: 'Processing AI response...' });

                const tests = this.parseAIResponse(response);

                // Add tests to store
                this.testStore.addTests(tests);

                vscode.window.showInformationMessage(
                    `TestFox AI: Generated ${tests.length} test cases`
                );

                return tests;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.log('AI test generation failed, falling back to rule-based:', message);

                // Show warning but don't block test generation
                vscode.window.showWarningMessage(`TestFox AI failed: ${message}. Using rule-based generation.`);

                // Return empty array to trigger fallback to rule-based generation
                return [];
            }
        });
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
            'functional': 'functional',
            'api': 'api',
            'security': 'security',
            'performance': 'performance',
            'load': 'load',
            'edge_cases': 'edge_cases',
            'edge': 'edge_cases',
            'boundary': 'edge_cases',
            'monkey': 'monkey',
            'feature': 'feature'
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

