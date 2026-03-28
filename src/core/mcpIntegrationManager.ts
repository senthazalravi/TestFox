import * as vscode from 'vscode';
import * as path from 'path';
import { PlaywrightTestGenerator } from '../generators/playwrightTestGenerator';
import { ChromeDevToolsTestGenerator } from '../generators/chromeDevToolsTestGenerator';
import { MCPTestRunner } from '../runners/mcpTestRunner';
import { MCPServerManager } from '../mcp/mcpServerManager';
import { MCPTestTreeProvider } from '../views/mcpTestTreeProvider';
import { getOpenRouterService } from '../ai/openRouterService';

/**
 * MCP Integration Manager - Comprehensive end-to-end MCP testing
 */
export class MCPIntegrationManager {
    private context: vscode.ExtensionContext;
    private testRunner: MCPTestRunner;
    private testTreeProvider: MCPTestTreeProvider | null = null;
    private outputChannel: vscode.OutputChannel;
    private mcpServerManager: MCPServerManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('TestFox MCP Integration');
        this.testRunner = new MCPTestRunner();
        this.mcpServerManager = new MCPServerManager(context);
        
        // Initialize MCP Test Tree Provider
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.testTreeProvider = new MCPTestTreeProvider(workspaceFolders[0].uri.fsPath);
        }
    }

    /**
     * Initialize MCP Test Explorer view
     */
    registerTreeView(context: vscode.ExtensionContext): void {
        if (!this.testTreeProvider) return;

        const treeView = vscode.window.createTreeView('testfox-mcp-tests', {
            treeDataProvider: this.testTreeProvider,
            showCollapseAll: true
        });

        context.subscriptions.push(treeView);
    }

    /**
     * Generate Playwright tests with AI
     */
    async generatePlaywrightTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;
        const generator = new PlaywrightTestGenerator();

        try {
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Playwright tests...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Analyzing project structure...' });

                // Get project info
                const { ProjectDetector } = require('../core/projectDetector');
                const projectDetector = new ProjectDetector();
                const projectInfo = await projectDetector.detect(projectPath);

                progress.report({ message: 'Generating AI-powered tests...' });

                // Generate test suite
                const playwrightDir = await generator.generatePlaywrightSuite(projectPath, projectInfo);

                progress.report({ message: 'Installing dependencies...' });

                // Check if Playwright is installed, if not offer to install
                const hasPlaywright = await generator.checkPlaywrightInstallation(projectPath);
                if (!hasPlaywright) {
                    const install = await vscode.window.showInformationMessage(
                        'Playwright not detected. Install now?',
                        'Yes', 'No'
                    );
                    if (install === 'Yes') {
                        await generator.installPlaywright(projectPath);
                    }
                }

                // Refresh tree view
                this.testTreeProvider?.refresh();

                // Show success message
                const openFolder = await vscode.window.showInformationMessage(
                    `✅ Playwright tests generated at: ${playwrightDir}`,
                    'Open Folder', 'Run Tests'
                );

                if (openFolder === 'Open Folder') {
                    const uri = vscode.Uri.file(playwrightDir);
                    await vscode.commands.executeCommand('vscode.openFolder', uri);
                } else if (openFolder === 'Run Tests') {
                    await this.runPlaywrightTests();
                }
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate Playwright tests: ${error.message}`);
            this.outputChannel.appendLine(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Run Playwright tests
     */
    async runPlaywrightTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running Playwright tests...',
                cancellable: true
            }, async (progress, token) => {
                const result = await this.testRunner.runPlaywrightTests({
                    serverId: 'playwright-mcp',
                    projectPath,
                    targetUrl: 'http://localhost:3000'
                });

                // Update tree provider with results
                this.testTreeProvider?.updateResults(result);

                // Show results
                if (result.status === 'passed') {
                    vscode.window.showInformationMessage(
                        `✅ Playwright tests passed: ${result.summary.passed}/${result.summary.total}`,
                        'View Report'
                    ).then(selection => {
                        if (selection === 'View Report' && result.reportPath) {
                            vscode.env.openExternal(vscode.Uri.file(result.reportPath));
                        }
                    });
                } else {
                    vscode.window.showWarningMessage(
                        `⚠️ Playwright tests: ${result.summary.passed}/${result.summary.total} passed (${result.summary.failed} failed)`,
                        'View Report', 'View Failed Tests'
                    ).then(selection => {
                        if (selection === 'View Report' && result.reportPath) {
                            vscode.env.openExternal(vscode.Uri.file(result.reportPath));
                        }
                    });
                }
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run Playwright tests: ${error.message}`);
        }
    }

    /**
     * Generate Chrome DevTools tests with AI
     */
    async generateChromeDevToolsTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;
        const generator = new ChromeDevToolsTestGenerator();

        try {
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Chrome DevTools tests...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Analyzing project structure...' });

                // Get project info
                const { ProjectDetector } = require('../core/projectDetector');
                const projectDetector = new ProjectDetector();
                const projectInfo = await projectDetector.detect(projectPath);

                progress.report({ message: 'Generating AI-powered tests...' });

                // Generate test suite
                const devtoolsDir = await generator.generateChromeDevToolsSuite(projectPath, projectInfo);

                progress.report({ message: 'Installing dependencies...' });

                // Check if dependencies are installed, if not offer to install
                const hasDependencies = await generator.checkDependencies(projectPath);
                if (!hasDependencies) {
                    const install = await vscode.window.showInformationMessage(
                        'Chrome DevTools dependencies not detected. Install now?',
                        'Yes', 'No'
                    );
                    if (install === 'Yes') {
                        await generator.installDependencies(projectPath);
                    }
                }

                // Refresh tree view
                this.testTreeProvider?.refresh();

                // Show success message
                const openFolder = await vscode.window.showInformationMessage(
                    `✅ Chrome DevTools tests generated at: ${devtoolsDir}`,
                    'Open Folder', 'Run Tests'
                );

                if (openFolder === 'Open Folder') {
                    const uri = vscode.Uri.file(devtoolsDir);
                    await vscode.commands.executeCommand('vscode.openFolder', uri);
                } else if (openFolder === 'Run Tests') {
                    await this.runChromeDevToolsTests();
                }
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate Chrome DevTools tests: ${error.message}`);
            this.outputChannel.appendLine(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Run Chrome DevTools tests
     */
    async runChromeDevToolsTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running Chrome DevTools tests...',
                cancellable: true
            }, async (progress, token) => {
                const result = await this.testRunner.runChromeDevToolsTests({
                    serverId: 'chrome-devtools-mcp',
                    projectPath,
                    targetUrl: 'http://localhost:3000'
                });

                // Update tree provider with results
                this.testTreeProvider?.updateResults(result);

                // Show results
                if (result.status === 'passed') {
                    vscode.window.showInformationMessage(
                        `✅ Chrome DevTools tests passed: ${result.summary.passed}/${result.summary.total}`,
                        'View Report'
                    ).then(selection => {
                        if (selection === 'View Report' && result.reportPath) {
                            vscode.env.openExternal(vscode.Uri.file(result.reportPath));
                        }
                    });
                } else {
                    vscode.window.showWarningMessage(
                        `⚠️ Chrome DevTools tests: ${result.summary.passed}/${result.summary.total} passed (${result.summary.failed} failed)`,
                        'View Report', 'View Failed Tests'
                    ).then(selection => {
                        if (selection === 'View Report' && result.reportPath) {
                            vscode.env.openExternal(vscode.Uri.file(result.reportPath));
                        }
                    });
                }
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run Chrome DevTools tests: ${error.message}`);
        }
    }

    /**
     * Run QA Use MCP tests
     */
    async runQAUseTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running QA Use MCP tests...',
                cancellable: true
            }, async (progress) => {
                const result = await this.testRunner.runQAUseTests({
                    serverId: 'qa-use-mcp',
                    projectPath,
                    targetUrl: 'http://localhost:3000'
                });

                // Update tree provider
                this.testTreeProvider?.updateResults(result);

                vscode.window.showInformationMessage(
                    `🧪 QA Use MCP tests: ${result.summary.passed}/${result.summary.total} passed`
                );
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run QA Use MCP tests: ${error.message}`);
        }
    }

    /**
     * Run all MCP tests
     */
    async runAllMCPTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Running all MCP tests...',
                cancellable: true
            }, async (progress) => {
                progress.report({ message: 'Starting Playwright tests...' });
                
                const results = await this.testRunner.runAllMCPTests(projectPath, 'http://localhost:3000');
                
                // Update tree provider with all results
                results.forEach(result => this.testTreeProvider?.updateResults(result));

                // Calculate total stats
                const totalPassed = results.reduce((sum, r) => sum + r.summary.passed, 0);
                const totalFailed = results.reduce((sum, r) => sum + r.summary.failed, 0);
                const totalTests = results.reduce((sum, r) => sum + r.summary.total, 0);

                vscode.window.showInformationMessage(
                    `🚀 All MCP tests complete: ${totalPassed}/${totalTests} passed (${totalFailed} failed)`,
                    'View Results'
                );
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run MCP tests: ${error.message}`);
        }
    }

    /**
     * Generate tests for all MCP servers
     */
    async generateAllMCPTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating tests for all MCP servers...',
                cancellable: false
            }, async (progress) => {
                // Generate Playwright tests
                progress.report({ message: 'Generating Playwright tests...' });
                const generator = new PlaywrightTestGenerator();
                
                const { ProjectDetector } = require('../core/projectDetector');
                const projectDetector = new ProjectDetector();
                const projectInfo = await projectDetector.detect(projectPath);
                
                await generator.generatePlaywrightSuite(projectPath, projectInfo);

                // Generate API tests (Postman-style)
                progress.report({ message: 'Generating API tests...' });
                await this.generateAPITests(projectPath, projectInfo);

                // Generate DevTools tests
                progress.report({ message: 'Generating DevTools tests...' });
                await this.generateDevToolsTests(projectPath, projectInfo);

                // Refresh tree view
                this.testTreeProvider?.refresh();

                vscode.window.showInformationMessage(
                    '✅ All MCP tests generated successfully!',
                    'Run All Tests'
                ).then(selection => {
                    if (selection === 'Run All Tests') {
                        this.runAllMCPTests();
                    }
                });
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate MCP tests: ${error.message}`);
        }
    }

    /**
     * Generate API tests
     */
    private async generateAPITests(projectPath: string, projectInfo: any): Promise<void> {
        const apiDir = path.join(projectPath, 'tests', 'api');
        if (!require('fs').existsSync(apiDir)) {
            require('fs').mkdirSync(apiDir, { recursive: true });
        }

        const openRouter = getOpenRouterService();
        let testContent: string;

        if (openRouter.isConfigured()) {
            try {
                testContent = await openRouter.generateTestCode(
                    `Create comprehensive API tests for endpoints: ${projectInfo.endpoints?.map((e: any) => e.path).join(', ') || '/api'}`,
                    'jest'
                );
            } catch (error) {
                testContent = this.getDefaultAPITests();
            }
        } else {
            testContent = this.getDefaultAPITests();
        }

        require('fs').writeFileSync(path.join(apiDir, 'api.spec.ts'), testContent);
    }

    /**
     * Generate DevTools tests - using the comprehensive generator
     */
    private async generateDevToolsTests(projectPath: string, projectInfo: any): Promise<void> {
        const generator = new ChromeDevToolsTestGenerator();
        await generator.generateChromeDevToolsSuite(projectPath, projectInfo);
    }

    /**
     * Get default API tests when AI is not available
     */
    private getDefaultAPITests(): string {
        return `/**
 * API Tests - Generated by TestFox
 */

import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('API Tests', () => {
    describe('Health Check', () => {
        test('should return 200 for health endpoint', async () => {
            const response = await request(API_URL)
                .get('/health')
                .expect(200);
            
            expect(response.body).toHaveProperty('status', 'ok');
        });
    });

    describe('Authentication', () => {
        test('should reject unauthenticated requests', async () => {
            await request(API_URL)
                .get('/protected')
                .expect(401);
        });

        test('should authenticate with valid credentials', async () => {
            const response = await request(API_URL)
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                })
                .expect(200);
            
            expect(response.body).toHaveProperty('token');
        });
    });

    describe('CRUD Operations', () => {
        test('should create a resource', async () => {
            const response = await request(API_URL)
                .post('/resources')
                .send({ name: 'Test Resource' })
                .expect(201);
            
            expect(response.body).toHaveProperty('id');
        });

        test('should get a resource', async () => {
            await request(API_URL)
                .get('/resources/1')
                .expect(200);
        });

        test('should update a resource', async () => {
            await request(API_URL)
                .put('/resources/1')
                .send({ name: 'Updated Resource' })
                .expect(200);
        });

        test('should delete a resource', async () => {
            await request(API_URL)
                .delete('/resources/1')
                .expect(204);
        });
    });
});
`;
    }

    /**
     * Get the MCP test tree provider
     */
    getTestTreeProvider(): MCPTestTreeProvider | null {
        return this.testTreeProvider;
    }

    /**
     * Get the MCP test runner
     */
    getTestRunner(): MCPTestRunner {
        return this.testRunner;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
        this.testTreeProvider = null;
    }
}
