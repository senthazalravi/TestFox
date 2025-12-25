import * as vscode from 'vscode';
import { ProjectDetector } from './core/projectDetector';
import { CodeAnalyzer } from './core/codeAnalyzer';
import { AppRunner } from './core/appRunner';
import { DependencyManager } from './core/dependencyManager';
import { TestExplorerProvider } from './views/testExplorer';
import { TestResultsProvider } from './views/testResultsProvider';
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
import { TestFoxWebServer } from './server/webServer';
import { TestStore } from './store/testStore';

let projectDetector: ProjectDetector;
let codeAnalyzer: CodeAnalyzer;
let appRunner: AppRunner;
let testRunner: TestRunner;
let testStore: TestStore;
let testExplorerProvider: TestExplorerProvider;
let testResultsProvider: TestResultsProvider;
let manualTestTracker: ManualTestTracker;
let reportGenerator: ReportGenerator;
let dependencyManager: DependencyManager;
let testGeneratorAI: TestGeneratorAI;
let fullCycleRunner: FullCycleRunner;
let crossBrowserRunner: CrossBrowserRunner;
let defectTracker: DefectTracker;
let webServer: WebServer;

// Status bar items
let statusBarMain: vscode.StatusBarItem;
let statusBarAI: vscode.StatusBarItem;
let statusBarStatus: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('TestFox is now active!');

    // Initialize status bar first (visible immediately)
    initStatusBar(context);

    // Initialize core components
    testStore = new TestStore(context);
    projectDetector = new ProjectDetector();
    codeAnalyzer = new CodeAnalyzer();
    appRunner = new AppRunner();
    testRunner = new TestRunner(appRunner);
    manualTestTracker = new ManualTestTracker(context);
    reportGenerator = new ReportGenerator(context);
    dependencyManager = new DependencyManager(context);
    testGeneratorAI = new TestGeneratorAI(testStore);
    fullCycleRunner = new FullCycleRunner(appRunner);
    crossBrowserRunner = new CrossBrowserRunner(dependencyManager);
    defectTracker = new DefectTracker(context);
    webServer = new WebServer(context);

    // Initialize AI client with status bar
    const openRouter = getOpenRouterClient();
    openRouter.initStatusBar(statusBarAI);

    // Load AI configuration (including API key from settings)
    loadAIConfiguration(context);

    // Set up web server callbacks
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
            default:
                throw new Error(`Unknown data type: ${type}`);
        }
    });

    // Initialize view providers
    testExplorerProvider = new TestExplorerProvider(testStore);
    testResultsProvider = new TestResultsProvider(testStore);

    // Register tree views
    const testExplorerView = vscode.window.createTreeView('testfox-explorer', {
        treeDataProvider: testExplorerProvider,
        showCollapseAll: true
    });

    const testResultsView = vscode.window.createTreeView('testfox-results', {
        treeDataProvider: testResultsProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(testExplorerView, testResultsView);

    // Register commands
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
            const options = [
                { label: '$(key) Enter API Key', description: 'Configure your AI provider API key', action: 'apikey' },
                { label: '$(hubot) Select AI Model', description: 'Choose which AI model to use', action: 'model' },
                { label: '$(gear) Open All AI Settings', description: 'Open full AI configuration', action: 'settings' },
                { label: '$(question) Get Free API Key', description: 'Learn how to get a free OpenRouter key', action: 'help' }
            ];

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'Configure TestFox AI Settings'
            });

            if (!selected) return;

            if (selected.action === 'apikey') {
                const apiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your OpenRouter API key',
                    placeHolder: 'sk-or-v1-...',
                    password: true,
                    validateInput: (value) => {
                        if (!value) return 'API key is required';
                        if (!value.startsWith('sk-')) return 'API key should start with sk-';
                        return null;
                    }
                });

                if (apiKey) {
                    const config = vscode.workspace.getConfiguration('testfox');
                    await config.update('ai.apiKey', apiKey, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage('TestFox: API key saved successfully!');
                }
            } else if (selected.action === 'model') {
                const models = [
                    { label: 'Grok Beta', description: 'x-ai/grok-beta - Fast, capable model by xAI', value: 'x-ai/grok-beta' },
                    { label: 'Grok 2', description: 'x-ai/grok-2-1212 - Latest Grok version', value: 'x-ai/grok-2-1212' },
                    { label: 'Claude 3.5 Sonnet', description: 'anthropic/claude-3.5-sonnet - Best for complex analysis', value: 'anthropic/claude-3.5-sonnet' },
                    { label: 'GPT-4o Mini', description: 'openai/gpt-4o-mini - Fast and affordable', value: 'openai/gpt-4o-mini' },
                    { label: '$(star) Llama 3.1 8B (FREE)', description: 'meta-llama/llama-3.1-8b-instruct:free', value: 'meta-llama/llama-3.1-8b-instruct:free' },
                    { label: '$(star) Gemma 2 9B (FREE)', description: 'google/gemma-2-9b-it:free', value: 'google/gemma-2-9b-it:free' }
                ];

                const selectedModel = await vscode.window.showQuickPick(models, {
                    placeHolder: 'Select AI model for test generation'
                });

                if (selectedModel) {
                    const config = vscode.workspace.getConfiguration('testfox');
                    await config.update('ai.model', selectedModel.value, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`TestFox: AI model set to ${selectedModel.label}`);
                }
            } else if (selected.action === 'settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'testfox.ai');
            } else if (selected.action === 'help') {
                const openDocs = await vscode.window.showInformationMessage(
                    'Get a free API key from OpenRouter:\n\n1. Visit openrouter.ai\n2. Sign up for free\n3. Create an API key\n4. Some models are completely free!',
                    'Open OpenRouter',
                    'Cancel'
                );
                if (openDocs === 'Open OpenRouter') {
                    vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
                }
            }
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

        vscode.commands.registerCommand('testfox.openBrowserDashboard', async () => {
            if (!webServer.isServerRunning()) {
                const started = await webServer.start();
                if (!started) {
                    vscode.window.showErrorMessage('TestFox: Failed to start web server for browser dashboard');
                    return;
                }
            }

            const url = webServer.getServerUrl();
            if (url) {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }),

        vscode.commands.registerCommand('testfox.startWebServer', async () => {
            const success = await webServer.start();
            if (success) {
                vscode.window.showInformationMessage(`TestFox Web Server started on http://localhost:${webServer.getPort()}`);
                updateStatus('server', `Server: ${webServer.getPort()}`);
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
            if (!webServer.isRunning()) {
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

            if (webServer.isRunning()) {
                const url = `http://localhost:${webServer.getPort()}`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } else {
                vscode.window.showErrorMessage('TestFox Web Server is not running');
            }
        })
    ];

    context.subscriptions.push(...commands);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('testfox.ai')) {
                loadAIConfiguration(context);
                openRouter.loadConfiguration();
                openRouter.updateStatusBar();
            }
        })
    );

    // Auto-initialize on activation
    await autoInitialize(context);
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
    }
}

