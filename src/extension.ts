import * as vscode from 'vscode';
import { ProjectDetector } from './core/projectDetector';
import { CodeAnalyzer } from './core/codeAnalyzer';
import { AppRunner } from './core/appRunner';
import { DependencyManager } from './core/dependencyManager';
import { TestExplorerProvider } from './views/testExplorer';
import { TestResultsProvider } from './views/testResultsProvider';
import { TestControlCenterProvider } from './views/testControlCenter';
import { TestExecutionManager } from './core/testExecutionManager';
import { GitIntegration } from './core/gitIntegration';
import { GitAuth } from './core/gitAuth';
import { IssueCreator } from './core/issueCreator';
import { TestCoverageTracker } from './core/testCoverageTracker';
import { OnboardingPanel } from './views/onboardingPanel';
import * as path from 'path';
import { DashboardPanel } from './views/dashboard/dashboardPanel';
import { ReportPanel } from './views/reportPanel';
import { SettingsPanel } from './views/settingsPanel';
import { TestRunner } from './runners/testRunner';
import { FullCycleRunner } from './runners/fullCycleRunner';
import { CrossBrowserRunner } from './runners/crossBrowserRunner';
import { ReportGenerator } from './reports/reportGenerator';
import { ManualTestTracker } from './manual/manualTestTracker';
import { TestGeneratorManager } from './generators/testGenerator';
import { TestGeneratorAI } from './ai/testGeneratorAI';
import { getOpenRouterClient } from './ai/openRouterClient';
import { DatabaseTestGenerator } from './generators/databaseTestGenerator';
import { AIE2ETestGenerator } from './generators/aiE2ETestGenerator';
import { BrowserLogTestGenerator } from './generators/browserLogTestGenerator';
import { UITestGenerator } from './generators/uiTestGenerator';
import { DefectTracker } from './tracking/defectTracker';
import { DefectDashboard } from './views/defectDashboard';
import { WebServer } from './server/webServer';
import { TestStore } from './store/testStore';
import { TestScheduler } from './core/scheduler';
import { MCPServerManager } from './mcp/mcpServerManager';

let projectDetector: ProjectDetector;
let codeAnalyzer: CodeAnalyzer;
let appRunner: AppRunner;
let testRunner: TestRunner;
let testStore: TestStore;
let testExplorerProvider: TestExplorerProvider;
let testResultsProvider: TestResultsProvider;
let testControlCenter: TestControlCenterProvider;
let testExecutionManager: TestExecutionManager;
let gitIntegration: GitIntegration | null = null;
let issueCreator: IssueCreator | null = null;
let testCoverageTracker: TestCoverageTracker | null = null;
let manualTestTracker: ManualTestTracker;
let reportGenerator: ReportGenerator;
let dependencyManager: DependencyManager;
let testGeneratorAI: TestGeneratorAI;
let fullCycleRunner: FullCycleRunner;
let crossBrowserRunner: CrossBrowserRunner;
let defectTracker: DefectTracker;
let webServer: WebServer;
let scheduler: TestScheduler;
let mcpServerManager: MCPServerManager;

// Status bar items
let statusBarMain: vscode.StatusBarItem;
let statusBarAI: vscode.StatusBarItem;
let statusBarStatus: vscode.StatusBarItem;
let statusBarScheduler: vscode.StatusBarItem;

// Track if extension is already activated to prevent duplicate registrations
let isActivated = false;

// Output channel for diagnostic logging
let outputChannel: vscode.OutputChannel;

/**
 * Log diagnostic message to output channel
 */
function logDiagnostic(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('TestFox Diagnostics');
    }
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️';
    outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
    if (type === 'error') {
        console.error(`TestFox: ${message}`);
    } else if (type === 'warn') {
        console.warn(`TestFox: ${message}`);
    } else {
        console.log(`TestFox: ${message}`);
    }
}

/**
 * Check if application is available on common ports
 */
async function checkApplicationAvailability(): Promise<string | null> {
    const portsToCheck = [3000, 8080, 4200, 5000, 8000, 4000, 5173];
    const axios = require('axios').default;

    for (const port of portsToCheck) {
        try {
            const url = `http://localhost:${port}`;
            console.log(`TestFox: Checking if application is running on port ${port}...`);

            // Try to connect with a short timeout
            const response = await axios.get(url, {
                timeout: 2000,
                validateStatus: () => true // Accept any status code
            });

            // If we get any response (even 404), the server is running
            if (response.status < 500) {
                console.log(`TestFox: Application found on port ${port}`);
                return url;
            }
        } catch (error: any) {
            // Handle aborted requests gracefully
            if (error.code === 'ECONNABORTED' || error.message?.includes('aborted') || error.message?.includes('cancelled')) {
                console.log(`TestFox: Request to port ${port} was cancelled, continuing...`);
                continue;
            }
            // Connection failed, try next port
            continue;
        }
    }

    console.log('TestFox: No application found on common ports');
    return null;
}

