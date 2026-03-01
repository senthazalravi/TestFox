/**
 * MCP Orchestrator - Central coordinator for AI + MCP automation
 * 
 * This orchestrator manages the flow between AI agent and MCP servers
 * to generate complete end-to-end test suites with one click.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface MCPRequest {
    type: 'playwright' | 'postman' | 'devtools';
    projectAnalysis: ProjectAnalysis;
}

export interface ProjectAnalysis {
    language: string;
    framework?: string;
    routes: string[];
    apis: string[];
    components: string[];
    structure: any;
    dependencies: any;
}

export interface MCPResponse {
    success: boolean;
    files: MCPFile[];
    error?: string;
}

export interface MCPFile {
    path: string;
    content: string;
    type: 'config' | 'test' | 'fixture' | 'collection' | 'environment';
}

/**
 * Master AI Agent System Prompt
 */
const TESTFOX_AI_AGENT_PROMPT = `You are TestFox AI Agent. Your job is to generate complete end-to-end automated tests for any project using three MCP servers: Playwright MCP, Postman MCP, and DevTools MCP.

Your responsibilities:
1. Understand project structure, language, frameworks, routes, APIs, and architecture.
2. Decide which MCP server is needed based on user's action.
3. Produce complete test suites with correct folder structure and file names.
4. Always generate runnable, self-contained tests.
5. Never ask user questions unless absolutely required.
6. Use the following rules for each MCP server:

PLAYWRIGHT MCP RULES:
- Create a /tests/playwright folder if missing.
- Generate playwright.config.ts with sensible defaults.
- Generate fixtures.ts for authentication and shared utilities.
- Generate smoke, sanity, functional, accessibility, and E2E tests.
- Infer selectors, flows, and routes from project.
- Use best practices: test.describe, test.beforeEach, fixtures, roles.

POSTMAN MCP RULES:
- Create a /tests/postman folder.
- Generate a Postman collection.json.
- Detect internal APIs from code (controllers, routes, handlers).
- Detect external APIs from config files.
- Create CRUD tests, auth tests, negative tests, and security tests.
- Use JSON schemas when possible.

DEVTOOLS MCP RULES:
- Create a /tests/devtools folder.
- Generate tests for:
    - Network: blocked requests, caching, slow responses
    - Console: errors, warnings
    - Performance: LCP, FID, CLS
    - Coverage: unused JS/CSS
- Use Chrome DevTools Protocol commands.

OUTPUT RULES:
- Always output complete file contents.
- Always specify file paths.
- Always generate runnable code.
- Never output placeholders.
- Never output partial tests.

Your goal is to make TestFox a fully automated end-to-end testing engine.`;

/**
 * MCP Orchestrator Class
 */
