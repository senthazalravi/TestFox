/**
 * MCP Commands - VS Code command handlers for MCP automation
 * 
 * These commands handle the one-click AI + MCP automation flow
 */

import * as vscode from 'vscode';
import { MCPOrchestrator } from '../mcp/mcpOrchestrator';
import { MCPServerManager } from '../mcp/mcpServerManager';

/**
 * Register all MCP commands
 */
export function registerMCPCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const mcpOrchestrator = new MCPOrchestrator();

    const commands = [
        // Playwright MCP Command
        vscode.commands.registerCommand('testfox.mcp.playwright', async () => {
            await mcpOrchestrator.generateTests('playwright');
        }),

        // Postman MCP Command
        vscode.commands.registerCommand('testfox.mcp.postman', async () => {
            await mcpOrchestrator.generateTests('postman');
        }),

        // DevTools MCP Command
        vscode.commands.registerCommand('testfox.mcp.devtools', async () => {
            await mcpOrchestrator.generateTests('devtools');
        }),

        // Generate All Tests Command
        vscode.commands.registerCommand('testfox.mcp.generateAll', async () => {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: '🎭 Playwright Tests', value: 'playwright' as const },
                    { label: '📮 Postman API Tests', value: 'postman' as const },
                    { label: '🔧 DevTools Tests', value: 'devtools' as const },
                    { label: '🚀 Generate All Tests', value: 'all' as const }
                ],
                {
                    placeHolder: 'Choose test type to generate',
                    title: 'TestFox MCP - Generate Tests'
                }
            );

            if (choice) {
                if (choice.value === 'all') {
                    // Generate all three types sequentially
                    await mcpOrchestrator.generateTests('playwright');
                    await mcpOrchestrator.generateTests('postman');
                    await mcpOrchestrator.generateTests('devtools');
                } else {
                    await mcpOrchestrator.generateTests(choice.value as 'playwright' | 'postman' | 'devtools');
                }
            }
        }),

        // Quick Generate Command (with AI selection)
        vscode.commands.registerCommand('testfox.mcp.quickGenerate', async () => {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: '🎭 Playwright (UI Tests)', value: 'playwright' as const },
                    { label: '📮 Postman (API Tests)', value: 'postman' as const },
                    { label: '🔧 DevTools (Performance)', value: 'devtools' as const }
                ],
                {
                    placeHolder: 'Choose MCP server',
                    title: 'TestFox MCP - Quick Generate'
                }
            );

            if (choice) {
                await mcpOrchestrator.generateTests(choice.value as 'playwright' | 'postman' | 'devtools');
            }
        }),

        // Generate Playwright Tests Command (for MCP Test Explorer)
        vscode.commands.registerCommand('testfox.mcp.generatePlaywright', async () => {
            try {
                vscode.window.showInformationMessage('🦊 TestFox: Generating Playwright tests via MCP...');
                await mcpOrchestrator.generateTests('playwright');
                vscode.window.showInformationMessage('✅ Playwright tests generated successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to generate Playwright tests: ${error.message}`);
            }
        }),

        // Run Playwright Tests Command (for MCP Test Explorer)
        vscode.commands.registerCommand('testfox.mcp.runPlaywright', async () => {
            try {
                vscode.window.showInformationMessage('🦊 TestFox: Running Playwright tests via MCP...');
                // Use the orchestrator to run tests
                const result = await mcpOrchestrator.runTests('playwright');
                if (result) {
                    vscode.window.showInformationMessage(`✅ Playwright tests completed: ${result.summary.passed}/${result.summary.total} passed`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to run Playwright tests: ${error.message}`);
            }
        }),

        // Configure Playwright MCP Command
        vscode.commands.registerCommand('testfox.mcp.configurePlaywright', async () => {
            try {
                const mcpManager = new MCPServerManager(context);
                
                // Show quick picks for configuration
                const browser = await vscode.window.showQuickPick(
                    ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'],
                    { placeHolder: 'Select browser (default: chromium)' }
                );
                
                const headless = await vscode.window.showQuickPick(
                    ['Yes', 'No'],
                    { placeHolder: 'Run in headless mode? (default: Yes)' }
                );
                
                const viewportSize = await vscode.window.showInputBox({
                    prompt: 'Viewport size (e.g., 1280x720)',
                    value: '1280x720'
                });
                
                const timeoutAction = await vscode.window.showInputBox({
                    prompt: 'Action timeout in ms (default: 5000)',
                    value: '5000'
                });
                
                const timeoutNavigation = await vscode.window.showInputBox({
                    prompt: 'Navigation timeout in ms (default: 60000)',
                    value: '60000'
                });

                if (browser && headless && viewportSize && timeoutAction && timeoutNavigation) {
                    await mcpManager.configurePlaywrightMCP({
                        browser: browser as any,
                        headless: headless === 'Yes',
                        viewportSize,
                        timeoutAction: parseInt(timeoutAction),
                        timeoutNavigation: parseInt(timeoutNavigation)
                    });
                    
                    vscode.window.showInformationMessage(
                        `✅ Playwright MCP configured: ${browser} | ${headless === 'Yes' ? 'headless' : 'headed'} | ${viewportSize}`
                    );
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to configure Playwright MCP: ${error.message}`);
            }
        }),

        // QA Use Commands
        vscode.commands.registerCommand('testfox.qaUse.setup', async () => {
            try {
                const terminal = vscode.window.createTerminal('QA Use Setup');
                terminal.show();
                terminal.sendText('npx @desplega.ai/qa-use setup');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to setup QA Use: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.qaUse.testInit', async () => {
            try {
                const terminal = vscode.window.createTerminal('QA Use Test Init');
                terminal.show();
                terminal.sendText('npx @desplega.ai/qa-use test init');
                vscode.window.showInformationMessage('🧪 QA Use: Initializing test directory...');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to init QA Use tests: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.qaUse.testRunAll', async () => {
            try {
                const terminal = vscode.window.createTerminal('QA Use Run All Tests');
                terminal.show();
                terminal.sendText('npx @desplega.ai/qa-use test run --all');
                vscode.window.showInformationMessage('🧪 QA Use: Running all tests...');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to run QA Use tests: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.qaUse.browserCreate', async () => {
            try {
                const terminal = vscode.window.createTerminal('QA Use Browser');
                terminal.show();
                terminal.sendText('npx @desplega.ai/qa-use browser create');
                vscode.window.showInformationMessage('🌐 QA Use: Starting browser session...');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to create QA Use browser: ${error.message}`);
            }
        }),

        // Puppeteer MCP Commands
        vscode.commands.registerCommand('testfox.puppeteer.connectActiveTab', async () => {
            try {
                const debugPort = await vscode.window.showInputBox({
                    prompt: 'Chrome debugging port (default: 9222)',
                    value: '9222'
                });
                
                const targetUrl = await vscode.window.showInputBox({
                    prompt: 'Target URL (optional - leave empty to connect to any tab)',
                    value: ''
                });
                
                if (debugPort) {
                    const terminal = vscode.window.createTerminal('Puppeteer Connect');
                    terminal.show();
                    
                    // Show instructions for connecting to Chrome
                    vscode.window.showInformationMessage(
                        '🎪 To connect to Chrome: 1) Close all Chrome windows, 2) Launch Chrome with --remote-debugging-port=' + debugPort,
                        'Copy Chrome Command'
                    ).then(selection => {
                        if (selection === 'Copy Chrome Command') {
                            vscode.env.clipboard.writeText(`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=${debugPort}`);
                            vscode.window.showInformationMessage('Chrome launch command copied to clipboard');
                        }
                    });
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to connect Puppeteer: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.puppeteer.launchNew', async () => {
            try {
                const terminal = vscode.window.createTerminal('Puppeteer Launch');
                terminal.show();
                terminal.sendText('npx -y puppeteer-mcp-server');
                vscode.window.showInformationMessage('🎪 Puppeteer MCP: Starting new browser instance...');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to launch Puppeteer: ${error.message}`);
            }
        }),

        // Chrome DevTools MCP Commands
        vscode.commands.registerCommand('testfox.devtools.launch', async () => {
            try {
                const headless = await vscode.window.showQuickPick(
                    ['No (headed)', 'Yes (headless)'],
                    { placeHolder: 'Run in headless mode?' }
                );
                
                const slim = await vscode.window.showQuickPick(
                    ['Full tools', 'Slim (basic only)'],
                    { placeHolder: 'Tool set mode?' }
                );
                
                if (headless && slim) {
                    const args = ['-y', 'chrome-devtools-mcp@latest'];
                    if (headless === 'Yes (headless)') {
                        args.push('--headless');
                    }
                    if (slim === 'Slim (basic only)') {
                        args.push('--slim');
                    }
                    
                    const terminal = vscode.window.createTerminal('Chrome DevTools MCP');
                    terminal.show();
                    terminal.sendText(`npx ${args.join(' ')}`);
                    vscode.window.showInformationMessage(`🔧 Chrome DevTools MCP: Starting (${headless}, ${slim})...`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to launch Chrome DevTools MCP: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('testfox.devtools.connectExisting', async () => {
            try {
                const browserUrl = await vscode.window.showInputBox({
                    prompt: 'Chrome debugging URL (e.g., http://127.0.0.1:9222)',
                    value: 'http://127.0.0.1:9222'
                });
                
                if (browserUrl) {
                    vscode.window.showInformationMessage(
                        `🔧 Chrome DevTools MCP: To connect to existing Chrome, launch Chrome with --remote-debugging-port=9222 first`,
                        'Copy Chrome Command'
                    ).then(selection => {
                        if (selection === 'Copy Chrome Command') {
                            vscode.env.clipboard.writeText(`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir=%TEMP%\\chrome-devtools-profile`);
                            vscode.window.showInformationMessage('Chrome launch command copied to clipboard');
                        }
                    });
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to connect Chrome DevTools MCP: ${error.message}`);
            }
        }),

        // Generate Chrome DevTools Tests Command (for MCP Test Explorer)
        vscode.commands.registerCommand('testfox.mcp.generateChromeDevTools', async () => {
            try {
                vscode.window.showInformationMessage('🔧 TestFox: Generating Chrome DevTools tests via MCP...');
                await mcpOrchestrator.generateTests('devtools');
                vscode.window.showInformationMessage('✅ Chrome DevTools tests generated successfully');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to generate Chrome DevTools tests: ${error.message}`);
            }
        }),

        // Run Chrome DevTools Tests Command (for MCP Test Explorer)
        vscode.commands.registerCommand('testfox.mcp.runChromeDevTools', async () => {
            try {
                vscode.window.showInformationMessage('🔧 TestFox: Running Chrome DevTools tests via MCP...');
                const result = await mcpOrchestrator.runTests('devtools');
                if (result) {
                    vscode.window.showInformationMessage(`✅ Chrome DevTools tests completed: ${result.summary.passed}/${result.summary.total} passed`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Failed to run Chrome DevTools tests: ${error.message}`);
            }
        }),
    ];

    return commands;
}