export async function activate(context: vscode.ExtensionContext) {
    // Prevent multiple activations
    if (isActivated) {
        console.log('TestFox: Extension already activated, skipping duplicate activation');
        return;
    }

    console.log('TestFox v0.6.42 is now active!');
    console.log('Initializing TestFox extension...');
    isActivated = true;

    // Clear any stale cache on fresh activation
    try {
        console.log('TestFox: Clearing stale cache...');
        // Reset any corrupted state
        const config = vscode.workspace.getConfiguration('testfox');
        // Log current configuration for debugging
        console.log('TestFox: Current config -', {
            aiEnabled: config.get('ai.enabled'),
            aiProvider: config.get('ai.provider'),
            aiModel: config.get('ai.model'),
            hasApiKey: !!config.get('ai.apiKey')
        });
    } catch (error) {
        console.log('TestFox: Cache clear skipped (no cache to clear)');
    }

    try {
        // Initialize status bar first (visible immediately)
        initStatusBar(context);
        console.log('Status bar initialized');
    } catch (error) {
        console.error('Failed to initialize status bar:', error);
    }

    try {
        // Initialize core components
        console.log('TestFox: Initializing core components...');

        console.log('TestFox: Creating TestStore...');
        try {
            testStore = new TestStore(context);
            console.log('TestFox: TestStore created');
        } catch (error) {
            console.error('TestFox: Failed to create TestStore:', error);
            throw error;
        }

        console.log('TestFox: Creating ProjectDetector...');
        projectDetector = new ProjectDetector();
        console.log('TestFox: ProjectDetector created');

        console.log('TestFox: Creating CodeAnalyzer...');
        codeAnalyzer = new CodeAnalyzer();
        console.log('TestFox: CodeAnalyzer created');

        console.log('TestFox: Creating AppRunner...');
        appRunner = new AppRunner();
        console.log('TestFox: AppRunner created');

        console.log('TestFox: Creating TestRunner...');
        testRunner = new TestRunner(appRunner, testStore);
        console.log('TestFox: TestRunner created');

        console.log('TestFox: Creating ManualTestTracker...');
        manualTestTracker = new ManualTestTracker(context);
        console.log('TestFox: ManualTestTracker created');

        console.log('TestFox: Creating ReportGenerator...');
        reportGenerator = new ReportGenerator(context);
        console.log('TestFox: ReportGenerator created');

        console.log('TestFox: Creating DependencyManager...');
        dependencyManager = new DependencyManager(context);
        console.log('TestFox: DependencyManager created');

        console.log('TestFox: Creating TestGeneratorAI...');
        testGeneratorAI = new TestGeneratorAI(testStore);
        console.log('TestFox: TestGeneratorAI created');

        console.log('TestFox: Creating FullCycleRunner...');
        fullCycleRunner = new FullCycleRunner(appRunner);
        console.log('TestFox: FullCycleRunner created');

        console.log('TestFox: Creating CrossBrowserRunner...');
        crossBrowserRunner = new CrossBrowserRunner(dependencyManager);
        console.log('TestFox: CrossBrowserRunner created');

        console.log('TestFox: Creating DefectTracker...');
        defectTracker = new DefectTracker(context);
        console.log('TestFox: DefectTracker created');

        console.log('TestFox: Creating WebServer...');
        try {
            webServer = new WebServer(context);
            console.log('TestFox: WebServer created');
        } catch (error) {
            console.error('TestFox: Failed to create WebServer:', error);
            throw error;
        }

        console.log('TestFox: Creating TestScheduler...');
        scheduler = new TestScheduler(context);
        console.log('TestFox: TestScheduler created');

        // Initialize MCP Server Manager
        console.log('TestFox: Creating MCPServerManager...');
        mcpServerManager = new MCPServerManager(context);
        console.log('TestFox: MCPServerManager created');

        // Initialize Git integration if workspace is available
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            gitIntegration = new GitIntegration(workspacePath);
            console.log('TestFox: GitIntegration created');
            
            // Initialize Issue Creator
            issueCreator = new IssueCreator(gitIntegration);
            console.log('TestFox: IssueCreator created');

            // Initialize Test Coverage Tracker
            testCoverageTracker = new TestCoverageTracker(context, workspacePath);
            console.log('TestFox: TestCoverageTracker created');

            // Register existing tests with coverage tracker
            const existingTests = testStore.getAllTests();
            for (const test of existingTests) {
                testCoverageTracker.registerTest(test);
            }
            console.log(`TestFox: Registered ${existingTests.length} existing tests with coverage tracker`);
        }

        console.log('TestFox: Core components initialized successfully');
    } catch (error) {
        console.error('Failed to initialize core components:', error);
        vscode.window.showErrorMessage('TestFox: Failed to initialize core components. Extension may not work properly.');
    }

    try {
        // Initialize AI client with status bar
        logDiagnostic('Initializing AI client...');
        const openRouter = getOpenRouterClient();
        openRouter.initStatusBar(statusBarAI);

        // Load AI configuration (including API key from settings)
        loadAIConfiguration(context);
        
        // Check if AI is configured
        const config = vscode.workspace.getConfiguration('testfox');
        const apiKey = config.get<string>('ai.apiKey');
        const model = config.get<string>('ai.model');
        
        if (apiKey) {
            logDiagnostic(`AI API key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
            logDiagnostic(`AI model configured: ${model || 'default (Gemini 2.0 Flash)'}`);
            
            // Test connection in background
            openRouter.testConnection().then(result => {
                if (result.success) {
                    logDiagnostic('✅ AI connection test successful');
                } else {
                    logDiagnostic(`❌ AI connection test failed: ${result.error}`, 'error');
                    vscode.window.showWarningMessage(
                        `TestFox: AI connection failed - ${result.error}`,
                        'Open Diagnostics'
                    ).then(selection => {
                        if (selection === 'Open Diagnostics') {
                            outputChannel.show(true);
                        }
                    });
                }
            }).catch(err => {
                logDiagnostic(`❌ AI connection test error: ${err.message}`, 'error');
            });
        } else {
            logDiagnostic('⚠️ AI API key not configured - AI features will be disabled', 'warn');
        }
    } catch (error) {
        logDiagnostic(`Failed to initialize AI: ${error}`, 'error');
    }

    try {
        // Set up web server callbacks
        console.log('Setting up web server...');
        if (!webServer) {
            console.log('WebServer not initialized, skipping callback setup');
        } else {
        webServer.setCommandCallback(async (command: string, data?: any) => {
        try {
            switch (command) {
                case 'analyze':
                    await analyzeProject();
                    return { message: 'Project analysis completed' };
                case 'generateTests':
                    await generateTests();
                    return { message: 'Test generation completed' };
                case 'runAll':
                    await runAllTests();
                    return { message: 'All tests executed' };
                case 'runFullCycle':
                    await runFullCycleTests();
                    return { message: 'Full cycle testing completed' };
                case 'stopApp':
                    await appRunner.stop();
                    updateStatus('stopped');
                    return { message: 'Application stopped' };
                case 'exportReport':
                    await exportReport();
                    return { message: 'Report exported' };
                case 'clearData':
                    await defectTracker.clearAllData();
                    return { message: 'All data cleared' };
                case 'run':
                    await runAllTests();
                    return { message: 'Tests started' };
                case 'generateReport':
                    await generateWebReport(context);
                    return { message: 'Report generated' };
                case 'openDefects':
                    DefectDashboard.createOrShow(context.extensionUri, defectTracker);
                    return { message: 'Defect dashboard opened' };
                case 'configureAI':
                    await vscode.commands.executeCommand('testfox.configureAI');
                    return { message: 'AI configuration opened' };
                case 'openSettings':
                    await vscode.commands.executeCommand('testfox.openSettings');
                    return { message: 'Settings opened' };
                case 'authenticateGitHub':
                    try {
                        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
                        return { message: 'GitHub authenticated successfully' };
                    } catch (error) {
                        throw new Error('GitHub authentication failed');
                    }
                case 'logoutGitHub':
                    try {
                        await GitAuth.signOut();
                        return { message: 'GitHub disconnected' };
                    } catch (error) {
                        throw new Error('GitHub logout failed');
                    }
                case 'getGitProfile':
                    try {
                        const session = await GitAuth.getSession(false);
                        const username = await GitAuth.getUsername();
                        return {
                            authenticated: !!session,
                            username: username,
                            repo: null // Will be filled by data callback
                        };
                    } catch (error) {
                        return { authenticated: false };
                    }
                case 'getTestHistory':
                    return defectTracker.getAllRuns().slice(-10).reverse();
                case 'viewRunDetails':
                    // Could implement detailed run view here
                    return { message: 'Run details not implemented yet' };
                default:
                    throw new Error(`Unknown command: ${command}`);
            }
        } catch (error: any) {
            throw new Error(`Command execution failed: ${error.message}`);
        }
    });

    webServer.setDataRequestCallback(async (type: string) => {
        switch (type) {
            case 'defects':
                return defectTracker.getAllDefects();
            case 'runs':
                return defectTracker.getAllRuns();
            case 'stats':
                const stats = defectTracker.getDefectStats();
                const runs = defectTracker.getAllRuns();
                const latestRun = runs[runs.length - 1];
                return {
                    totalRuns: runs.length,
                    totalDefects: stats.total,
                    openDefects: stats.open,
                    fixedDefects: stats.fixed,
                    latestPassRate: latestRun?.passRate || 0,
                    avgPassRate: runs.length > 0
                        ? Math.round(runs.reduce((sum, r) => sum + r.passRate, 0) / runs.length)
                        : 0
                };
            case 'trends':
                return {
                    ...defectTracker.getImprovementMetrics(),
                    stats: defectTracker.getDefectStats()
                };
            case 'gitProfile':
                try {
                    const session = await GitAuth.getSession(false);
                    const username = await GitAuth.getUsername();

                    // Get repo info
                    let repoInfo = null;
                    try {
                        const gitExtension = vscode.extensions.getExtension('vscode.git');
                        if (gitExtension && gitExtension.isActive) {
                            const git = gitExtension.exports.getAPI(1);
                            const repositories = git.repositories;

                            if (repositories.length > 0) {
                                const repo = repositories[0];
                                const remote = repo.state.remotes.find((r: any) => r.name === 'origin');
                                if (remote && remote.fetchUrl) {
                                    const match = remote.fetchUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
                                    if (match) {
                                        repoInfo = {
                                            owner: match[1],
                                            name: match[2]
                                        };
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.log('Could not get repo info:', error);
                    }

                    return {
                        authenticated: !!session,
                        username: username,
                        repo: repoInfo ? `${repoInfo.owner}/${repoInfo.name}` : null
                    };
                } catch (error) {
                    return { authenticated: false };
                }
            case 'testHistory':
                return defectTracker.getAllRuns().slice(-10).reverse(); // Last 10 runs, most recent first
            default:
                throw new Error(`Unknown data type: ${type}`);
        }
    });
    } // End of else block for webServer check

    try {
        // Initialize view providers
        console.log('Initializing view providers...');
        testExplorerProvider = new TestExplorerProvider(testStore);
        testResultsProvider = new TestResultsProvider(testStore);
        testControlCenter = new TestControlCenterProvider(context.extensionUri, testStore);
        testExecutionManager = new TestExecutionManager(testControlCenter);

        // Register tree views
        console.log('Registering tree views...');
        const testExplorerView = vscode.window.createTreeView('testfox-explorer', {
            treeDataProvider: testExplorerProvider,
            showCollapseAll: true
        });

        const testResultsView = vscode.window.createTreeView('testfox-results', {
            treeDataProvider: testResultsProvider,
            showCollapseAll: true
        });

        // Register Test Control Center webview
        const controlCenterRegistration = vscode.window.registerWebviewViewProvider(
            TestControlCenterProvider.viewType,
            testControlCenter
        );

        context.subscriptions.push(testExplorerView, testResultsView, controlCenterRegistration);
        console.log('Views registered successfully');
        
        // Focus the TestFox view container after a short delay
        setTimeout(async () => {
            try {
                console.log('TestFox: Focusing test control center view...');
                await vscode.commands.executeCommand('testfox-control-center.focus');
                console.log('TestFox: Test control center view focused successfully');
            } catch (error) {
                console.log('TestFox: Could not focus control center (this is normal on first load):', error);
            }
        }, 1000);
    } catch (error) {
        console.error('Failed to register views:', error);
        vscode.window.showErrorMessage('TestFox: Failed to register views. Extension may not work properly.');
    }

    try {
        // Register commands
        console.log('TestFox: Starting command registration...');

        // Test that all required functions are available before registering
        console.log('TestFox: Checking function availability...');
        if (typeof analyzeProject !== 'function') {
            throw new Error('analyzeProject function not available');
        }
        if (typeof generateTests !== 'function') {
            throw new Error('generateTests function not available');
        }
        if (typeof runAllTests !== 'function') {
            throw new Error('runAllTests function not available');
        }
        if (typeof runTestCategory !== 'function') {
            throw new Error('runTestCategory function not available');
        }
        if (typeof generateTestCategory !== 'function') {
            throw new Error('generateTestCategory function not available');
        }
        console.log('TestFox: All functions available, proceeding with registration...');

        const commands = [
        vscode.commands.registerCommand('testfox.analyze', async () => {
            await analyzeProject();
        }),

        vscode.commands.registerCommand('testfox.generateTests', async () => {
            await generateTests();
        }),

        vscode.commands.registerCommand('testfox.runAll', async () => {
            await runAllTests();
        }),

        vscode.commands.registerCommand('testfox.runCategory', async (category?: string) => {
            await runTestCategory(category);
        }),

        vscode.commands.registerCommand('testfox.generateCategory', async (category?: string) => {
            await generateTestCategory(category);
        }),

        vscode.commands.registerCommand('testfox.runScheduledTests', async () => {
            await scheduler.runNow();
        }),

        vscode.commands.registerCommand('testfox.checkAppStatus', async () => {
            const appUrl = await checkApplicationAvailability();
            if (appUrl) {
                vscode.window.showInformationMessage(`TestFox: Application is running at ${appUrl}`);
            } else {
                const startApp = await vscode.window.showWarningMessage(
                    'TestFox: No application detected on common ports. Would you like to start it?',
                    'Start Application',
                    'Cancel'
                );

                if (startApp === 'Start Application') {
                    const projectInfo = testStore.getProjectInfo();
                    if (projectInfo) {
                        await appRunner.start(projectInfo);
                        vscode.window.showInformationMessage('TestFox: Application startup initiated. Check status again in a few seconds.');
                    } else {
                        vscode.window.showErrorMessage('TestFox: No project information available. Please analyze the project first.');
                    }
                }
            }
        }),

        vscode.commands.registerCommand('testfox.openDashboard', () => {
            DashboardPanel.createOrShow(context.extensionUri, testStore, manualTestTracker);
        }),

        vscode.commands.registerCommand('testfox.exportReport', async () => {
            await exportReport();
        }),

        vscode.commands.registerCommand('testfox.markManual', async (testId?: string) => {
            await markManualTest(testId);
        }),

        vscode.commands.registerCommand('testfox.stopApp', async () => {
            await appRunner.stop();
            updateStatus('stopped');
            vscode.window.showInformationMessage('TestFox: Application stopped');
        }),

        vscode.commands.registerCommand('testfox.refreshTests', () => {
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
        }),

        vscode.commands.registerCommand('testfox.configureAI', async () => {
            // Check if already configured
            const config = vscode.workspace.getConfiguration('testfox');
            const apiKey = config.get<string>('ai.apiKey');
            const setupCompleted = context.globalState.get<boolean>('testfox.setupCompleted', false);

            if (apiKey && setupCompleted) {
                // If configured, open settings
                SettingsPanel.createOrShow(context.extensionUri);
            } else {
                // If not, show onboarding
                OnboardingPanel.createOrShow(context.extensionUri, context);
            }
        }),

        vscode.commands.registerCommand('testfox.openTestControlCenter', async () => {
            await vscode.commands.executeCommand('testfox-control-center.focus');
        }),

        vscode.commands.registerCommand('testfox.showOnboarding', async () => {
            // Force show onboarding (useful for model switching/reconfiguration)
            OnboardingPanel.createOrShow(context.extensionUri, context, true);
        }),

        vscode.commands.registerCommand('testfox.showTestDetails', (testId: string) => {
            const test = testStore.getTest(testId);
            if (test) {
                vscode.window.showInformationMessage(
                    `${test.name}\n\n${test.description}`,
                    'View in Dashboard'
                ).then(selection => {
                    if (selection === 'View in Dashboard') {
                        DashboardPanel.createOrShow(context.extensionUri, testStore, manualTestTracker);
                    }
                });
            }
        }),

        vscode.commands.registerCommand('testfox.generateWebReport', async () => {
            await generateWebReport(context);
        }),

        vscode.commands.registerCommand('testfox.runFullCycle', async () => {
            await runFullCycleTesting();
        }),

        vscode.commands.registerCommand('testfox.openSettings', () => {
            SettingsPanel.createOrShow(context.extensionUri);
        }),

        vscode.commands.registerCommand('testfox.runCrossBrowser', async () => {
            await runCrossBrowserTests(context);
        }),

        vscode.commands.registerCommand('testfox.installBrowsers', async () => {
            await dependencyManager.installAllBrowsers();
        }),

        vscode.commands.registerCommand('testfox.openDefectDashboard', () => {
            DefectDashboard.createOrShow(context.extensionUri, defectTracker);
        }),


        vscode.commands.registerCommand('testfox.startWebServer', async () => {
            const success = await webServer.start();
            if (success) {
                vscode.window.showInformationMessage(`TestFox Web Server started on http://localhost:${webServer.getPort()}`);
                updateStatus('ready', `Server: ${webServer.getPort()}`);
            } else {
                vscode.window.showErrorMessage('Failed to start TestFox Web Server');
            }
        }),

        vscode.commands.registerCommand('testfox.stopWebServer', async () => {
            await webServer.stop();
            vscode.window.showInformationMessage('TestFox Web Server stopped');
            updateStatus('ready');
        }),

        vscode.commands.registerCommand('testfox.openBrowserDashboard', async () => {
            if (!webServer.isServerRunning()) {
                const startServer = await vscode.window.showInformationMessage(
                    'Web server is not running. Start it?',
                    'Start Server',
                    'Cancel'
                );

                if (startServer === 'Start Server') {
                    await vscode.commands.executeCommand('testfox.startWebServer');
                    // Wait a moment for server to start
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    return;
                }
            }

            if (webServer.isServerRunning()) {
                const url = `http://localhost:${webServer.getPort()}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } else {
                vscode.window.showErrorMessage('TestFox Web Server is not running');
            }
        }),

        vscode.commands.registerCommand('testfox.pauseTests', () => {
            testExecutionManager.pause();
        }),

        vscode.commands.registerCommand('testfox.resumeTests', () => {
            testExecutionManager.resume();
        }),

        vscode.commands.registerCommand('testfox.stopTests', () => {
            testExecutionManager.stop();
        }),

        vscode.commands.registerCommand('testfox.createGitHubIssue', async () => {
            await createIssue('github');
        }),

        vscode.commands.registerCommand('testfox.createJiraIssue', async () => {
            await createIssue('jira');
        }),

        // MCP Server Commands
        vscode.commands.registerCommand('testfox.mcpRunServer', async (serverId: string) => {
            try {
                vscode.window.showInformationMessage(`TestFox MCP: Running ${serverId} tests...`);
                const result = await mcpServerManager.runTests(serverId);
                vscode.window.showInformationMessage(
                    `TestFox MCP: ${result.serverName} - ${result.summary.passed}/${result.summary.total} tests passed`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`TestFox MCP: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.mcpRunAll', async () => {
            try {
                vscode.window.showInformationMessage('TestFox MCP: Running all MCP server tests...');
                const servers = mcpServerManager.getServers();
                let totalPassed = 0;
                let totalTests = 0;
                
                for (const server of servers) {
                    try {
                        const result = await mcpServerManager.runTests(server.id);
                        totalPassed += result.summary.passed;
                        totalTests += result.summary.total;
                    } catch (error) {
                        console.error(`MCP test failed for ${server.id}:`, error);
                    }
                }
                
                vscode.window.showInformationMessage(
                    `TestFox MCP: All servers tested - ${totalPassed}/${totalTests} tests passed`
                );
            } catch (error: any) {
                vscode.window.showErrorMessage(`TestFox MCP: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.mcpGenerateReport', async () => {
            try {
                const html = mcpServerManager.generateReport();
                
                // Save report to file
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const reportUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'testfox-mcp-report.html');
                    const reportPath = reportUri.fsPath;
                    const fs = require('fs');
                    fs.writeFileSync(reportPath, html);
                    
                    // Open in browser
                    const uri = vscode.Uri.file(reportPath);
                    await vscode.env.openExternal(uri);
                    
                    vscode.window.showInformationMessage('TestFox MCP: Report generated and opened in browser');
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`TestFox MCP: Failed to generate report - ${error.message}`);
            }
        })
    ];

        // Register commands with error handling for duplicates
        const registeredCommands: vscode.Disposable[] = [];
        for (const cmd of commands) {
            try {
                registeredCommands.push(cmd);
            } catch (error: any) {
                // If command already exists, log but don't fail
                if (error?.message?.includes('already exists')) {
                    console.warn(`TestFox: Command already registered, skipping: ${error.message}`);
                } else {
                    throw error; // Re-throw other errors
                }
            }
        }
        
        context.subscriptions.push(...registeredCommands);
        console.log(`TestFox: Commands registered successfully (${registeredCommands.length}/${commands.length})`);
    } catch (error) {
        console.error('TestFox: Failed to register commands:', error);
        console.error('TestFox: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        vscode.window.showErrorMessage(`TestFox: Failed to register commands - ${error instanceof Error ? error.message : String(error)}`);
    }

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                try {
                if (e.affectsConfiguration('testfox.ai')) {
                        try {
                    loadAIConfiguration(context);
                            const openRouter = getOpenRouterClient();
                            if (openRouter) {
                    openRouter.loadConfiguration();
                    openRouter.updateStatusBar();
                            }
                        } catch (error) {
                            console.error('TestFox: Error updating AI configuration:', error);
                        }
                }

                    if (e.affectsConfiguration('testfox.automation') || 
                        e.affectsConfiguration('testfox.scheduleEnabled') ||
                        e.affectsConfiguration('testfox.autoRunOnCommit')) {
                        try {
                    console.log('Automation settings changed, updating scheduler...');
                            if (scheduler) {
                    scheduler.updateSettings();
                                updateSchedulerStatus().catch(err => {
                                    console.error('TestFox: Error updating scheduler status:', err);
                                });
                            }
                        } catch (error) {
                            console.error('TestFox: Error updating scheduler configuration:', error);
                        }
                    }
                } catch (error) {
                    // Catch any unexpected errors in configuration handler
                    console.error('TestFox: Unexpected error in configuration change handler:', error);
                }
            })
        );
        console.log('Configuration listener set up');
    } catch (error) {
        console.error('Failed to set up configuration listener:', error);
    }

    try {
        // Auto-initialize on activation
        console.log('Starting auto-initialization...');
        await autoInitialize(context);
        console.log('Auto-initialization completed');
    } catch (error) {
        console.error('Auto-initialization failed:', error);
        vscode.window.showWarningMessage('TestFox: Auto-initialization failed. You can still use manual commands.');
    }

    try {
        // Start the test scheduler
        console.log('Starting test scheduler...');
        scheduler.start();
        updateSchedulerStatus();
        console.log('Test scheduler started');
    } catch (error) {
        console.error('Failed to start scheduler:', error);
    }

}

/**
 * Update application status in status bar
 */
async function updateSchedulerStatus(): Promise<void> {
    if (!statusBarScheduler) return;

    try {
        const appUrl = await checkApplicationAvailability();
        if (!statusBarScheduler) return; // Check again after async operation
        
        if (appUrl) {
            const port = appUrl.split(':')[2];
            statusBarScheduler.text = `$(zap) App: ${port}`;
            statusBarScheduler.tooltip = `Application running on port ${port}\nClick to check status`;
            statusBarScheduler.backgroundColor = undefined;
        } else {
            statusBarScheduler.text = '$(warning) App: Off';
            statusBarScheduler.tooltip = 'No application detected\nClick to start or check status';
            statusBarScheduler.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    } catch (error) {
        console.error('TestFox: Error updating scheduler status:', error);
        if (statusBarScheduler) {
        statusBarScheduler.text = '$(error) App: Error';
        statusBarScheduler.tooltip = 'Error checking application status\nClick to retry';
        statusBarScheduler.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }
}

/**
 * Initialize status bar items
 */
function initStatusBar(context: vscode.ExtensionContext): void {
    // Main TestFox status
    statusBarMain = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarMain.text = '$(beaker) TestFox';
    statusBarMain.tooltip = 'TestFox - Click to open dashboard';
    statusBarMain.command = 'testfox.openDashboard';
    statusBarMain.show();
    context.subscriptions.push(statusBarMain);

    // AI Model status
    statusBarAI = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    statusBarAI.command = 'testfox.configureAI';
    statusBarAI.show();
    context.subscriptions.push(statusBarAI);

    // Current status
    statusBarStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    statusBarStatus.text = '$(sync~spin) Initializing...';
    statusBarStatus.show();
    context.subscriptions.push(statusBarStatus);

    // Scheduler status
    statusBarScheduler = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    statusBarScheduler.command = 'testfox.checkAppStatus';
    updateSchedulerStatus(); // Will run async in background
    context.subscriptions.push(statusBarScheduler);
}

/**
 * Update status bar status
 */
function updateStatus(status: 'ready' | 'analyzing' | 'running' | 'stopped' | 'error', message?: string): void {
    const statusMap = {
        ready: { icon: '$(check)', text: 'Ready', color: undefined },
        analyzing: { icon: '$(sync~spin)', text: 'Analyzing...', color: undefined },
        running: { icon: '$(sync~spin)', text: 'Running...', color: undefined },
        stopped: { icon: '$(debug-stop)', text: 'Stopped', color: undefined },
        error: { icon: '$(error)', text: 'Error', color: new vscode.ThemeColor('statusBarItem.errorBackground') }
    };

    const statusInfo = statusMap[status];
    statusBarStatus.text = `${statusInfo.icon} ${message || statusInfo.text}`;
    statusBarStatus.backgroundColor = statusInfo.color;
}

/**
 * Load AI configuration
 */
function loadAIConfiguration(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('testfox');
    const apiKey = config.get<string>('ai.apiKey');
    
    if (apiKey) {
        const openRouter = getOpenRouterClient();
        openRouter.setApiKey(apiKey);
        openRouter.loadConfiguration(); // Reload to ensure model is set correctly
        
        // If no model is configured, default to free Gemini
        const model = config.get<string>('ai.model');
        if (!model) {
            config.update('ai.model', 'google/gemini-2.0-flash-exp:free', vscode.ConfigurationTarget.Global).then(() => {
                console.log('TestFox: Set default model to Gemini 2.0 Flash (free)');
            });
        }
    }
}

/**
 * Check if onboarding is needed and show simple onboarding
 */
async function checkAndShowOnboarding(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('testfox');
    const apiKey = config.get<string>('ai.apiKey');
    const setupCompleted = context.globalState.get<boolean>('testfox.setupCompleted', false);
    const onboardingShown = context.globalState.get<boolean>('testfox.onboardingShown', false);

    // Don't show onboarding if setup is already completed and onboarding was shown
    if (setupCompleted && onboardingShown) {
        return;
    }

    // Show onboarding on first install or if AI is not configured
    if (!onboardingShown || !apiKey) {
        // Mark as shown immediately to prevent multiple prompts
        await context.globalState.update('testfox.onboardingShown', true);

        // Show simple onboarding dialog after extension loads
        setTimeout(async () => {
            const result = await vscode.window.showInformationMessage(
                '🦊 Welcome to TestFox! AI-powered testing is ready.',
                'Set Up AI',
                'Skip AI (Rule-based)',
                'Configure Later'
            );

            if (result === 'Set Up AI') {
                // Show the onboarding panel for AI setup
                OnboardingPanel.createOrShow(context.extensionUri, context);
            } else if (result === 'Skip AI (Rule-based)') {
                // Mark setup as completed with rule-based mode
                await context.globalState.update('testfox.setupCompleted', true);
                await config.update('ai.enabled', false, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('TestFox configured for rule-based testing. Use "AI Config" button later to enable AI features.');
            }
        }, 2000);
    }
}

/**
 * Auto-initialize extension
 */
async function autoInitialize(context: vscode.ExtensionContext): Promise<void> {
    // Check and show onboarding if needed
    await checkAndShowOnboarding(context);

    const config = vscode.workspace.getConfiguration('testfox');
    const autoAnalyze = config.get<boolean>('autoAnalyze', true);
    const autoInstallDeps = config.get<boolean>('autoInstallDependencies', true);

    console.log('Auto-initialization starting...');
    console.log(`Auto-analyze: ${autoAnalyze}, Auto-install deps: ${autoInstallDeps}`);
    console.log(`Workspace folders: ${vscode.workspace.workspaceFolders?.length || 0}`);

    try {
        // Check and install dependencies
        if (autoInstallDeps) {
            console.log('Checking dependencies...');
            updateStatus('analyzing', 'Checking dependencies...');
            try {
                await dependencyManager.ensureDependencies();
                console.log('Dependencies check completed');
            } catch (error) {
                console.error('Dependency installation failed:', error);
                vscode.window.showWarningMessage('TestFox: Failed to install dependencies. Some features may not work.');
            }
        }

        // Auto-analyze project if enabled
        if (autoAnalyze && vscode.workspace.workspaceFolders) {
            console.log('Starting auto-analysis...');
            updateStatus('analyzing', 'Detecting project...');
            try {
                await analyzeProject(true);
                console.log('Auto-analysis completed successfully');
            } catch (error) {
                console.error('Auto-analysis failed:', error);
                vscode.window.showWarningMessage('TestFox: Failed to auto-analyze project. Please try manual analysis.');
            }
        } else {
            console.log('Auto-analysis skipped (disabled or no workspace)');
        }

        updateStatus('ready');
        console.log('Auto-initialization completed successfully');

        // Show welcome message with detected project
        const projectInfo = testStore.getProjectInfo();
        if (projectInfo) {
            const message = projectInfo.framework
                ? `TestFox detected ${projectInfo.framework} (${projectInfo.language}) project`
                : `TestFox detected ${projectInfo.type} project`;

            vscode.window.showInformationMessage(
                message,
                'Generate Tests',
                'Open Dashboard'
            ).then(selection => {
                if (selection === 'Generate Tests') {
                    vscode.commands.executeCommand('testfox.generateTests');
                } else if (selection === 'Open Dashboard') {
                    vscode.commands.executeCommand('testfox.openDashboard');
                }
            });
        }
    } catch (error) {
        console.error('Auto-initialize failed:', error);
        updateStatus('error', 'Init failed');
    }
}

export async function analyzeProject(silent = false): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('TestFox: No workspace folder open');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    updateStatus('analyzing');

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'TestFox: Analyzing project...',
        cancellable: false
    }, async (progress) => {
        try {
            // Detect project type
            progress.report({ message: 'Detecting project type...' });
            const projectInfo = await projectDetector.detect(workspacePath);
            testStore.setProjectInfo(projectInfo);

            // Analyze code structure
            progress.report({ message: 'Analyzing code structure...' });
            const analysisResult = await codeAnalyzer.analyze(workspacePath, projectInfo);
            
            // Ensure analysis result has all required properties
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
            
            testStore.setAnalysisResult(analysisResult);

            // Refresh views
            testExplorerProvider.refresh();
            updateStatus('ready');

            if (!silent) {
                vscode.window.showInformationMessage(
                    `TestFox: Detected ${projectInfo.framework || projectInfo.type} project. ` +
                    `Found ${analysisResult.routes.length} routes, ` +
                    `${analysisResult.forms.length} forms, ` +
                    `${analysisResult.endpoints.length} API endpoints.`
                );
            }
        } catch (error) {
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Analysis failed - ${error}`);
        }
    });
}