export class MCPOrchestrator {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestFox MCP Orchestrator');
    }

    /**
     * Generate tests using specified MCP server
     */
    async generateTests(mcpType: 'playwright' | 'postman' | 'devtools'): Promise<void> {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Generating ${mcpType.toUpperCase()} tests...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing project...' });
                
                // Step 1: Analyze project
                const projectAnalysis = await this.analyzeProject();
                
                progress.report({ increment: 30, message: 'Generating tests with AI...' });
                
                // Step 2: Generate tests using AI
                const response = await this.generateWithAI(mcpType, projectAnalysis);
                
                progress.report({ increment: 60, message: 'Writing files...' });
                
                // Step 3: Write files to disk
                await this.writeFiles(response.files);
                
                progress.report({ increment: 10, message: 'Complete!' });
            });

            vscode.window.showInformationMessage(
                `✅ ${mcpType.toUpperCase()} tests generated successfully!`,
                'View Tests'
            ).then(selection => {
                if (selection === 'View Tests') {
                    this.showGeneratedTests(mcpType);
                }
            });

        } catch (error) {
            this.outputChannel.appendLine(`❌ Error generating ${mcpType} tests: ${error}`);
            vscode.window.showErrorMessage(
                `Failed to generate ${mcpType} tests: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Analyze the current project
     */
    private async analyzeProject(): Promise<ProjectAnalysis> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const projectPath = workspaceFolders[0].uri.fsPath;
        
        // Simple project analysis
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
            
            // Detect routes and APIs from common patterns
            const routes = await this.detectRoutes(projectPath);
            const apis = await this.detectAPIs(projectPath);
            const components = await this.detectComponents(projectPath);
            
            return {
                language: this.detectLanguage(packageJson),
                framework: this.detectFramework(packageJson),
                routes,
                apis,
                components,
                structure: packageJson,
                dependencies: packageJson.dependencies || {}
            };
        } catch (error) {
            // Fallback to basic analysis
            return {
                language: 'javascript',
                framework: 'unknown',
                routes: [],
                apis: [],
                components: [],
                structure: {},
                dependencies: {}
            };
        }
    }

    /**
     * Generate tests using AI agent
     */
    private async generateWithAI(mcpType: string, projectAnalysis: ProjectAnalysis): Promise<MCPResponse> {
        const prompt = this.getMCPrompt(mcpType, projectAnalysis);
        
        try {
            // For now, use predefined templates as fallback
            // TODO: Integrate with actual AI service
            return this.generateFallbackTests(mcpType);
            
        } catch (error) {
            throw new Error(`AI generation failed: ${error}`);
        }
    }

    /**
     * Get MCP-specific prompt
     */
    private getMCPrompt(mcpType: string, projectAnalysis: ProjectAnalysis): string {
        const metadata = JSON.stringify(projectAnalysis, null, 2);
        
        switch (mcpType) {
            case 'playwright':
                return `${TESTFOX_AI_AGENT_PROMPT}

You are generating Playwright tests for this project.

Project metadata:
${metadata}

Your tasks:
1. Create /tests/playwright folder.
2. Generate playwright.config.ts.
3. Generate fixtures.ts.
4. Generate smoke tests, sanity tests, functional tests, accessibility tests.
5. Generate E2E tests for all detected user flows.
6. Infer selectors and routes from project.
7. Output full file contents with correct paths.`;

            case 'postman':
                return `${TESTFOX_AI_AGENT_PROMPT}

You are generating Postman API tests for this project.

Project metadata:
${metadata}

Your tasks:
1. Create /tests/postman folder.
2. Detect internal APIs from code.
3. Detect external APIs from config.
4. Generate Postman collection.json.
5. Include:
   - Auth tests
   - CRUD tests
   - Negative tests
   - Security tests
6. Output full JSON files with correct paths.`;

            case 'devtools':
                return `${TESTFOX_AI_AGENT_PROMPT}

You are generating DevTools-based tests for this project.

Project metadata:
${metadata}

Your tasks:
1. Create /tests/devtools folder.
2. Generate tests for:
   - Network (blocked requests, caching, slow responses)
   - Console (errors, warnings)
   - Performance (LCP, FID, CLS)
   - Coverage (unused JS/CSS)
3. Use Chrome DevTools Protocol.
4. Output full file contents with correct paths.`;

            default:
                throw new Error(`Unknown MCP type: ${mcpType}`);
        }
    }

    /**
     * Generate fallback tests (predefined templates)
     */
    private generateFallbackTests(mcpType: string): MCPResponse {
        const files: MCPFile[] = [];
        
        switch (mcpType) {
            case 'playwright':
                files.push(
                    { 
                        path: '/tests/playwright/playwright.config.ts', 
                        content: this.getPlaywrightConfig(), 
                        type: 'config' 
                    },
                    { 
                        path: '/tests/playwright/fixtures.ts', 
                        content: this.getPlaywrightFixtures(), 
                        type: 'fixture' 
                    },
                    { 
                        path: '/tests/playwright/smoke.spec.ts', 
                        content: this.getSmokeTests(), 
                        type: 'test' 
                    },
                    { 
                        path: '/tests/playwright/accessibility.spec.ts', 
                        content: this.getAccessibilityTests(), 
                        type: 'test' 
                    },
                    { 
                        path: '/tests/playwright/e2e/login.spec.ts', 
                        content: this.getE2ETests(), 
                        type: 'test' 
                    }
                );
                break;
                
            case 'postman':
                files.push(
                    { 
                        path: '/tests/postman/collection.json', 
                        content: this.getPostmanCollection(), 
                        type: 'collection' 
                    },
                    { 
                        path: '/tests/postman/environment.json', 
                        content: this.getPostmanEnvironment(), 
                        type: 'environment' 
                    },
                    { 
                        path: '/tests/postman/auth-tests.json', 
                        content: this.getAuthTests(), 
                        type: 'test' 
                    }
                );
                break;
                
            case 'devtools':
                files.push(
                    { 
                        path: '/tests/devtools/network-tests.json', 
                        content: this.getNetworkTests(), 
                        type: 'test' 
                    },
                    { 
                        path: '/tests/devtools/performance-tests.json', 
                        content: this.getPerformanceTests(), 
                        type: 'test' 
                    },
                    { 
                        path: '/tests/devtools/console-tests.json', 
                        content: this.getConsoleTests(), 
                        type: 'test' 
                    }
                );
                break;
        }

        return {
            success: true,
            files
        };
    }

    /**
     * Write generated files to disk
     */
    private async writeFiles(files: MCPFile[]): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;

        for (const file of files) {
            const fullPath = workspacePath + file.path;
            const dir = path.dirname(fullPath);

            // Create directory if it doesn't exist
            await fs.mkdir(dir, { recursive: true });
            
            // Write file
            await fs.writeFile(fullPath, file.content, 'utf8');
            
            this.outputChannel.appendLine(`✅ Created: ${file.path}`);
        }
    }

    /**
     * Show generated tests in explorer
     */
    private async showGeneratedTests(mcpType: string): Promise<void> {
        const testPath = `/tests/${mcpType}`;
        
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const uri = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, testPath));
                await vscode.commands.executeCommand('vscode.openFolder', uri);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open test folder: ${error}`);
        }
    }

    // Helper methods for project analysis
    private async detectRoutes(projectPath: string): Promise<string[]> {
        const routes: string[] = [];
        
        // Look for common route files
        const routePatterns = [
            '**/routes/**/*.{js,ts}',
            '**/pages/**/*.{js,ts}',
            '**/src/**/*route*.{js,ts}',
            '**/src/**/app.{js,ts}'
        ];

        // For now, return common routes
        return ['/login', '/dashboard', '/api/users', '/api/posts'];
    }

    private async detectAPIs(projectPath: string): Promise<string[]> {
        // For now, return common API endpoints
        return ['GET /api/users', 'POST /api/auth', 'GET /api/posts'];
    }

    private async detectComponents(projectPath: string): Promise<string[]> {
        // For now, return common components
        return ['Header', 'Footer', 'Navigation', 'LoginForm', 'Dashboard'];
    }

    private detectLanguage(packageJson: any): string {
        if (packageJson.dependencies?.react) return 'javascript/react';
        if (packageJson.dependencies?.vue) return 'javascript/vue';
        if (packageJson.dependencies?.angular) return 'javascript/angular';
        if (packageJson.dependencies?.express) return 'nodejs';
        if (packageJson.dependencies?.django) return 'python/django';
        if (packageJson.dependencies?.flask) return 'python/flask';
        return 'javascript';
    }

    private detectFramework(packageJson: any): string {
        if (packageJson.dependencies?.react) return 'react';
        if (packageJson.dependencies?.vue) return 'vue';
        if (packageJson.dependencies?.angular) return 'angular';
        if (packageJson.dependencies?.express) return 'express';
        if (packageJson.dependencies?.django) return 'django';
        if (packageJson.dependencies?.flask) return 'flask';
        return 'unknown';
    }

    // Template generators
    private getPlaywrightConfig(): string {
        return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});`;
    }

    private getPlaywrightFixtures(): string {
        return `import { test as base } from '@playwright/test';

