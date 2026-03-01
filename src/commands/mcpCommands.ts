/**
 * MCP Commands - VS Code command handlers for MCP automation
 * 
 * These commands handle the one-click AI + MCP automation flow
 */

import * as vscode from 'vscode';
import { MCPOrchestrator } from '../mcp/mcpOrchestrator';

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
        })
    ];

    return commands;
}