export async function generateTests(): Promise<void> {
    let analysisResult = testStore.getAnalysisResult();

    // Always ensure we have analysis result
    if (!analysisResult) {
        console.log('TestFox: No analysis result found, running analysis...');
        updateStatus('analyzing', 'Analyzing project...');

        try {
        await analyzeProject();
        analysisResult = testStore.getAnalysisResult();
        } catch (error) {
            console.error('TestFox: Analysis failed:', error);
            updateStatus('error');
            vscode.window.showErrorMessage('TestFox: Project analysis failed. Please try again.');
            return;
        }
    }

    // Double-check we have analysis result after analysis
    if (!analysisResult) {
        console.error('TestFox: Still no analysis result after running analysis');
        updateStatus('error');
        vscode.window.showErrorMessage('TestFox: Unable to analyze project. Please check your workspace.');
        return;
    }

    // Ensure analysis result has all required properties with safe defaults
    if (!analysisResult.routes) analysisResult.routes = [];
    if (!analysisResult.forms) analysisResult.forms = [];
    if (!analysisResult.endpoints) analysisResult.endpoints = [];
    if (!analysisResult.authFlows) analysisResult.authFlows = [];
    if (!analysisResult.databaseQueries) analysisResult.databaseQueries = [];
    if (!analysisResult.externalApis) analysisResult.externalApis = [];
    if (!analysisResult.components) analysisResult.components = [];

    // Ensure all arrays are actually arrays
    analysisResult.routes = Array.isArray(analysisResult.routes) ? analysisResult.routes : [];
    analysisResult.forms = Array.isArray(analysisResult.forms) ? analysisResult.forms : [];
    analysisResult.endpoints = Array.isArray(analysisResult.endpoints) ? analysisResult.endpoints : [];
    analysisResult.authFlows = Array.isArray(analysisResult.authFlows) ? analysisResult.authFlows : [];
    analysisResult.databaseQueries = Array.isArray(analysisResult.databaseQueries) ? analysisResult.databaseQueries : [];
    analysisResult.externalApis = Array.isArray(analysisResult.externalApis) ? analysisResult.externalApis : [];
    analysisResult.components = Array.isArray(analysisResult.components) ? analysisResult.components : [];

    console.log(`TestFox: Analysis result ready - routes: ${analysisResult.routes.length}, forms: ${analysisResult.forms.length}, endpoints: ${analysisResult.endpoints.length}`);

    // Check if application is running before proceeding
    const appUrl = await checkApplicationAvailability();
    if (!appUrl) {
        const startApp = await vscode.window.showWarningMessage(
            'TestFox: No application detected on common ports (3000, 8080, 4200, 5000, 8000). Would you like to start the application?',
            'Start Application',
            'Cancel'
        );

        if (startApp === 'Start Application') {
            try {
                const projectInfo = testStore.getProjectInfo();
                if (projectInfo) {
                    await appRunner.start(projectInfo);
                    // Wait a moment for the app to start
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    vscode.window.showErrorMessage('TestFox: No project information available. Please analyze the project first.');
                    return;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`TestFox: Failed to start application - ${error}`);
                return;
            }
        } else {
            vscode.window.showInformationMessage(
                'TestFox: Tests cancelled. Please ensure your application is running and try again.',
                'View Settings'
            ).then(selection => {
                if (selection === 'View Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'testfox');
                }
            });
            return;
        }
    }

    updateStatus('running', 'Generating tests...');

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'TestFox: Generating tests...',
        cancellable: false
    }, async (progress) => {
        try {
            const openRouter = getOpenRouterClient();
            
            // Try AI-enhanced generation first
            if (openRouter.isEnabled()) {
                progress.report({ message: 'Using AI to generate tests...' });
                
                try {
                    const aiTests = await testGeneratorAI.generateWithAI();
                    
                    if (aiTests && Array.isArray(aiTests) && aiTests.length > 0) {
                        vscode.window.showInformationMessage(
                            `TestFox AI: Generated ${aiTests.length} test cases using AI`
                        );
                        testExplorerProvider.refresh();
                        testResultsProvider.refresh();
                        updateStatus('ready');
                        return;
                    } else {
                        console.log('TestFox: AI generation returned no tests, falling back to rule-based');
                    }
                } catch (error) {
                    console.error('AI generation failed, falling back to rule-based:', error);
                    // Don't show error to user - fallback is expected behavior
                }
            } else {
                console.log('TestFox: AI not enabled, using rule-based generation');
            }

            // Fall back to rule-based generation
            const generator = new TestGeneratorManager(
                testStore,
                testCoverageTracker || undefined,
                false // Full generation mode
            );
            
            // Quick Validation
            progress.report({ message: 'Generating smoke tests...' });
            await generator.generateSmokeTests();
            await generator.generateSanityTests();
            await generator.generateRegressionTests();

            // Functional
            progress.report({ message: 'Generating functional tests...' });
            await generator.generateFunctionalTests();
            await generator.generateApiTests();
            await generator.generateIntegrationTests();

            // Non-Functional
            progress.report({ message: 'Generating security tests...' });
            await generator.generateSecurityTests();
            await generator.generatePerformanceTests();
            await generator.generateLoadTests();
            await generator.generateAccessibilityTests();

            // Edge Cases
            progress.report({ message: 'Generating edge case tests...' });
            await generator.generateEdgeCaseTests();
            await generator.generateNegativeTests();
            await generator.generateBoundaryTests();
            await generator.generateMonkeyTests();

            // Manual/Exploratory
            progress.report({ message: 'Generating exploratory tests...' });
            await generator.generateExploratoryTests();
            await generator.generateUsabilityTests();
            await generator.generateAcceptanceTests();
            await generator.generateCompatibilityTests();

            // Database Tests
            progress.report({ message: 'Generating database tests...' });
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const dbGenerator = new DatabaseTestGenerator(workspacePath);
            const dbTests = await dbGenerator.generateDatabaseTests();
            for (const test of dbTests) {
                testStore.addTest(test);
            }

            // AI-Powered E2E Tests
            progress.report({ message: 'Generating E2E tests with AI...' });
            const projectInfo = testStore.getProjectInfo();
            if (projectInfo && analysisResult) {
                const e2eGenerator = new AIE2ETestGenerator(workspacePath);
                const e2eTests = await e2eGenerator.generateE2ETests(projectInfo, analysisResult);
                for (const test of e2eTests) {
                    testStore.addTest(test);
                }
            }

            // Browser Log Tests (Console + Network)
            progress.report({ message: 'Generating browser log tests...' });
            const browserLogGenerator = new BrowserLogTestGenerator();
            const browserLogTests = browserLogGenerator.generateAllBrowserLogTests();
            for (const test of browserLogTests) {
                testStore.addTest(test);
            }

            // Refresh views
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
            updateStatus('ready');

            const tests = testStore.getAllTests();
            const testCount = Array.isArray(tests) ? tests.length : 0;
            vscode.window.showInformationMessage(
                `TestFox: Generated ${testCount} test cases across all categories`
            );
        } catch (error) {
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Test generation failed - ${error}`);
        }
    });
}

export async function generateTestCategory(categoryOrItem?: string | { category?: string }): Promise<void> {
    // Handle both string category and tree item object
    let category: string | undefined;

    if (typeof categoryOrItem === 'string') {
        category = categoryOrItem;
    } else if (categoryOrItem && typeof categoryOrItem === 'object' && categoryOrItem.category) {
        category = categoryOrItem.category;
    }

    if (!category) {
        // Get all available categories from TEST_CATEGORIES
        const { TEST_CATEGORIES } = require('./types');
        const categories = TEST_CATEGORIES.map((c: any) => c.id);
        const categoryLabels = categories.map((c: string) => c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '));

        const selected = await vscode.window.showQuickPick(categoryLabels, {
            placeHolder: 'Select test category to generate'
        });

        if (selected) {
            category = selected.toLowerCase().replace(' ', '_');
        }
    }

    if (!category) {
        return;
    }

    let analysisResult = testStore.getAnalysisResult();
    if (!analysisResult) {
        vscode.window.showWarningMessage('TestFox: Please analyze the project first');
        await analyzeProject();
        analysisResult = testStore.getAnalysisResult();
        if (!analysisResult) {
            vscode.window.showErrorMessage('TestFox: Project analysis failed. Please try again.');
            return;
        }
    }

    // Ensure analysis result has all required properties
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

    updateStatus('running', `Generating ${category} tests...`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TestFox: Generating ${category} tests...`,
        cancellable: false
    }, async (progress) => {
        try {
            const generator = new TestGeneratorManager(
                testStore,
                testCoverageTracker || undefined,
                false // Full generation mode
            );
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            let testsGenerated = 0;

            // Generate tests based on category
            switch (category) {
                case 'smoke':
                    progress.report({ message: 'Generating smoke tests...' });
                    await generator.generateSmokeTests();
                    break;
                case 'sanity':
                    progress.report({ message: 'Generating sanity tests...' });
                    await generator.generateSanityTests();
                    break;
                case 'regression':
                    progress.report({ message: 'Generating regression tests...' });
                    await generator.generateRegressionTests();
                    break;
                case 'functional':
                    progress.report({ message: 'Generating functional tests...' });
                    await generator.generateFunctionalTests();
                    break;
                case 'api':
                    progress.report({ message: 'Generating API tests...' });
                    await generator.generateApiTests();
                    break;
                case 'integration':
                    progress.report({ message: 'Generating integration tests...' });
                    await generator.generateIntegrationTests();
                    break;
                case 'database':
                    progress.report({ message: 'Generating database tests...' });
                    const dbGenerator = new DatabaseTestGenerator(workspacePath);
                    const dbTests = await dbGenerator.generateDatabaseTests();
                    for (const test of dbTests) {
                        testStore.addTest(test);
                        testsGenerated++;
                    }
                    break;
                case 'security':
                    progress.report({ message: 'Generating security tests...' });
                    await generator.generateSecurityTests();
                    break;
                case 'performance':
                    progress.report({ message: 'Generating performance tests...' });
                    await generator.generatePerformanceTests();
                    break;
                case 'load':
                    progress.report({ message: 'Generating load tests...' });
                    await generator.generateLoadTests();
                    break;
                case 'stress':
                    progress.report({ message: 'Generating load and stress tests...' });
                    await generator.generateLoadTests();
                    break;
                case 'accessibility':
                    progress.report({ message: 'Generating accessibility tests...' });
                    await generator.generateAccessibilityTests();
                    break;
                case 'negative':
                    progress.report({ message: 'Generating negative tests...' });
                    await generator.generateNegativeTests();
                    break;
                case 'boundary':
                    progress.report({ message: 'Generating boundary tests...' });
                    await generator.generateBoundaryTests();
                    break;
                case 'monkey':
                    progress.report({ message: 'Generating monkey tests...' });
                    await generator.generateMonkeyTests();
                    break;
                case 'exploratory':
                    progress.report({ message: 'Generating exploratory tests...' });
                    await generator.generateExploratoryTests();
                    break;
                case 'usability':
                    progress.report({ message: 'Generating usability tests...' });
                    await generator.generateUsabilityTests();
                    break;
                case 'acceptance':
                    progress.report({ message: 'Generating acceptance tests...' });
                    await generator.generateAcceptanceTests();
                    break;
                case 'compatibility':
                    progress.report({ message: 'Generating compatibility tests...' });
                    await generator.generateCompatibilityTests();
                    break;
                case 'ui':
                    progress.report({ message: 'Generating UI tests...' });
                    const uiGenerator = new UITestGenerator(workspacePath);
                    const uiTests = await uiGenerator.generateUITests();
                    for (const test of uiTests) {
                        testStore.addTest(test);
                        testsGenerated++;
                    }
                    break;
                case 'e2e':
                    progress.report({ message: 'Generating E2E tests with AI...' });
                    const projectInfo = testStore.getProjectInfo();
                    if (projectInfo && analysisResult) {
                        const e2eGenerator = new AIE2ETestGenerator(workspacePath);
                        const e2eTests = await e2eGenerator.generateE2ETests(projectInfo, analysisResult);
                        for (const test of e2eTests) {
                            testStore.addTest(test);
                            testsGenerated++;
                        }
                    }
                    break;
                case 'console_logs':
                    progress.report({ message: 'Generating console log tests...' });
                    const browserLogGenerator = new BrowserLogTestGenerator();
                    const consoleTests = browserLogGenerator.generateConsoleLogTests();
                    for (const test of consoleTests) {
                        testStore.addTest(test);
                        testsGenerated++;
                    }
                    break;
                case 'network_logs':
                    progress.report({ message: 'Generating network log tests...' });
                    const networkLogGenerator = new BrowserLogTestGenerator();
                    const networkTests = networkLogGenerator.generateNetworkLogTests();
                    for (const test of networkTests) {
                        testStore.addTest(test);
                        testsGenerated++;
                    }
                    break;
                case 'account_management':
                    progress.report({ message: 'Generating account management tests...' });
                    const accountGenerator = new BrowserLogTestGenerator();
                    const accountTests = accountGenerator.generateAccountManagementTests();
                    for (const test of accountTests) {
                        testStore.addTest(test);
                        testsGenerated++;
                    }
                    break;
                default:
                    vscode.window.showWarningMessage(`TestFox: Category '${category}' generation not implemented yet`);
                    updateStatus('ready');
                    return;
            }

            // Count tests for categories that use the TestGeneratorManager
            if (category !== 'database' && category !== 'ui' && category !== 'e2e' &&
                category !== 'console_logs' && category !== 'network_logs' && category !== 'account_management') {
                const allTests = testStore?.getAllTests() || [];
                const categoryTests = Array.isArray(allTests) ? allTests.filter(test => test.category === category) : [];
                testsGenerated = Array.isArray(categoryTests) ? categoryTests.length : 0;
            }

            // Refresh views
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
            updateStatus('ready');

            const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
            vscode.window.showInformationMessage(
                `TestFox: Generated ${testsGenerated} test cases for ${categoryName}`
            );
        } catch (error) {
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Test generation failed - ${error}`);
        }
    });
}

export async function runAllTests(): Promise<void> {
    if (!testStore) {
        vscode.window.showErrorMessage('TestFox: Extension not fully initialized. Please try again.');
        return;
    }
    
    const tests = testStore.getAllTests();
    if (!tests || !Array.isArray(tests) || tests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No tests to run. Generate tests first.');
        return;
    }

    // Check if application is running
    const appUrl = await checkApplicationAvailability();
    if (!appUrl) {
        const startApp = await vscode.window.showWarningMessage(
            'TestFox: No application detected. Would you like to start it?',
            'Start Application',
            'Cancel'
        );

        if (startApp === 'Start Application') {
            const projectInfo = testStore.getProjectInfo();
            if (projectInfo) {
                await appRunner.start(projectInfo);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for startup
            } else {
                vscode.window.showErrorMessage('TestFox: No project information available.');
                return;
            }
        } else {
            return;
        }
    }

    updateStatus('running', 'Running tests...');
    const startTime = Date.now();

    // Start a new defect tracking run
    const runNumber = defectTracker.startNewRun();
    
    // Determine trigger type
    const trigger = 'manual' as const; // Can be enhanced to detect scheduled/commit triggers
    
    // Start test execution with Control Center
    const automatedTests = Array.isArray(tests) ? tests.filter(t => t.automationLevel !== 'manual') : [];
    if (!Array.isArray(automatedTests) || automatedTests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No automated tests to run.');
        return;
    }
    testExecutionManager.startRun(automatedTests, `Run #${runNumber} (${trigger})`);

        try {
            // Start the application
        testExecutionManager.addLog('info', 'Starting application...');
            const projectInfo = testStore.getProjectInfo();
            if (projectInfo) {
                try {
                    await appRunner.start(projectInfo);
                    // Wait for app to be ready
                    await appRunner.waitForReady(15000);
                testExecutionManager.addLog('success', 'Application started successfully');
                } catch (error) {
                    console.warn('Could not start application:', error);
                testExecutionManager.addLog('warning', 'Could not start application automatically');
            }
        }

        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const categoryResults = new Map<string, { total: number; passed: number; failed: number }>();

        // Run tests
            for (const test of automatedTests) {
            // Check for pause/stop
            await testExecutionManager.checkPause();
            if (testExecutionManager.isStopped()) {
                const remainingTests = Array.isArray(automatedTests) ? automatedTests.length - (passed + failed + skipped) : 0;
                skipped += remainingTests;
                    break;
                }

                const result = await testRunner.runTest(test);
                testStore.updateTestResult(test.id, result);
            
            // Update Control Center
            testExecutionManager.updateTestProgress(test, result);

                // Track category results
                const catResult = categoryResults.get(test.category) || { total: 0, passed: 0, failed: 0 };
                catResult.total++;

                // Track defects
                if (result.status === 'passed') {
                    passed++;
                    catResult.passed++;
                    // Check if this fixes a defect
                    defectTracker.reportPass(test.id);
                } else if (result.status === 'failed') {
                    failed++;
                    catResult.failed++;
                    // Report as defect
                    defectTracker.reportFailure(
                        test.id,
                        test.name,
                        test.category,
                        result.error || 'Test failed',
                        test.priority === 'critical' ? 'critical' : 
                            test.priority === 'high' ? 'high' : 'medium'
                    );
                } else {
                    skipped++;
                }

                categoryResults.set(test.category, catResult);

                // Update views periodically
            if ((passed + failed + skipped) % 5 === 0) {
                    testResultsProvider.refresh();
                }
            }

            // Stop the application
            await appRunner.stop();

            // Complete the defect tracking run
            const duration = Date.now() - startTime;
            const catResultsArray = Array.from(categoryResults.entries()).map(([category, result]) => ({
                category,
                ...result
            }));
            
            const testRun = defectTracker.completeRun(
                passed + failed + skipped,
                passed,
                failed,
                skipped,
                duration,
                catResultsArray
            );

            // Notify web server of data changes
            webServer.notifyDataChange();

        // Store test run results
        if (gitIntegration) {
            try {
                const allTests = testStore.getAllTests();
                const testRunData = {
                    trigger: trigger,
                    duration,
                    summary: {
                        total: passed + failed + skipped,
                        passed,
                        failed,
                        skipped
                    },
                    tests: Array.isArray(automatedTests) ? automatedTests.map(test => {
                        const result = testStore.getTestResult(test.id);
                        return {
                            testId: test.id,
                            testName: test.name,
                            category: test.category,
                            status: result?.status || 'pending',
                            duration: result?.duration,
                            error: result?.error
                        };
                    }) : [],
                    categoryResults: catResultsArray
                };

                await gitIntegration.storeTestRun(testRunData);
                testExecutionManager.addLog('info', 'Test run stored in .testfox/');
            } catch (error) {
                console.error('Failed to store test run:', error);
                testExecutionManager.addLog('warning', 'Failed to store test run results');
            }
        }

        // Complete test execution
        testExecutionManager.completeRun();

            // Refresh final results
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
            updateStatus('ready');

        // Only show critical notifications (optional - can be disabled via settings)
        const config = vscode.workspace.getConfiguration('testfox');
        const showIDEToast = config.get<boolean>('showIDEToast', false);

        if (showIDEToast) {
            const manual = tests.filter(t => t.automationLevel === 'manual').length;
            vscode.window.showInformationMessage(
                `TestFox: Run #${runNumber} complete - ${passed} passed, ${failed} failed (${testRun.passRate}% pass rate). ` +
                `${testRun.newDefects} new defects, ${testRun.fixedDefects} fixed.`
            );

            // Show defect dashboard if there are new defects
            if (testRun.newDefects > 0) {
                const action = await vscode.window.showWarningMessage(
                    `${testRun.newDefects} new defects found in this run`,
                    'View Defect Dashboard',
                    'View in Browser'
                );
                if (action === 'View Defect Dashboard') {
                    vscode.commands.executeCommand('testfox.openDefectDashboard');
                } else if (action === 'View in Browser') {
                    vscode.commands.executeCommand('testfox.openBrowserDashboard');
                }
                }
            }
        } catch (error) {
            await appRunner.stop();
            updateStatus('error');
        testExecutionManager.addLog('error', `Test execution failed: ${error}`);
        testExecutionManager.completeRun();
        
        // Only show error notification if enabled
        const config = vscode.workspace.getConfiguration('testfox');
        const showIDEToast = config.get<boolean>('showIDEToast', false);
        if (showIDEToast) {
            vscode.window.showErrorMessage(`TestFox: Test execution failed - ${error}`);
        }
    }
}

async function runFullCycleTests(): Promise<void> {
    await runFullCycleTesting();
}

export async function runTestCategory(categoryOrItem?: string | { category?: string }): Promise<void> {
    // Handle both string category and tree item object
    let category: string | undefined;
    
    if (typeof categoryOrItem === 'string') {
        category = categoryOrItem;
    } else if (categoryOrItem && typeof categoryOrItem === 'object' && categoryOrItem.category) {
        category = categoryOrItem.category;
    }
    
    if (!category) {
        const categories = [
            'smoke', 'sanity', 'regression',
            'functional', 'api', 'ui', 'e2e', 'integration', 'database',
            'security', 'performance', 'load', 'stress', 'accessibility',
            'negative', 'boundary', 'monkey',
            'exploratory', 'usability', 'acceptance', 'compatibility'
        ];
        const categoryLabels = categories.map(c => c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '));
        
        const selected = await vscode.window.showQuickPick(categoryLabels, {
            placeHolder: 'Select test category to run'
        });
        
        if (selected) {
            category = selected.toLowerCase().replace(' ', '_');
        }
    }

    if (!category) {
        return;
    }

    const categoryLower = typeof category === 'string' ? category.toLowerCase() : String(category).toLowerCase();
    const tests = testStore?.getTestsByCategory(categoryLower) || [];
    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    
    if (!Array.isArray(tests) || tests.length === 0) {
        vscode.window.showWarningMessage(`TestFox: No ${categoryDisplay} tests found`);
        return;
    }

    updateStatus('running', `Running ${categoryDisplay}...`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TestFox: Running ${categoryDisplay} tests...`,
        cancellable: true
    }, async (progress, token) => {
        try {
            const projectInfo = testStore.getProjectInfo();
            if (projectInfo) {
                try {
                    await appRunner.start(projectInfo);
                    await appRunner.waitForReady(15000);
                } catch {
                    // Continue without app running
                }
            }

            const automatedTests = Array.isArray(tests) ? tests.filter(t => t.automationLevel !== 'manual') : [];
            
            if (!Array.isArray(automatedTests) || automatedTests.length === 0) {
                vscode.window.showWarningMessage(`TestFox: No automated ${categoryDisplay} tests found.`);
                return;
            }
            
            for (const test of automatedTests) {
                if (token.isCancellationRequested) {
                    break;
                }

                progress.report({ 
                    message: `Running: ${test.name}`,
                    increment: automatedTests.length > 0 ? (100 / automatedTests.length) : 0
                });

                const result = await testRunner.runTest(test);
                testStore.updateTestResult(test.id, result);
            }

            await appRunner.stop();
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
            updateStatus('ready');

        } catch (error) {
            await appRunner.stop();
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: ${category} tests failed - ${error}`);
        }
    });
}

