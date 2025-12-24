import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestCase, TestCategory, ProjectInfo, CodeAnalysis } from '../types';
import { getOpenRouterClient } from '../ai/openRouterClient';

export interface E2EScenario {
    name: string;
    description: string;
    userStory: string;
    steps: ScenarioStep[];
    preconditions: string[];
    expectedOutcome: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: 'happy-path' | 'error-handling' | 'edge-case' | 'security' | 'performance';
}

export interface ScenarioStep {
    action: string;
    element?: string;
    data?: string;
    assertion?: string;
}

export interface UIComponent {
    type: 'form' | 'button' | 'link' | 'input' | 'table' | 'modal' | 'navigation' | 'card';
    name: string;
    path: string;
    interactions: string[];
}

/**
 * AI-powered E2E and UI test generator
 * Uses AI to understand the application and generate comprehensive test scenarios
 */
export class AIE2ETestGenerator {
    private workspacePath: string;
    private outputChannel: vscode.OutputChannel;
    private openRouter = getOpenRouterClient();

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.outputChannel = vscode.window.createOutputChannel('TestFox AI E2E');
    }

    /**
     * Generate E2E tests by analyzing the entire application with AI
     */
    async generateE2ETests(projectInfo: ProjectInfo, codeAnalysis: CodeAnalysis): Promise<TestCase[]> {
        this.outputChannel.show();
        this.log('🤖 Starting AI-powered E2E test generation...');

        const tests: TestCase[] = [];

        // Gather application context
        const appContext = await this.gatherApplicationContext(projectInfo, codeAnalysis);
        
        if (!this.openRouter.isConfigured()) {
            this.log('⚠️ AI not configured - generating basic E2E tests');
            return this.generateBasicE2ETests(codeAnalysis);
        }

        try {
            // Generate user journey tests
            this.log('📍 Generating user journey tests...');
            const journeyTests = await this.generateUserJourneyTests(appContext);
            tests.push(...journeyTests);

            // Generate form interaction tests
            this.log('📝 Generating form interaction tests...');
            const formTests = await this.generateFormTests(codeAnalysis);
            tests.push(...formTests);

            // Generate navigation tests
            this.log('🧭 Generating navigation tests...');
            const navTests = await this.generateNavigationTests(codeAnalysis);
            tests.push(...navTests);

            // Generate authentication flow tests
            this.log('🔐 Generating authentication tests...');
            const authTests = await this.generateAuthFlowTests(codeAnalysis);
            tests.push(...authTests);

            // Generate error handling tests
            this.log('⚠️ Generating error handling tests...');
            const errorTests = await this.generateErrorHandlingTests(appContext);
            tests.push(...errorTests);

            // Generate responsive/mobile tests
            this.log('📱 Generating responsive tests...');
            const responsiveTests = await this.generateResponsiveTests(appContext);
            tests.push(...responsiveTests);

            this.log(`✅ Generated ${tests.length} E2E tests`);

        } catch (error: any) {
            this.log(`❌ AI generation error: ${error.message}`);
            // Fallback to basic tests
            return this.generateBasicE2ETests(codeAnalysis);
        }

        return tests;
    }

    /**
     * Gather comprehensive application context for AI
     */
    private async gatherApplicationContext(projectInfo: ProjectInfo, codeAnalysis: CodeAnalysis): Promise<string> {
        const context: string[] = [];

        // Project info
        context.push(`Application Type: ${projectInfo.type}`);
        context.push(`Framework: ${projectInfo.framework || 'Unknown'}`);
        context.push(`Has Backend: ${projectInfo.hasBackend}`);
        context.push(`Has Frontend: ${projectInfo.hasFrontend}`);

        // Routes
        if (codeAnalysis.routes.length > 0) {
            context.push(`\nRoutes/Pages:\n${codeAnalysis.routes.map(r => `- ${r.method} ${r.path}`).join('\n')}`);
        }

        // Forms
        if (codeAnalysis.forms.length > 0) {
            context.push(`\nForms:\n${codeAnalysis.forms.map(f => `- ${f.name}: ${f.fields.map(field => field.name).join(', ')}`).join('\n')}`);
        }

        // Auth flows
        if (codeAnalysis.authFlows.length > 0) {
            context.push(`\nAuthentication:\n${codeAnalysis.authFlows.map(a => `- ${a.type}: ${a.endpoint}`).join('\n')}`);
        }

        // API endpoints
        if (codeAnalysis.apiEndpoints.length > 0) {
            context.push(`\nAPI Endpoints:\n${codeAnalysis.apiEndpoints.slice(0, 20).map(e => `- ${e.method} ${e.path}`).join('\n')}`);
        }

        // Read key files for more context
        const keyFiles = await this.readKeyFiles();
        if (keyFiles) {
            context.push(`\nKey Code Patterns:\n${keyFiles}`);
        }

        return context.join('\n');
    }

    /**
     * Read key files for context
     */
    private async readKeyFiles(): Promise<string> {
        const patterns = [
            'src/app/page.tsx',
            'src/pages/index.tsx',
            'pages/index.tsx',
            'src/App.tsx',
            'src/App.vue',
            'src/routes.ts',
            'src/router/index.ts'
        ];

        for (const pattern of patterns) {
            const filePath = path.join(this.workspacePath, pattern);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    // Extract key patterns (component names, routes, etc.)
                    return content.substring(0, 2000); // Limit for AI context
                } catch {
                    continue;
                }
            }
        }
        return '';
    }

    /**
     * Generate user journey tests using AI
     */
    private async generateUserJourneyTests(appContext: string): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        try {
            const prompt = `Analyze this application and generate comprehensive E2E user journey test scenarios:

${appContext}

Generate 8-10 realistic user journey tests covering:
1. Complete user registration and onboarding flow
2. Main feature usage (based on the app type)
3. Data creation, editing, and deletion flows
4. Search and filtering functionality
5. User profile management
6. Settings and preferences
7. Error recovery scenarios
8. Multi-step workflows

Return JSON array:
[{
  "name": "Test name",
  "description": "What this tests",
  "userStory": "As a user, I want to...",
  "steps": ["Step 1", "Step 2", ...],
  "priority": "critical|high|medium|low",
  "category": "happy-path|error-handling|edge-case"
}]`;

            const response = await this.openRouter.chat([{ role: 'user', content: prompt }]);
            const scenarios = this.parseAIResponse(response);

            for (const scenario of scenarios) {
                tests.push(this.createE2ETest(
                    `e2e-journey-${this.slugify(scenario.name)}`,
                    scenario.name,
                    'ui_e2e',
                    scenario.description,
                    scenario.steps || [],
                    scenario.priority || 'medium',
                    ['e2e', 'user-journey', scenario.category || 'happy-path']
                ));
            }
        } catch (error: any) {
            this.log(`User journey generation error: ${error.message}`);
        }

        return tests;
    }

    /**
     * Generate form interaction tests
     */
    private async generateFormTests(codeAnalysis: CodeAnalysis): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        if (codeAnalysis.forms.length === 0) {
            return tests;
        }

        try {
            const formInfo = codeAnalysis.forms.map(f => ({
                name: f.name,
                fields: f.fields.map(field => ({
                    name: field.name,
                    type: field.type,
                    required: field.validation?.required
                }))
            }));

            const prompt = `Generate comprehensive form testing scenarios for these forms:

${JSON.stringify(formInfo, null, 2)}

For each form, generate tests for:
1. Valid submission with all required fields
2. Empty submission (validation errors)
3. Boundary value testing for each field
4. Special characters and injection attempts
5. Maximum length validation
6. Format validation (email, phone, etc.)
7. Form reset and clear functionality
8. Auto-save and draft functionality (if applicable)

Return JSON array:
[{
  "name": "Form test name",
  "description": "What this tests",
  "formName": "Which form",
  "testType": "valid|invalid|boundary|security",
  "steps": ["Step 1", "Step 2", ...],
  "priority": "high|medium|low"
}]`;

            const response = await this.openRouter.chat([{ role: 'user', content: prompt }]);
            const scenarios = this.parseAIResponse(response);

            for (const scenario of scenarios) {
                tests.push(this.createE2ETest(
                    `e2e-form-${this.slugify(scenario.name)}`,
                    scenario.name,
                    'ui_e2e',
                    scenario.description,
                    scenario.steps || [],
                    scenario.priority || 'medium',
                    ['e2e', 'form', scenario.testType || 'validation']
                ));
            }
        } catch (error: any) {
            this.log(`Form test generation error: ${error.message}`);
        }

        return tests;
    }

    /**
     * Generate navigation tests
     */
    private async generateNavigationTests(codeAnalysis: CodeAnalysis): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        if (codeAnalysis.routes.length === 0) {
            return tests;
        }

        // Basic navigation tests for each route
        for (const route of codeAnalysis.routes.slice(0, 15)) {
            tests.push(this.createE2ETest(
                `e2e-nav-${this.slugify(route.path)}`,
                `Navigation - ${route.path}`,
                'ui_e2e',
                `Verify navigation to ${route.path} works correctly`,
                [
                    `Navigate to ${route.path}`,
                    'Verify page loads without errors',
                    'Verify URL is correct',
                    'Verify page title is appropriate',
                    'Check for console errors'
                ],
                'medium',
                ['e2e', 'navigation']
            ));
        }

        // Breadcrumb and back navigation
        tests.push(this.createE2ETest(
            'e2e-nav-back-button',
            'Navigation - Browser Back Button',
            'ui_e2e',
            'Verify browser back button works correctly',
            [
                'Navigate through multiple pages',
                'Click browser back button',
                'Verify correct page is shown',
                'Verify state is preserved'
            ],
            'high',
            ['e2e', 'navigation']
        ));

        // Deep linking
        tests.push(this.createE2ETest(
            'e2e-nav-deep-link',
            'Navigation - Deep Linking',
            'ui_e2e',
            'Verify direct URL access works correctly',
            [
                'Access a deep link URL directly',
                'Verify page loads correctly',
                'Verify all required data is loaded'
            ],
            'medium',
            ['e2e', 'navigation', 'deep-link']
        ));

        return tests;
    }

    /**
     * Generate authentication flow tests
     */
    private async generateAuthFlowTests(codeAnalysis: CodeAnalysis): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        const hasAuth = codeAnalysis.authFlows.length > 0;
        
        if (!hasAuth) {
            // Check for common auth patterns
            const authPatterns = codeAnalysis.routes.some(r => 
                r.path.includes('login') || r.path.includes('auth') || 
                r.path.includes('signin') || r.path.includes('register')
            );
            if (!authPatterns) return tests;
        }

        // Login tests
        tests.push(this.createE2ETest(
            'e2e-auth-login-valid',
            'Authentication - Valid Login',
            'ui_e2e',
            'Verify successful login with valid credentials',
            [
                'Navigate to login page',
                'Enter valid email',
                'Enter valid password',
                'Click login button',
                'Verify redirect to dashboard/home',
                'Verify user session is created'
            ],
            'critical',
            ['e2e', 'auth', 'login']
        ));

        tests.push(this.createE2ETest(
            'e2e-auth-login-invalid',
            'Authentication - Invalid Login',
            'ui_e2e',
            'Verify error handling for invalid credentials',
            [
                'Navigate to login page',
                'Enter invalid email/password',
                'Click login button',
                'Verify error message is displayed',
                'Verify user is not logged in'
            ],
            'critical',
            ['e2e', 'auth', 'login', 'negative']
        ));

        tests.push(this.createE2ETest(
            'e2e-auth-logout',
            'Authentication - Logout',
            'ui_e2e',
            'Verify logout functionality',
            [
                'Login with valid credentials',
                'Click logout button/link',
                'Verify session is destroyed',
                'Verify redirect to login page',
                'Verify protected pages are inaccessible'
            ],
            'critical',
            ['e2e', 'auth', 'logout']
        ));

        tests.push(this.createE2ETest(
            'e2e-auth-session-persist',
            'Authentication - Session Persistence',
            'ui_e2e',
            'Verify session persists across page refreshes',
            [
                'Login with valid credentials',
                'Refresh the page',
                'Verify user is still logged in',
                'Navigate to different pages',
                'Verify session is maintained'
            ],
            'high',
            ['e2e', 'auth', 'session']
        ));

        tests.push(this.createE2ETest(
            'e2e-auth-protected-routes',
            'Authentication - Protected Routes',
            'ui_e2e',
            'Verify unauthenticated users cannot access protected routes',
            [
                'Ensure user is logged out',
                'Try to access protected route directly',
                'Verify redirect to login page',
                'Verify appropriate error message'
            ],
            'critical',
            ['e2e', 'auth', 'security']
        ));

        return tests;
    }

    /**
     * Generate error handling tests
     */
    private async generateErrorHandlingTests(appContext: string): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        tests.push(this.createE2ETest(
            'e2e-error-404',
            'Error Handling - 404 Page Not Found',
            'ui_e2e',
            'Verify 404 error page is shown for invalid routes',
            [
                'Navigate to a non-existent route',
                'Verify 404 page is displayed',
                'Verify navigation back to home works'
            ],
            'medium',
            ['e2e', 'error-handling', '404']
        ));

        tests.push(this.createE2ETest(
            'e2e-error-network',
            'Error Handling - Network Error',
            'ui_e2e',
            'Verify graceful handling of network errors',
            [
                'Simulate network disconnection',
                'Attempt to perform an action',
                'Verify error message is shown',
                'Verify retry option is available'
            ],
            'high',
            ['e2e', 'error-handling', 'network']
        ));

        tests.push(this.createE2ETest(
            'e2e-error-validation',
            'Error Handling - Form Validation Errors',
            'ui_e2e',
            'Verify validation errors are clearly displayed',
            [
                'Submit form with invalid data',
                'Verify all validation errors are shown',
                'Verify errors are associated with correct fields',
                'Fix errors and verify they clear'
            ],
            'high',
            ['e2e', 'error-handling', 'validation']
        ));

        return tests;
    }

    /**
     * Generate responsive/mobile tests
     */
    private async generateResponsiveTests(appContext: string): Promise<TestCase[]> {
        const tests: TestCase[] = [];
        const viewports = [
            { name: 'Mobile Portrait', width: 375, height: 667 },
            { name: 'Mobile Landscape', width: 667, height: 375 },
            { name: 'Tablet Portrait', width: 768, height: 1024 },
            { name: 'Desktop', width: 1920, height: 1080 }
        ];

        for (const viewport of viewports) {
            tests.push(this.createE2ETest(
                `e2e-responsive-${viewport.name.toLowerCase().replace(' ', '-')}`,
                `Responsive - ${viewport.name} Layout`,
                'ui_e2e',
                `Verify layout and functionality at ${viewport.width}x${viewport.height}`,
                [
                    `Set viewport to ${viewport.width}x${viewport.height}`,
                    'Verify all content is visible',
                    'Verify navigation is accessible',
                    'Verify interactive elements are clickable',
                    'Verify no horizontal scroll issues'
                ],
                'medium',
                ['e2e', 'responsive', viewport.name.toLowerCase()]
            ));
        }

        return tests;
    }

    /**
     * Generate basic E2E tests without AI
     */
    private generateBasicE2ETests(codeAnalysis: CodeAnalysis): TestCase[] {
        const tests: TestCase[] = [];

        // Basic page load tests
        tests.push(this.createE2ETest(
            'e2e-basic-home',
            'E2E - Home Page Load',
            'ui_e2e',
            'Verify home page loads correctly',
            ['Navigate to home page', 'Verify page loads', 'Check for errors'],
            'high',
            ['e2e', 'basic']
        ));

        // Form tests for discovered forms
        for (const form of codeAnalysis.forms.slice(0, 5)) {
            tests.push(this.createE2ETest(
                `e2e-basic-form-${this.slugify(form.name)}`,
                `E2E - ${form.name} Form`,
                'ui_e2e',
                `Test ${form.name} form submission`,
                ['Fill form fields', 'Submit form', 'Verify response'],
                'medium',
                ['e2e', 'form']
            ));
        }

        // Route tests
        for (const route of codeAnalysis.routes.slice(0, 10)) {
            tests.push(this.createE2ETest(
                `e2e-basic-route-${this.slugify(route.path)}`,
                `E2E - Route ${route.path}`,
                'ui_e2e',
                `Verify ${route.path} is accessible`,
                [`Navigate to ${route.path}`, 'Verify page loads'],
                'medium',
                ['e2e', 'navigation']
            ));
        }

        return tests;
    }

    private parseAIResponse(response: string): any[] {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch {
            // Parsing failed
        }
        return [];
    }

    private slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50);
    }

    private createE2ETest(
        id: string,
        name: string,
        category: TestCategory,
        description: string,
        steps: string[],
        priority: string,
        tags: string[]
    ): TestCase {
        return {
            id,
            name,
            category,
            description,
            automationLevel: 'automated',
            priority: priority as 'critical' | 'high' | 'medium' | 'low',
            status: 'pending',
            tags,
            steps: steps.map((step, i) => ({
                order: i + 1,
                action: step,
                expectedResult: 'Step completes successfully'
            })),
            expectedResult: 'All steps complete successfully',
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

