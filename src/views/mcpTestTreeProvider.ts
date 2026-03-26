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

        if (element.contextValue === 'testFile') {
            // Show individual tests in file
            return Promise.resolve(this.getTestChildren(element.filePath!));
        }

        return Promise.resolve([]);
    }

    /**
     * Get main MCP server sections
     */
    private getMCPSections(): MCPTreeItem[] {
        const sections: MCPTreeItem[] = [];

        // Playwright MCP Section
        const playwrightItem = new MCPTreeItem(
            '🎭 Playwright Tests',
            vscode.TreeItemCollapsibleState.Expanded,
            'mcpServer'
        );
        playwrightItem.serverId = 'playwright-mcp';
        playwrightItem.iconPath = new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.blue'));
        playwrightItem.description = this.getServerStatus('playwright-mcp');
        playwrightItem.tooltip = 'Playwright E2E Tests';
        sections.push(playwrightItem);

        // QA Use MCP Section
        const qaUseItem = new MCPTreeItem(
            '🧪 QA Use MCP',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        qaUseItem.serverId = 'qa-use-mcp';
        qaUseItem.iconPath = new vscode.ThemeIcon('beaker', new vscode.ThemeColor('charts.green'));
        qaUseItem.description = this.getServerStatus('qa-use-mcp');
        qaUseItem.tooltip = 'QA Use MCP Browser Automation';
        sections.push(qaUseItem);

        // Puppeteer MCP Section
        const puppeteerItem = new MCPTreeItem(
            '🎪 Puppeteer Tests',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        puppeteerItem.serverId = 'puppeteer-mcp';
        puppeteerItem.iconPath = new vscode.ThemeIcon('browser', new vscode.ThemeColor('charts.orange'));
        puppeteerItem.description = this.getServerStatus('puppeteer-mcp');
        puppeteerItem.tooltip = 'Puppeteer Chrome DevTools Tests';
        sections.push(puppeteerItem);

        // Chrome DevTools MCP Section
        const devtoolsItem = new MCPTreeItem(
            '🔧 DevTools Tests',
            vscode.TreeItemCollapsibleState.Collapsed,
            'mcpServer'
        );
        devtoolsItem.serverId = 'chrome-devtools-mcp';
        devtoolsItem.iconPath = new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.purple'));
        devtoolsItem.description = this.getServerStatus('chrome-devtools-mcp');
        devtoolsItem.tooltip = 'Chrome DevTools Performance Tests';
        sections.push(devtoolsItem);

        return sections;
    }

    /**
     * Get children for a specific MCP server
     */
    private getServerChildren(serverId: string): MCPTreeItem[] {
        const items: MCPTreeItem[] = [];

        // Get test result if available
        const result = this.results.get(serverId);

        // Check for test files in the filesystem
        const playwrightDir = path.join(this.workspacePath, 'tests', 'playwright');
        
        if (serverId === 'playwright-mcp' && fs.existsSync(playwrightDir)) {
            // Add test categories
            const e2eDir = path.join(playwrightDir, 'e2e');
            if (fs.existsSync(e2eDir)) {
                const testFiles = this.findTestFiles(e2eDir);
                
                for (const file of testFiles) {
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
                    
                    items.push(testItem);
                }
            }

            // Add action buttons
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
            items.unshift(runAllItem);

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
            items.unshift(generateItem);

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
     * Find all test files in directory
     */
    private findTestFiles(dir: string): string[] {
        const files: string[] = [];
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    files.push(...this.findTestFiles(fullPath));
                } else if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
                    files.push(fullPath);
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

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}