/**
 * Run full cycle testing - comprehensive automated testing
 * Discovers credentials, logs in, explores all pages, tests forms and buttons
 */
async function runFullCycleTesting(): Promise<void> {
    const projectInfo = testStore.getProjectInfo();
    
    if (!projectInfo) {
        const result = await vscode.window.showWarningMessage(
            'TestFox: No project analyzed. Analyze project first?',
            'Analyze Now',
            'Cancel'
        );
        
        if (result === 'Analyze Now') {
            await vscode.commands.executeCommand('testfox.analyze');
            return runFullCycleTesting();
        }
        return;
    }

    // Confirm before running
    const confirm = await vscode.window.showInformationMessage(
        'TestFox Full Cycle Testing will:\n' +
        '• Search for credentials in your code\n' +
        '• Attempt to login to your application\n' +
        '• Navigate all pages and click buttons\n' +
        '• Fill and submit forms with test data\n\n' +
        'This may modify data in your application. Continue?',
        { modal: true },
        'Run Full Cycle',
        'Cancel'
    );

    if (confirm !== 'Run Full Cycle') {
        return;
    }

    updateStatus('running', 'Full Cycle Testing...');

    try {
        // Ensure Playwright is installed
        const playwrightReady = await dependencyManager.ensureDependencies();
        if (!playwrightReady) {
            vscode.window.showWarningMessage('TestFox: Playwright is required for Full Cycle Testing. Please install it first.');
            updateStatus('ready');
            return;
        }

        // Get the correct application URL for full cycle testing
        let appUrlRaw = appRunner.getBaseUrl();
        let appUrl: string | null = appUrlRaw;
        if (!appUrl) {
            appUrl = await checkApplicationAvailability();
        }

        if (!appUrl) {
            await appRunner.start(projectInfo);
            await new Promise(resolve => setTimeout(resolve, 3000));
            appUrl = await appRunner.waitForReady(30000);
            if (!appUrl) {
                appUrl = await checkApplicationAvailability();
            }
        }

        if (!appUrl) {
            vscode.window.showErrorMessage('TestFox: Could not determine application URL for full cycle testing.');
            updateStatus('ready');
            return;
        }

        if (!appUrl) {
            vscode.window.showErrorMessage('Failed to start application or detect it running.');
            updateStatus('error', 'App not found');
            return;
        }

        vscode.window.showInformationMessage(`TestFox: Running full cycle tests against ${appUrl}`);
        const result = await fullCycleRunner.run(projectInfo);

        updateStatus('ready');

        // Show summary
        const successRate = result.interactions.filter(i => i.success).length / Math.max(result.interactions.length, 1);
        const successPercent = Math.round(successRate * 100);

        const message = `Full Cycle Complete!\n` +
            `• Pages visited: ${result.pagesVisited}\n` +
            `• Forms tested: ${result.formsTestedCount}\n` +
            `• Buttons clicked: ${result.buttonsClickedCount}\n` +
            `• Success rate: ${successPercent}%\n` +
            `• Login: ${result.loginSuccessful ? '✅' : (result.loginAttempted ? '❌' : 'N/A')}\n` +
            `• Accounts Cleaned: ${result.testAccountsCleaned?.length || 0} / ${result.testAccounts?.length || 0}`;

        const action = await vscode.window.showInformationMessage(
            message,
            'View Report',
            'View Screenshots',
            'Close'
        );

        if (action === 'View Report') {
            await vscode.commands.executeCommand('testfox.generateWebReport');
        } else if (action === 'View Screenshots') {
            if (result.screenshots.length > 0) {
                const uri = vscode.Uri.file(result.screenshots[0]);
                await vscode.commands.executeCommand('vscode.open', uri);
            } else {
                vscode.window.showInformationMessage('No screenshots were captured.');
            }
        }

    } catch (error: any) {
        updateStatus('error');
        vscode.window.showErrorMessage(`TestFox Full Cycle failed: ${error.message}`);
    }
}

