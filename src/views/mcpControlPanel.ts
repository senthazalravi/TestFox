/**
 * MCP Control Panel - UI for AI + MCP automation
 * 
 * Provides buttons and interface for one-click test generation
 */

import * as vscode from 'vscode';

export class MCPControlPanel {
    public static currentPanel: MCPControlPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (MCPControlPanel.currentPanel) {
            MCPControlPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'testfoxMCPControl',
            'TestFox MCP Control',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true
            }
        );

        MCPControlPanel.currentPanel = new MCPControlPanel(panel, extensionUri);
    }

    public dispose() {
        MCPControlPanel.currentPanel = undefined;

        // Clean up our resources
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }

        this._panel.dispose();
    }

    private _update() {
        const webview = this._panel.webview;
        webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get paths to resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'mcpControl.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'mcpControl.js')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox MCP Control</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: var(--vscode-foreground);
            font-size: 2.5rem;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header p {
            color: var(--vscode-descriptionForeground);
            font-size: 1.1rem;
            margin: 10px 0 0 0;
        }
        .mcp-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .mcp-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 25px;
            text-align: center;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        .mcp-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
            border-color: var(--vscode-button-background);
        }
        .mcp-icon {
            font-size: 3rem;
            margin-bottom: 15px;
            display: block;
        }
        .mcp-title {
            font-size: 1.3rem;
            font-weight: bold;
            color: var(--vscode-foreground);
            margin-bottom: 10px;
        }
        .mcp-description {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9rem;
            line-height: 1.4;
            margin-bottom: 20px;
        }
        .mcp-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
        }
        .mcp-button:hover {
            background: var(--vscode-button-hoverBackground);
            transform: scale(1.05);
        }
        .mcp-button:active {
            transform: scale(0.95);
        }
        .quick-actions {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .quick-actions h3 {
            color: var(--vscode-foreground);
            margin: 0 0 15px 0;
        }
        .quick-buttons {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .quick-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .quick-button:hover {
            background: var(--vscode-button-background);
        }
        .status {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .status h3 {
            color: var(--vscode-foreground);
            margin: 0 0 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦊 TestFox MCP Control</h1>
            <p>AI + MCP Automation Engine</p>
        </div>

        <div class="mcp-grid">
            <!-- Playwright MCP Card -->
            <div class="mcp-card" onclick="generateMCP('playwright')">
                <div class="mcp-icon">🎭</div>
                <div class="mcp-title">Playwright MCP</div>
                <div class="mcp-description">
                    Generate comprehensive UI tests with Playwright<br>
                    • E2E tests<br>
                    • Accessibility tests<br>
                    • Cross-browser support
                </div>
                <button class="mcp-button">Generate Playwright Tests</button>
            </div>

            <!-- Postman MCP Card -->
            <div class="mcp-card" onclick="generateMCP('postman')">
                <div class="mcp-icon">📮</div>
                <div class="mcp-title">Postman MCP</div>
                <div class="mcp-description">
                    Generate complete API test suites<br>
                    • CRUD operations<br>
                    • Authentication tests<br>
                    • Security testing
                </div>
                <button class="mcp-button">Generate API Tests</button>
            </div>

            <!-- DevTools MCP Card -->
            <div class="mcp-card" onclick="generateMCP('devtools')">
                <div class="mcp-icon">🔧</div>
                <div class="mcp-title">DevTools MCP</div>
                <div class="mcp-description">
                    Performance and monitoring tests<br>
                    • Network analysis<br>
                    • Console monitoring<br>
                    • Performance metrics
                </div>
                <button class="mcp-button">Generate DevTools Tests</button>
            </div>
        </div>

        <div class="quick-actions">
            <h3>Quick Actions</h3>
            <div class="quick-buttons">
                <button class="quick-button" onclick="generateAll()">
                    🚀 Generate All Tests
                </button>
                <button class="quick-button" onclick="quickGenerate()">
                    ⚡ Quick Generate
                </button>
                <button class="quick-button" onclick="openSettings()">
                    ⚙️ Settings
                </button>
            </div>
        </div>

        <div class="status">
            <h3>🤖 AI Agent Status</h3>
            <p id="ai-status">Ready to generate tests. Click any MCP server above to begin.</p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function generateMCP(type) {
            vscode.postMessage({
                command: 'generateMCP',
                type: type
            });
            
            updateStatus(\`Generating \${type.toUpperCase()} tests...\`);
        }
        
        function generateAll() {
            vscode.postMessage({
                command: 'generateAll'
            });
            
            updateStatus('Generating all test types...');
        }
        
        function quickGenerate() {
            vscode.postMessage({
                command: 'quickGenerate'
            });
            
            updateStatus('Opening quick generate menu...');
        }
        
        function openSettings() {
            vscode.postMessage({
                command: 'openSettings'
            });
        }
        
        function updateStatus(message) {
            const statusElement = document.getElementById('ai-status');
            if (statusElement) {
                statusElement.textContent = message;
            }
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'updateStatus':
                    updateStatus(message.text);
                    break;
                case 'generationComplete':
                    updateStatus(\`✅ \${message.type} tests generated successfully!\`);
                    break;
                case 'generationError':
                    updateStatus(\`❌ Error: \${message.error}\`);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