/**
 * Auto-initialize extension
 */
async function autoInitialize(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('testfox');
    const autoAnalyze = config.get<boolean>('autoAnalyze', true);
    const autoInstallDeps = config.get<boolean>('autoInstallDependencies', true);

    try {
        // Check and install dependencies
        if (autoInstallDeps) {
            updateStatus('analyzing', 'Checking dependencies...');
            await dependencyManager.ensureDependencies();
        }

        // Auto-analyze project if enabled
        if (autoAnalyze && vscode.workspace.workspaceFolders) {
            updateStatus('analyzing', 'Detecting project...');
            await analyzeProject(true);
        }

        updateStatus('ready');

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

async function analyzeProject(silent = false): Promise<void> {
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

async function generateTests(): Promise<void> {
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
                    
                    if (aiTests.length > 0) {
                        testExplorerProvider.refresh();
                        testResultsProvider.refresh();
                        updateStatus('ready');
                        return;
                    }
                } catch (error) {
                    console.error('AI generation failed, falling back to rule-based:', error);
                }
            }

            // Fall back to rule-based generation
            const generator = new TestGeneratorManager(testStore);
            
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
            vscode.window.showInformationMessage(
                `TestFox: Generated ${tests.length} test cases across all categories`
            );
        } catch (error) {
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Test generation failed - ${error}`);
        }
    });
}

async function generateTestCategory(categoryOrItem?: string | { category?: string }): Promise<void> {
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
            const generator = new TestGeneratorManager(testStore);
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
                const allTests = testStore.getAllTests();
                const categoryTests = allTests.filter(test => test.category === category);
                testsGenerated = categoryTests.length;
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

async function runAllTests(): Promise<void> {
    const tests = testStore.getAllTests();
    if (tests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No tests to run. Generate tests first.');
        return;
    }

    updateStatus('running', 'Running tests...');
    const startTime = Date.now();

    // Start a new defect tracking run
    const runNumber = defectTracker.startNewRun();
    vscode.window.showInformationMessage(`TestFox: Starting Test Run #${runNumber}`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TestFox: Test Run #${runNumber}`,
        cancellable: true
    }, async (progress, token) => {
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const categoryResults = new Map<string, { total: number; passed: number; failed: number }>();

        try {
            // Start the application
            progress.report({ message: 'Starting application...' });
            const projectInfo = testStore.getProjectInfo();
            if (projectInfo) {
                try {
                    await appRunner.start(projectInfo);
                    // Wait for app to be ready
                    await appRunner.waitForReady(15000);
                } catch (error) {
                    console.warn('Could not start application:', error);
                }
            }

            // Run tests
            const automatedTests = tests.filter(t => t.automationLevel !== 'manual');
            let completed = 0;

            for (const test of automatedTests) {
                if (token.isCancellationRequested) {
                    skipped++;
                    break;
                }

                progress.report({ 
                    message: `Running: ${test.name}`,
                    increment: (100 / automatedTests.length)
                });

                const result = await testRunner.runTest(test);
                testStore.updateTestResult(test.id, result);
                completed++;

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
                if (completed % 5 === 0) {
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

            // Refresh final results
            testExplorerProvider.refresh();
            testResultsProvider.refresh();
            updateStatus('ready');

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
        } catch (error) {
            await appRunner.stop();
            updateStatus('error');
            vscode.window.showErrorMessage(`TestFox: Test execution failed - ${error}`);
        }
    });
}

async function runFullCycleTests(): Promise<void> {
    await runFullCycleTesting();
}

async function runTestCategory(categoryOrItem?: string | { category?: string }): Promise<void> {
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
    const tests = testStore.getTestsByCategory(categoryLower);
    const categoryDisplay = category.charAt(0).toUpperCase() + category.slice(1);
    
    if (tests.length === 0) {
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

            const automatedTests = tests.filter(t => t.automationLevel !== 'manual');
            
            for (const test of automatedTests) {
                if (token.isCancellationRequested) {
                    break;
                }

                progress.report({ 
                    message: `Running: ${test.name}`,
                    increment: (100 / automatedTests.length)
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
            `• Login: ${result.loginSuccessful ? '✅' : (result.loginAttempted ? '❌' : 'N/A')}`;

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
        // Start the application
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox: Starting application...',
            cancellable: false
        }, async () => {
            await appRunner.start(projectInfo);
        });

        const appUrl = await appRunner.waitForReady(30000);
        if (!appUrl) {
            throw new Error('Application failed to start');
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
    const tests = testStore.getAllTests();
    const results = testStore.getTestResults();

    if (tests.length === 0) {
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
    const tests = testStore.getAllTests();
    
    if (tests.length === 0) {
        vscode.window.showWarningMessage('TestFox: No test data available. Generate and run tests first.');
        return;
    }

    ReportPanel.createOrShow(context.extensionUri, testStore, manualTestTracker);
}

export function deactivate() {
    // Clean up resources
    if (appRunner) {
        appRunner.stop();
    }
    if (webServer) {
        webServer.stop();
    }
    console.log('TestFox has been deactivated');
}