/**
 * Run cross-browser compatibility tests
 */
async function runCrossBrowserTests(context: vscode.ExtensionContext): Promise<void> {
    const projectInfo = testStore.getProjectInfo();
    
    if (!projectInfo) {
        vscode.window.showWarningMessage('TestFox: No project analyzed. Please analyze project first.');
        return;
    }

    // Check browser status
    const browserStatus = await dependencyManager.getBrowserStatus();
    const hasAnyBrowser = browserStatus.chromium || browserStatus.firefox || browserStatus.webkit;
    
    if (!hasAnyBrowser) {
        const result = await vscode.window.showWarningMessage(
            'No Playwright browsers installed. Install them now?',
            'Install All Browsers',
            'Cancel'
        );
        
        if (result === 'Install All Browsers') {
            await dependencyManager.installAllBrowsers();
        } else {
            return;
        }
    }

    updateStatus('running', 'Cross-Browser Testing...');

    try {
        // Check if application is already running first
        const existingAppUrl = await checkApplicationAvailability();
        let appUrl: string | null;

        if (existingAppUrl) {
            appUrl = existingAppUrl;
            vscode.window.showInformationMessage(`TestFox: Using already running application at ${appUrl}`);
        } else {
            // Start the application
            const startResult = await vscode.window.showInformationMessage(
                'TestFox needs to start your application for cross-browser testing. Continue?',
                { modal: true },
                'Start Application',
                'Cancel'
            );

            if (startResult !== 'Start Application') {
                return;
            }

            // Validate startup command before attempting
            const startupCommand = projectInfo.devCommand || projectInfo.runCommand;
            if (!startupCommand) {
                const configureCommand = await vscode.window.showWarningMessage(
                    'TestFox: No startup command configured for this project.',
                    'Configure Command',
                    'Cancel'
                );

                if (configureCommand === 'Configure Command') {
                    // Open settings to let user configure the command
                    vscode.commands.executeCommand('workbench.action.openSettings', 'testfox');
                    vscode.window.showInformationMessage(
                        'Please configure your application startup command in TestFox settings:\n' +
                        '• testfox.project.devCommand (for development)\n' +
                        '• testfox.project.runCommand (for production)'
                    );
                }
                updateStatus('ready');
                return;
            }

            try {
                vscode.window.showInformationMessage(`TestFox: Starting application with: ${startupCommand}`);

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'TestFox: Starting application...',
                    cancellable: false
                }, async () => {
                    await appRunner.start(projectInfo);
                });

                appUrl = await appRunner.waitForReady(30000);
                if (!appUrl) {
                    throw new Error('Application startup timeout - check the TestFox output panel for details');
                }
            } catch (startError: any) {
                console.error('TestFox: Application startup failed:', startError);

                const helpChoice = await vscode.window.showErrorMessage(
                    `TestFox: Failed to start application automatically\n\n` +
                    `Error: ${startError.message}\n\n` +
                    `Possible solutions:\n` +
                    `• Start your app manually: ${projectInfo.devCommand || projectInfo.runCommand || 'npm run dev'}\n` +
                    `• Check dependencies: ${projectInfo.packageManager || 'npm'} install\n` +
                    `• Verify port availability\n` +
                    `• Check TestFox output panel for details`,
                    'View Output',
                    'Manual Testing',
                    'Configure Command'
                );

                if (helpChoice === 'View Output') {
                    appRunner.showOutputChannel();
                } else if (helpChoice === 'Manual Testing') {
                    const manualUrl = await vscode.window.showInputBox({
                        prompt: 'Enter your application URL for manual testing',
                        placeHolder: 'http://localhost:8080',
                        value: 'http://localhost:8080'
                    });

                    if (manualUrl) {
                        await runManualCrossBrowserTest(manualUrl, projectInfo);
                    }
                } else if (helpChoice === 'Configure Command') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'testfox');
                    vscode.window.showInformationMessage(
                        'Configure your startup command:\n' +
                        '• testfox.project.devCommand\n' +
                        '• testfox.project.runCommand\n\n' +
                        'Example: "npm run dev" or "yarn start"'
                    );
                }

                updateStatus('ready');
                return;
            }
        }

        // Run cross-browser tests
        const tests = testStore.getAllTests();
        const matrix = await crossBrowserRunner.runCompatibilityTests(appUrl, tests);

        // Stop the application
        await appRunner.stop();
        updateStatus('ready');

        // Show results
        const totalTests = matrix.automatedCount + matrix.manualCount;
        const message = `Cross-Browser Testing Complete!\n\n` +
            `✅ Passed: ${matrix.passedCount}\n` +
            `❌ Failed: ${matrix.failedCount}\n` +
            `🤖 Automated: ${matrix.automatedCount}\n` +
            `👤 Manual Required: ${matrix.manualCount}`;

        const action = await vscode.window.showInformationMessage(
            message,
            'View Report',
            'Close'
        );

        if (action === 'View Report') {
            // Create and show the compatibility report
            const reportHtml = crossBrowserRunner.generateCompatibilityReport(matrix);
            const panel = vscode.window.createWebviewPanel(
                'testfoxCompatibility',
                'TestFox Compatibility Report',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );
            panel.webview.html = reportHtml;
        }

    } catch (error: any) {
        await appRunner.stop();
        updateStatus('error');
        vscode.window.showErrorMessage(`TestFox Cross-Browser test failed: ${error.message}`);
    }
}

