import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MCPTestRunner, MCPRunResult } from '../runners/mcpTestRunner';

/**
 * MCP Test Tree Provider - Shows Playwright and MCP test results in Test Explorer
 */
export class MCPTestTreeProvider implements vscode.TreeDataProvider<MCPTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MCPTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<MCPTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MCPTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private testRunner: MCPTestRunner;
    private results: Map<string, MCPRunResult> = new Map();

    constructor(private workspacePath: string) {
        this.testRunner = new MCPTestRunner();
        
        // Listen for test run updates
        this.testRunner.onTestRunUpdated((result) => {
            this.results.set(result.serverId, result);
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MCPTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MCPTreeItem): Thenable<MCPTreeItem[]> {
        if (!element) {
            // Root level - show MCP server categories
            return Promise.resolve(this.getMCPSections());
        }

        if (element.contextValue === 'mcpServer') {
            // Show test files/results for this server
            return Promise.resolve(this.getServerChildren(element.serverId!));
        }

        if (element.contextValue === 'testFolder') {
            // Show test files in this folder
            const result = element.serverId ? this.results.get(element.serverId) : undefined;
            const files = element.testFiles || [];
            return Promise.resolve(files.map(file => this.createTestFileItem(file, result)));
        }

        if (element.contextValue === 'testFile') {
            // Show individual tests in file
            return Promise.resolve(this.getTestChildren(element.filePath!));
        }

        return Promise.resolve([]);
    }

    /**
     * Get main MCP server sections with documentation
     */
    private getMCPSections(): MCPTreeItem[] {
        const sections: MCPTreeItem[] = [];

        // Playwright MCP Section
        const playwrightItem = new MCPTreeItem(
            '🎭 Playwright MCP (Official)',
            vscode.TreeItemCollapsibleState.Expanded,
            'mcpServer'
        );
        playwrightItem.serverId = 'playwright-mcp';
        playwrightItem.iconPath = new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
        playwrightItem.description = this.getServerStatus('playwright-mcp');
        playwrightItem.tooltip = 'Official Microsoft Playwright MCP - Fast, lightweight browser automation using accessibility tree (no vision models needed)';
        playwrightItem.documentationUrl = 'https://github.com/microsoft/playwright-mcp';
        playwrightItem.command = {
            command: 'vscode.open',
            title: 'Open Playwright MCP Documentation',
            arguments: [vscode.Uri.parse('https://github.com/microsoft/playwright-mcp')]
        };
        sections.push(playwrightItem);

        // Postman MCP Section
        const postmanItem = new MCPTreeItem(
            '📮 Postman MCP (API Testing)',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        postmanItem.serverId = 'postman-mcp';
        postmanItem.iconPath = new vscode.ThemeIcon('mail', new vscode.ThemeColor('charts.orange'));
        postmanItem.description = this.getServerStatus('postman-mcp');
        postmanItem.tooltip = 'Postman MCP - API testing and collection management. Features: API requests, collections, environments, tests, and Newman integration';
        postmanItem.documentationUrl = 'https://github.com/postmanlabs/postman-mcp';
        postmanItem.command = {
            command: 'vscode.open',
            title: 'Open Postman MCP Documentation',
            arguments: [vscode.Uri.parse('https://github.com/postmanlabs/postman-mcp')]
        };
        sections.push(postmanItem);

        // Puppeteer MCP Section
        const puppeteerItem = new MCPTreeItem(
            '🎪 Puppeteer MCP (CDP)',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        puppeteerItem.serverId = 'puppeteer-mcp';
        puppeteerItem.iconPath = new vscode.ThemeIcon('browser', new vscode.ThemeColor('charts.orange'));
        puppeteerItem.description = this.getServerStatus('puppeteer-mcp');
        puppeteerItem.tooltip = 'puppeteer-mcp-server - Chrome DevTools automation with smart tab management. Features: navigate, screenshot, click, fill forms, execute JavaScript';
        puppeteerItem.documentationUrl = 'https://github.com/puppeteer-mcp-server/puppeteer-mcp-server';
        puppeteerItem.command = {
            command: 'vscode.open',
            title: 'Open Puppeteer MCP Documentation',
            arguments: [vscode.Uri.parse('https://github.com/puppeteer-mcp-server/puppeteer-mcp-server')]
        };
        sections.push(puppeteerItem);

        // Chrome DevTools MCP Section
        const devtoolsItem = new MCPTreeItem(
            '🔧 Chrome DevTools MCP (Official)',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        devtoolsItem.serverId = 'chrome-devtools-mcp';
        devtoolsItem.iconPath = new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.purple'));
        devtoolsItem.description = this.getServerStatus('chrome-devtools-mcp');
        devtoolsItem.tooltip = 'chrome-devtools-mcp - Official Google Chrome DevTools MCP. Features: performance analysis, network debugging, console logs, screenshots, Lighthouse audits';
        devtoolsItem.documentationUrl = 'https://github.com/ChromeDevTools/chrome-devtools-mcp';
        devtoolsItem.command = {
            command: 'vscode.open',
            title: 'Open Chrome DevTools MCP Documentation',
            arguments: [vscode.Uri.parse('https://github.com/ChromeDevTools/chrome-devtools-mcp')]
        };
        sections.push(devtoolsItem);

        return sections;
    }

    /**
     * Get children for a specific MCP server with subfolder support
     */
    private getServerChildren(serverId: string): MCPTreeItem[] {
        const items: MCPTreeItem[] = [];

        // Get test result if available
        const result = this.results.get(serverId);

        // Check for test files in the filesystem
        const playwrightDir = path.join(this.workspacePath, 'tests', 'playwright');
        const hasTests = fs.existsSync(playwrightDir);
        
        // Add action buttons first - always show generate button
        if (serverId === 'playwright-mcp') {
            // Generate button - always available
            const generateItem = new MCPTreeItem(
                '🤖 Generate AI Tests',
                vscode.TreeItemCollapsibleState.None,
                'action'
            );
            generateItem.iconPath = new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.yellow'));
            generateItem.command = {
                command: 'testfox.mcp.generatePlaywright',
                title: 'Generate Playwright Tests'
            };
            items.push(generateItem);

            // Run button - only if tests exist
            if (hasTests) {
                const runAllItem = new MCPTreeItem(
                    '▶️ Run All Playwright Tests',
                    vscode.TreeItemCollapsibleState.None,
                    'action'
                );
                runAllItem.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'));
                runAllItem.command = {
                    command: 'testfox.mcp.runPlaywright',
                    title: 'Run Playwright Tests'
                };
                items.push(runAllItem);
            }
        } else if (serverId === 'chrome-devtools-mcp') {
            // Chrome DevTools MCP action buttons
            const devtoolsDir = path.join(this.workspacePath, 'tests', 'chrome-devtools');
            const hasDevToolsTests = fs.existsSync(devtoolsDir);

            // Generate button - always available
            const generateItem = new MCPTreeItem(
                '🤖 Generate Chrome DevTools Tests',
                vscode.TreeItemCollapsibleState.None,
                'action'
            );
            generateItem.iconPath = new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.yellow'));
            generateItem.command = {
                command: 'testfox.mcp.generateChromeDevTools',
                title: 'Generate Chrome DevTools Tests'
            };
            items.push(generateItem);

            // Run button - only if tests exist
            if (hasDevToolsTests) {
                const runAllItem = new MCPTreeItem(
                    '▶️ Run Chrome DevTools Tests',
                    vscode.TreeItemCollapsibleState.None,
                    'action'
                );
                runAllItem.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'));
                runAllItem.command = {
                    command: 'testfox.mcp.runChromeDevTools',
                    title: 'Run Chrome DevTools Tests'
                };
                items.push(runAllItem);
            }

            // Show test files if they exist
            if (hasDevToolsTests) {
                const testFiles = this.findDevToolsTestFiles(devtoolsDir);
                
                if (testFiles.length > 0) {
                    // Group files by category
                    const filesByCategory = new Map<string, string[]>();
                    for (const { file, category } of testFiles) {
                        if (!filesByCategory.has(category)) {
                            filesByCategory.set(category, []);
                        }
                        filesByCategory.get(category)!.push(file);
                    }

                    // Create category items
                    for (const [category, files] of filesByCategory) {
                        const categoryItem = new MCPTreeItem(
                            `📁 ${category}`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'testFolder'
                        );
                        categoryItem.folderPath = path.join(devtoolsDir, category);
                        categoryItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.purple'));
                        categoryItem.testFiles = files;
                        categoryItem.serverId = serverId;
                        
                        if (result) {
                            let totalPassed = 0;
                            let totalTests = 0;
                            for (const file of files) {
                                const fileName = path.basename(file);
                                const fileTests = result.tests.filter(t => t.file === file || t.name.includes(fileName.replace('.spec.js', '')));
                                totalPassed += fileTests.filter(t => t.status === 'passed').length;
                                totalTests += fileTests.length;
                            }
                            categoryItem.description = totalTests > 0 ? `${totalPassed}/${totalTests}` : '';
                        }
                        
                        items.push(categoryItem);
                    }
                } else {
                    const noTestsItem = new MCPTreeItem(
                        '📝 No tests yet - click Generate to create',
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    );
                    noTestsItem.iconPath = new vscode.ThemeIcon('info');
                    items.push(noTestsItem);
                }

                // Add report link if available
                if (result?.reportPath) {
                    const reportItem = new MCPTreeItem(
                        '📊 View Latest Report',
                        vscode.TreeItemCollapsibleState.None,
                        'action'
                    );
                    reportItem.iconPath = new vscode.ThemeIcon('report');
                    reportItem.command = {
                        command: 'vscode.open',
                        title: 'Open Report',
                        arguments: [vscode.Uri.file(result.reportPath)]
                    };
                    items.push(reportItem);
                }
            } else {
                // Show placeholder when no tests directory
                const noTestsItem = new MCPTreeItem(
                    '📝 No tests yet - click Generate to create',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                );
                noTestsItem.iconPath = new vscode.ThemeIcon('info');
                items.push(noTestsItem);
            }
        }
        
        // Show test files if they exist
        if (serverId === 'playwright-mcp' && hasTests) {
            // Get all test files with their subfolder info
            const testFiles = this.findTestFilesWithSubfolders(playwrightDir);
            
            if (testFiles.length > 0) {
                // Group files by subfolder
                const filesByFolder = new Map<string, string[]>();
                for (const { file, relativeDir } of testFiles) {
                    const key = relativeDir || '(root)';
                    if (!filesByFolder.has(key)) {
                        filesByFolder.set(key, []);
                    }
                    filesByFolder.get(key)!.push(file);
                }

                // Create folder items
                for (const [folderName, files] of filesByFolder) {
                    if (folderName === '(root)') {
                        // Add root-level files directly
                        for (const file of files) {
                            items.push(this.createTestFileItem(file, result));
                        }
                    } else {
                        // Create folder item with files as children
                        const folderItem = new MCPTreeItem(
                            `📁 ${folderName}`,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'testFolder'
                        );
                        folderItem.folderPath = path.join(playwrightDir, folderName);
                        folderItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.blue'));
                        folderItem.testFiles = files;
                        
                        if (result) {
                            let totalPassed = 0;
                            let totalTests = 0;
                            for (const file of files) {
                                const fileName = path.basename(file);
                                const fileTests = result.tests.filter(t => t.file === file || t.name.includes(fileName.replace('.spec.ts', '')));
                                totalPassed += fileTests.filter(t => t.status === 'passed').length;
                                totalTests += fileTests.length;
                            }
                            folderItem.description = totalTests > 0 ? `${totalPassed}/${totalTests}` : '';
                        }
                        
                        items.push(folderItem);
                    }
                }
            } else {
                // No test files yet
                const noTestsItem = new MCPTreeItem(
                    '📝 No tests yet - click Generate to create',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                );
                noTestsItem.iconPath = new vscode.ThemeIcon('info');
                items.push(noTestsItem);
            }

            // Add report link if available
            if (result?.reportPath) {
                const reportItem = new MCPTreeItem(
                    '📊 View Latest Report',
                    vscode.TreeItemCollapsibleState.None,
                    'action'
                );
                reportItem.iconPath = new vscode.ThemeIcon('report');
                reportItem.command = {
                    command: 'vscode.open',
                    title: 'Open Report',
                    arguments: [vscode.Uri.file(result.reportPath)]
                };
                items.push(reportItem);
            }
        } else if (serverId === 'playwright-mcp' && !hasTests) {
            // Show placeholder when no tests directory
            const noTestsItem = new MCPTreeItem(
                '📝 No tests yet - click Generate to create',
                vscode.TreeItemCollapsibleState.None,
                'info'
            );
            noTestsItem.iconPath = new vscode.ThemeIcon('info');
            items.push(noTestsItem);
        }

        // Show result summary if tests have been run
        if (result) {
            const summaryItem = new MCPTreeItem(
                `Last Run: ${result.summary.passed}/${result.summary.total} passed`,
                vscode.TreeItemCollapsibleState.None,
                'summary'
            );
            summaryItem.iconPath = new vscode.ThemeIcon(
                result.status === 'passed' ? 'check' : 
                result.status === 'failed' ? 'error' : 'warning'
            );
            items.push(summaryItem);
        }

        return items;
    }

    /**
     * Create a test file tree item
     */
    private createTestFileItem(file: string, result?: MCPRunResult): MCPTreeItem {
        const fileName = path.basename(file);
        const testItem = new MCPTreeItem(
            fileName,
            vscode.TreeItemCollapsibleState.Collapsed,
            'testFile'
        );
        testItem.filePath = file;
        testItem.iconPath = new vscode.ThemeIcon('file-code');
        testItem.tooltip = file;
        
        // Check if we have results for this file
        if (result) {
            const fileTests = result.tests.filter(t => t.file === file || t.name.includes(fileName.replace('.spec.ts', '')));
            const passed = fileTests.filter(t => t.status === 'passed').length;
            const total = fileTests.length;
            testItem.description = total > 0 ? `${passed}/${total}` : '';
        }
        
        return testItem;
    }

    /**
     * Find all test files with their subfolder information
     */
    private findTestFilesWithSubfolders(dir: string, baseDir: string = dir): Array<{file: string, relativeDir: string}> {
        const files: Array<{file: string, relativeDir: string}> = [];
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    files.push(...this.findTestFilesWithSubfolders(fullPath, baseDir));
                } else if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
                    const relativeDir = path.relative(baseDir, path.dirname(fullPath));
                    files.push({ file: fullPath, relativeDir });
                }
            }
        } catch (error) {
            // Directory doesn't exist
        }
        
        return files;
    }

    /**
     * Get individual tests from a test file
     */
    private getTestChildren(filePath: string): MCPTreeItem[] {
        const items: MCPTreeItem[] = [];
        
        // Try to parse the test file to extract test names
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const testMatches = content.match(/test\(['"](.+?)['"]/g);
            
            if (testMatches) {
                for (const match of testMatches) {
                    const testName = match.replace(/test\(['"]/, '').replace(/['"]$/,'');
                    const testItem = new MCPTreeItem(
                        testName,
                        vscode.TreeItemCollapsibleState.None,
                        'testCase'
                    );
                    testItem.iconPath = new vscode.ThemeIcon('circle-outline');
                    items.push(testItem);
                }
            }
        } catch (error) {
            // File might not exist or be readable
        }

        // If no tests parsed, show placeholder
        if (items.length === 0) {
            items.push(new MCPTreeItem(
                'Tests will appear here after generation',
                vscode.TreeItemCollapsibleState.None,
                'info'
            ));
        }

        return items;
    }

    /**
     * Find all Chrome DevTools test files with their category
     */
    private findDevToolsTestFiles(dir: string): Array<{file: string, category: string}> {
        const files: Array<{file: string, category: string}> = [];
        
        try {
            const categories = ['performance', 'network', 'console', 'security'];
            
            for (const category of categories) {
                const categoryDir = path.join(dir, 'e2e', category);
                if (fs.existsSync(categoryDir)) {
                    const entries = fs.readdirSync(categoryDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isFile() && entry.name.endsWith('.spec.js')) {
                            files.push({
                                file: path.join(categoryDir, entry.name),
                                category: category.charAt(0).toUpperCase() + category.slice(1)
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // Directory doesn't exist
        }
        
        return files;
    }

    /**
     * Get server status description
     */
    private getServerStatus(serverId: string): string {
        const result = this.results.get(serverId);
        if (!result) {
            return 'Not run';
        }
        
        return `${result.status} · ${result.summary.passed}/${result.summary.total}`;
    }

    /**
     * Update test results
     */
    updateResults(result: MCPRunResult): void {
        this.results.set(result.serverId, result);
        this.refresh();
    }

    /**
     * Get the test runner instance
     */
    getTestRunner(): MCPTestRunner {
        return this.testRunner;
    }
}

/**
 * Tree item for MCP tests
 */
export class MCPTreeItem extends vscode.TreeItem {
    serverId?: string;
    filePath?: string;
    testId?: string;
    folderPath?: string;
    testFiles?: string[];
    documentationUrl?: string;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}