export const test = base.extend({
  // Authentication fixture
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('**/dashboard');
    await use(page);
  },
});

export { expect } from '@playwright/test';`;
    }

    private getSmokeTests(): string {
        return `import { test, expect } from './fixtures';

test.describe('Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('navigation works', async ({ page }) => {
    await page.click('[data-testid="nav-home"]');
    await expect(page).toHaveURL('/');
  });
});`;
    }

    private getAccessibilityTests(): string {
        return `import { test, expect } from './fixtures';

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page has proper heading structure', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('images have alt text', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      await expect(images.nth(i)).toHaveAttribute('alt');
    }
  });
});`;
    }

    private getE2ETests(): string {
        return `import { test, expect } from './fixtures';

test.describe('E2E Tests', () => {
  test('user can login and view dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="username"]', 'testuser');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('user can logout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="logout-button"]');
    await expect(page).toHaveURL('/login');
  });
});`;
    }

    private getPostmanCollection(): string {
        return JSON.stringify({
            info: {
                name: "TestFox Generated API Tests",
                description: "Automatically generated API tests",
                schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            item: [
                {
                    name: "Authentication",
                    item: [
                        {
                            name: "Login",
                            request: {
                                method: "POST",
                                header: [
                                    {
                                        key: "Content-Type",
                                        value: "application/json"
                                    }
                                ],
                                body: {
                                    mode: "raw",
                                    raw: JSON.stringify({
                                        username: "{{$randomEmail}}",
                                        password: "{{$randomPassword}}"
                                    }, null, 2)
                                },
                                url: {
                                    raw: "{{baseUrl}}/api/auth/login",
                                    host: ["{{baseUrl}}"],
                                    path: ["api", "auth", "login"]
                                }
                            }
                        }
                    ]
                },
                {
                    name: "Users",
                    item: [
                        {
                            name: "Get Users",
                            request: {
                                method: "GET",
                                header: [],
                                url: {
                                    raw: "{{baseUrl}}/api/users",
                                    host: ["{{baseUrl}}"],
                                    path: ["api", "users"]
                                }
                            }
                        },
                        {
                            name: "Create User",
                            request: {
                                method: "POST",
                                header: [
                                    {
                                        key: "Content-Type",
                                        value: "application/json"
                                    }
                                ],
                                body: {
                                    mode: "raw",
                                    raw: JSON.stringify({
                                        name: "{{$randomName}}",
                                        email: "{{$randomEmail}}"
                                    }, null, 2)
                                },
                                url: {
                                    raw: "{{baseUrl}}/api/users",
                                    host: ["{{baseUrl}}"],
                                    path: ["api", "users"]
                                }
                            }
                        }
                    ]
                }
            ]
        }, null, 2);
    }

    private getPostmanEnvironment(): string {
        return JSON.stringify({
            name: "Test Environment",
            values: [
                {
                    key: "baseUrl",
                    value: "http://localhost:3000",
                    type: "default"
                },
                {
                    key: "randomEmail",
                    value: "test@example.com",
                    type: "random"
                },
                {
                    key: "randomPassword",
                    value: "Test123!",
                    type: "random"
                }
            ]
        }, null, 2);
    }

    private getAuthTests(): string {
        return JSON.stringify({
            info: {
                name: "Authentication Tests",
                description: "Test authentication endpoints"
            },
            item: [
                {
                    name: "Valid Login",
                    request: {
                        method: "POST",
                        url: "{{baseUrl}}/api/auth/login",
                        header: [
                            {
                                key: "Content-Type",
                                value: "application/json"
                            }
                        ],
                        body: {
                            mode: "raw",
                            raw: JSON.stringify({
                                username: "testuser",
                                password: "password"
                            }, null, 2)
                        }
                    },
                    event: [
                        {
                            listen: "test",
                            script: {
                                exec: [
                                    "pm.test('Login successful', function () {",
                                    "    pm.response.to.have.status(200);",
                                    "    const json = pm.response.json();",
                                    "    pm.expect(json).to.have.property('token');",
                                    "});"
                                ]
                            }
                        }
                    ]
                },
                {
                    name: "Invalid Login",
                    request: {
                        method: "POST",
                        url: "{{baseUrl}}/api/auth/login",
                        header: [
                            {
                                key: "Content-Type",
                                value: "application/json"
                            }
                        ],
                        body: {
                            mode: "raw",
                            raw: JSON.stringify({
                                username: "invalid",
                                password: "invalid"
                            }, null, 2)
                        }
                    },
                    event: [
                        {
                            listen: "test",
                            script: {
                                exec: [
                                    "pm.test('Login should fail', function () {",
                                    "    pm.response.to.have.status(401);",
                                    "});"
                                ]
                            }
                        }
                    ]
                }
            ]
        }, null, 2);
    }

    private getNetworkTests(): string {
        return JSON.stringify({
            name: "Network Tests",
            description: "Chrome DevTools network monitoring tests",
            tests: [
                {
                    name: "No blocked requests",
                    type: "network",
                    description: "Check for blocked network requests",
                    config: {
                        blockedUrls: [],
                        timeout: 5000
                    }
                },
                {
                    name: "Response time within limits",
                    type: "network",
                    description: "Ensure API responses are within acceptable time limits",
                    config: {
                        maxResponseTime: 2000,
                        urls: ["{{baseUrl}}/api/*"]
                    }
                }
            ]
        }, null, 2);
    }

    private getPerformanceTests(): string {
        return JSON.stringify({
            name: "Performance Tests",
            description: "Chrome DevTools performance monitoring tests",
            tests: [
                {
                    name: "LCP within threshold",
                    type: "performance",
                    threshold: {
                        metric: "LCP",
                        value: 2500
                    }
                },
                {
                    name: "FID within threshold",
                    type: "performance",
                    threshold: {
                        metric: "FID",
                        value: 100
                    }
                },
                {
                    name: "CLS within threshold",
                    type: "performance",
                    threshold: {
                        metric: "CLS",
                        value: 0.1
                    }
                }
            ]
        }, null, 2);
    }

    private getConsoleTests(): string {
        return JSON.stringify({
            name: "Console Tests",
            description: "Chrome DevTools console monitoring tests",
            tests: [
                {
                    name: "No JavaScript errors",
                    type: "console",
                    config: {
                        logLevel: "error",
                        maxErrors: 0
                    }
                },
                {
                    name: "No JavaScript warnings",
                    type: "console",
                    config: {
                        logLevel: "warning",
                        maxWarnings: 5
                    }
                }
            ]
        }, null, 2);
    }
}