/**
 * Run cross-browser testing with manually provided application URL
 */
async function runManualCrossBrowserTest(appUrl: string, projectInfo: any): Promise<void> {
    // Validate the URL
    try {
        new URL(appUrl);
    } catch {
        vscode.window.showErrorMessage('Invalid URL format. Please enter a valid URL like http://localhost:8080');
        return;
    }

    // Check if the URL is accessible
    const axios = require('axios').default;
    try {
        await axios.get(appUrl, { timeout: 5000 });
    } catch (error) {
        vscode.window.showErrorMessage(`Cannot connect to ${appUrl}. Please ensure your application is running and accessible.`);
        return;
    }

    updateStatus('running', 'Cross-Browser Testing (Manual)...');

    try {
        // Run cross-browser tests with the provided URL
        const tests = testStore.getAllTests();
        const matrix = await crossBrowserRunner.runCompatibilityTests(appUrl, tests);

        // Show results
        const reportHtml = crossBrowserRunner.generateCompatibilityReport(matrix);
        const panel = vscode.window.createWebviewPanel(
            'testfoxCompatibility',
            'Cross-Browser Test Results',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = reportHtml;

        const message = `Cross-Browser Testing Complete!\n\n` +
            `✅ Passed: ${matrix.passedCount}\n` +
            `❌ Failed: ${matrix.failedCount}\n` +
            `📊 Total: ${matrix.totalCount}`;

        vscode.window.showInformationMessage(message);

    } catch (error: any) {
        vscode.window.showErrorMessage(`TestFox Cross-Browser test failed: ${error.message}`);
    } finally {
        updateStatus('ready');
    }
}

async function markManualTest(testId?: string): Promise<void> {
    if (!testId) {
        const manualTests = testStore.getAllTests().filter(t => t.automationLevel === 'manual');
        const items = manualTests.map(t => ({
            label: t.name,
            description: t.category,
            id: t.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select manual test to mark'
        });

        if (!selected) {
            return;
        }
        testId = selected.id;
    }

    const status = await vscode.window.showQuickPick(
        ['Pass', 'Fail', 'Skip'],
        { placeHolder: 'Select test result' }
    );

    if (!status) {
        return;
    }

    const notes = await vscode.window.showInputBox({
        prompt: 'Add notes (optional)',
        placeHolder: 'Enter any observations or notes...'
    });

    await manualTestTracker.markTest(testId, status.toLowerCase() as any, notes);
    testStore.updateTestResult(testId, {
        status: status.toLowerCase() === 'pass' ? 'manual_pass' : 
                status.toLowerCase() === 'fail' ? 'manual_fail' : 'skipped',
        notes: notes || '',
        timestamp: new Date()
    });

    testExplorerProvider.refresh();
    testResultsProvider.refresh();
    vscode.window.showInformationMessage(`TestFox: Test marked as ${status}`);
}

async function exportReport(): Promise<void> {
    if (!testStore) {
        vscode.window.showErrorMessage('TestFox: Extension not fully initialized. Please try again.');
        return;
    }
    
    const tests = testStore.getAllTests();
    const results = testStore.getTestResults();

    if (!tests || !Array.isArray(tests) || tests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No test data to export');
        return;
    }

    const config = vscode.workspace.getConfiguration('testfox');
    const format = config.get<string>('reportFormat') || 'html';

    updateStatus('running', 'Generating report...');

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'TestFox: Generating report...',
        cancellable: false
    }, async (progress) => {
        try {
            // Try AI-enhanced report summary
            const openRouter = getOpenRouterClient();
            let aiSummary: any = null;

            if (openRouter.isEnabled()) {
                progress.report({ message: 'Generating AI summary...' });
                try {
                    const stats = testStore.getStatistics();
                    const securityTests = tests.filter(t => t.category === 'security');
                    const failedSecurityTests = securityTests.filter(t => {
                        const result = results.find(r => r.testId === t.id);
                        return result?.status === 'failed';
                    });

                    const summaryResponse = await openRouter.generateReportSummary({
                        totalTests: stats.total,
                        passed: stats.passed + stats.manualPass,
                        failed: stats.failed + stats.manualFail,
                        passRate: stats.total > 0 ? Math.round((stats.passed + stats.manualPass) / stats.total * 100) : 0,
                        securityIssues: failedSecurityTests.map(t => t.name),
                        performanceMetrics: { avgTime: 0, slowEndpoints: [] },
                        failedTests: tests.filter(t => {
                            const result = results.find(r => r.testId === t.id);
                            return result?.status === 'failed';
                        }).map(t => t.name)
                    });

                    aiSummary = JSON.parse(summaryResponse);
                } catch (error) {
                    console.error('AI summary failed:', error);
                }
            }

            progress.report({ message: 'Building report...' });

            const projectInfo = testStore.getProjectInfo();
            const reportPath = await reportGenerator.generate({
                projectInfo,
                tests,
                results,
                format: format as 'html' | 'json' | 'both'
            });

            updateStatus('ready');

            const openReport = await vscode.window.showInformationMessage(
                `TestFox: Report generated successfully`,
                'Open Report',
                'Show in Explorer'
            );

            if (openReport === 'Open Report') {
                vscode.env.openExternal(vscode.Uri.file(reportPath));
            } else if (openReport === 'Show in Explorer') {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(reportPath));
            }
        } catch (error) {
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Report generation failed - ${error}`);
        }
    });
}

async function generateWebReport(context: vscode.ExtensionContext): Promise<void> {
    if (!testStore) {
        vscode.window.showErrorMessage('TestFox: Extension not fully initialized. Please try again.');
        return;
    }
    
    const tests = testStore.getAllTests();
    
    if (!tests || !Array.isArray(tests) || tests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No test data available. Generate and run tests first.');
        return;
    }

    ReportPanel.createOrShow(context.extensionUri, testStore, manualTestTracker, defectTracker, issueCreator || undefined);
}

/**
 * Create issue for failed test
 */
async function createIssue(platform: 'github' | 'jira', testId?: string): Promise<void> {
    if (!issueCreator) {
        vscode.window.showErrorMessage('TestFox: Issue creation requires a workspace folder.');
        return;
    }

    // Get test ID if not provided
    if (!testId) {
        if (!testStore) {
            vscode.window.showErrorMessage('TestFox: Extension not fully initialized. Please try again.');
            return;
        }
        
        // Get failed tests
        const allTests = testStore.getAllTests() || [];
        const failedTests = Array.isArray(allTests) ? allTests.filter(test => {
            const result = testStore.getTestResult(test.id);
            return result?.status === 'failed';
        }) : [];

        if (!Array.isArray(failedTests) || failedTests.length === 0) {
            vscode.window.showInformationMessage('TestFox: No failed tests found to create an issue for.');
            return;
        }

        // Let user select a test
        const items = failedTests.map(test => ({
            label: test.name,
            description: test.category,
            detail: testStore.getTestResult(test.id)?.error || 'Test failed',
            testId: test.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a failed test to create an issue for'
        });

        if (!selected) return;
        testId = selected.testId;
    }

    const test = testStore.getTest(testId);
    if (!test) {
        vscode.window.showErrorMessage('TestFox: Test not found.');
        return;
    }

    const result = testStore.getTestResult(testId);
    if (!result || result.status !== 'failed') {
        vscode.window.showWarningMessage('TestFox: Selected test did not fail. Cannot create issue.');
        return;
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `TestFox: Creating ${platform === 'github' ? 'GitHub' : 'Jira'} issue...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Generating issue content with AI...' });

            // Get run ID from latest test run
            const runId = gitIntegration ? 
                (await gitIntegration.getStorage().getLatest())?.id || `run-${Date.now()}` :
                `run-${Date.now()}`;

            // Get historical failures
            const allRuns = gitIntegration ? gitIntegration.getStorage().getAllRuns() : [];
            const historicalFailures = allRuns
                .filter(run => run.tests.some(t => t.testName === test.name && t.status === 'failed'))
                .slice(0, 5)
                .map(run => ({
                    test_name: test.name,
                    run_id: run.id,
                    timestamp: run.timestamp
                }));

            // Generate issue content
            if (!issueCreator) {
                vscode.window.showErrorMessage('TestFox: Issue creator not available.');
                return;
            }
            const issueContent = await issueCreator.generateIssueContent({
                platform,
                test,
                result,
                runId,
                logs: Array.isArray(result.logs) ? result.logs.join('\n') : undefined,
                stackTrace: result.error,
                commit: gitIntegration ? await (async () => {
                    const h = await gitIntegration!.getCurrentCommit();
                    return h ? { hash: h } : undefined;
                })() : undefined,
                historicalFailures: historicalFailures.length > 0 ? historicalFailures : undefined
            });

            progress.report({ message: `Creating ${platform === 'github' ? 'GitHub' : 'Jira'} issue...` });

            // Create the issue
            let issueUrl: string | null = null;
            if (platform === 'github') {
                issueUrl = await issueCreator.createGitHubIssue(issueContent);
            } else {
                issueUrl = await issueCreator.createJiraIssue(issueContent);
            }

            if (issueUrl) {
                vscode.window.showInformationMessage(
                    `TestFox: Issue created successfully!`,
                    'Open Issue'
                ).then(selection => {
                    if (selection === 'Open Issue') {
                        vscode.env.openExternal(vscode.Uri.parse(issueUrl!));
                    }
                });
            } else {
                vscode.window.showInformationMessage('TestFox: Issue content prepared. Check clipboard or follow instructions.');
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`TestFox: Failed to create issue - ${message}`);
    }
}

export function deactivate() {
    // Clean up resources
    if (appRunner) {
        appRunner.stop();
    }
    if (webServer) {
        webServer.stop();
    }
    isActivated = false;
    console.log('TestFox has been deactivated');
}
