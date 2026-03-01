/**
 * Unified AI Setup UI
 * 
 * Simple interface for Ollama and BYOAPI configuration
 */

import * as vscode from 'vscode';
import { UnifiedAIProvider, LLMProviderConfig, validateProviderConfig } from '../ai/unifiedAIProvider';

export class UnifiedAISetup {
  private panel?: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'unifiedAiSetup',
      'TestFox AI Setup',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.panel.webview.html = this._getHtmlForWebview(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this._handleMessage(message);
      },
      undefined,
      this._disposables
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this._disposables
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TestFox AI Setup</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                max-width: 600px;
                margin: 0 auto;
            }
            .container {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .provider-selection {
                display: flex;
                gap: 20px;
                margin-bottom: 20px;
            }
            .provider-option {
                flex: 1;
                padding: 15px;
                border: 2px solid var(--vscode-button-border);
                border-radius: 5px;
                cursor: pointer;
                text-align: center;
                transition: all 0.2s;
            }
            .provider-option:hover {
                border-color: var(--vscode-button-hoverBackground);
                background-color: var(--vscode-button-hoverBackground);
            }
            .provider-option.selected {
                border-color: var(--vscode-focusBorder);
                background-color: var(--vscode-button-background);
            }
            .form-section {
                display: none;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
                padding: 20px;
                background-color: var(--vscode-editor-background);
            }
            .form-section.active {
                display: block;
            }
            .form-group {
                margin-bottom: 15px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: var(--vscode-foreground);
            }
            input, textarea, select {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
            }
            textarea {
                min-height: 100px;
                resize: vertical;
            }
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 14px;
                margin-right: 10px;
            }
            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .button:disabled {
                background-color: var(--vscode-button-secondaryBackground);
                cursor: not-allowed;
            }
            .test-result {
                margin-top: 15px;
                padding: 10px;
                border-radius: 3px;
                display: none;
            }
            .test-result.success {
                background-color: rgba(0, 255, 0, 0.1);
                border: 1px solid rgba(0, 255, 0, 0.3);
            }
            .test-result.error {
                background-color: rgba(255, 0, 0, 0.1);
                border: 1px solid rgba(255, 0, 0, 0.3);
            }
            .loading {
                display: inline-block;
                margin-left: 10px;
            }
            .help-text {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🦊 TestFox AI Setup</h1>
            <p>Configure your AI provider in just a few steps. Choose between local Ollama or any custom API endpoint.</p>

            <div class="provider-selection">
                <div class="provider-option" id="ollama-option" onclick="selectProvider('ollama')">
                    <h3>🦙 Ollama (Local)</h3>
                    <p>Run models locally on your machine</p>
                </div>
                <div class="provider-option" id="custom-option" onclick="selectProvider('custom')">
                    <h3>🔗 Bring Your Own API</h3>
                    <p>Use any OpenAI-compatible API</p>
                </div>
            </div>

            <!-- Ollama Configuration -->
            <div class="form-section" id="ollama-form">
                <h3>🦙 Ollama Configuration</h3>
                
                <div class="form-group">
                    <label for="ollama-model">Model Name</label>
                    <input type="text" id="ollama-model" placeholder="llama3.1:8b" value="llama3.1:8b">
                    <div class="help-text">Available models: llama3.1, mistral, qwen2.5, codellama, etc.</div>
                </div>

                <div class="form-group">
                    <label for="ollama-host">Host URL</label>
                    <input type="text" id="ollama-host" placeholder="http://localhost:11434" value="http://localhost:11434">
                    <div class="help-text">Default: http://localhost:11434 (local Ollama server)</div>
                </div>

                <button class="button" onclick="testOllamaConnection()">Test Connection</button>
                <button class="button" onclick="saveOllamaConfig()">Save Configuration</button>
            </div>

            <!-- Custom API Configuration -->
            <div class="form-section" id="custom-form">
                <h3>🔗 Custom API Configuration</h3>
                
                <div class="form-group">
                    <label for="custom-model">Model Name</label>
                    <input type="text" id="custom-model" placeholder="google/gemini-2.0-flash-exp:free">
                    <div class="help-text">Example: google/gemini-2.0-flash-exp:free, gpt-4o, claude-3.5-sonnet</div>
                </div>

                <div class="form-group">
                    <label for="custom-url">Base URL</label>
                    <input type="text" id="custom-url" placeholder="https://api.openai.com/v1/chat/completions">
                    <div class="help-text">Full endpoint URL for chat completions</div>
                </div>

                <div class="form-group">
                    <label for="custom-key">API Key</label>
                    <input type="password" id="custom-key" placeholder="your-api-key-here">
                    <div class="help-text">Your API key for the service</div>
                </div>

                <div class="form-group">
                    <label for="custom-payload">Payload Template (Optional)</label>
                    <textarea id="custom-payload" placeholder='{"max_tokens": 16384, "temperature": 0.7}'>
                    <div class="help-text">JSON object with additional parameters. Leave empty for defaults.</div>
                </div>

                <button class="button" onclick="testCustomConnection()">Test Connection</button>
                <button class="button" onclick="saveCustomConfig()">Save Configuration</button>
            </div>

            <!-- Test Results -->
            <div class="test-result" id="test-result"></div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            let selectedProvider = null;

            function selectProvider(provider) {
                selectedProvider = provider;
                
                // Update UI
                document.querySelectorAll('.provider-option').forEach(el => el.classList.remove('selected'));
                document.querySelectorAll('.form-section').forEach(el => el.classList.remove('active'));
                
                document.getElementById(provider + '-option').classList.add('selected');
                document.getElementById(provider + '-form').classList.add('active');
            }

            async function testOllamaConnection() {
                const model = document.getElementById('ollama-model').value;
                const host = document.getElementById('ollama-host').value;
                
                if (!model || !host) {
                    showResult('Please fill in all fields', 'error');
                    return;
                }

                showLoading(true);
                
                try {
                    const result = await vscode.postMessage({
                        command: 'testOllamaConnection',
                        data: { model, host }
                    });
                } catch (error) {
                    showResult('Connection test failed: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                }
            }

            async function testCustomConnection() {
                const model = document.getElementById('custom-model').value;
                const url = document.getElementById('custom-url').value;
                const key = document.getElementById('custom-key').value;
                let payloadTemplate = null;
                
                const payloadText = document.getElementById('custom-payload').value.trim();
                if (payloadText) {
                    try {
                        payloadTemplate = JSON.parse(payloadText);
                    } catch (e) {
                        showResult('Invalid JSON in payload template', 'error');
                        return;
                    }
                }
                
                if (!model || !url || !key) {
                    showResult('Please fill in model, URL, and API key', 'error');
                    return;
                }

                showLoading(true);
                
                try {
                    const result = await vscode.postMessage({
                        command: 'testCustomConnection',
                        data: { model, url, key, payloadTemplate }
                    });
                } catch (error) {
                    showResult('Connection test failed: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                }
            }

            function saveOllamaConfig() {
                const model = document.getElementById('ollama-model').value;
                const host = document.getElementById('ollama-host').value;
                
                if (!model || !host) {
                    showResult('Please fill in all fields', 'error');
                    return;
                }

                vscode.postMessage({
                    command: 'saveOllamaConfig',
                    data: { model, host }
                });
            }

            function saveCustomConfig() {
                const model = document.getElementById('custom-model').value;
                const url = document.getElementById('custom-url').value;
                const key = document.getElementById('custom-key').value;
                let payloadTemplate = null;
                
                const payloadText = document.getElementById('custom-payload').value.trim();
                if (payloadText) {
                    try {
                        payloadTemplate = JSON.parse(payloadText);
                    } catch (e) {
                        showResult('Invalid JSON in payload template', 'error');
                        return;
                    }
                }
                
                if (!model || !url || !key) {
                    showResult('Please fill in model, URL, and API key', 'error');
                    return;
                }

                vscode.postMessage({
                    command: 'saveCustomConfig',
                    data: { model, url, key, payloadTemplate }
                });
            }

            function showResult(message, type) {
                const resultDiv = document.getElementById('test-result');
                resultDiv.textContent = message;
                resultDiv.className = 'test-result ' + type;
                resultDiv.style.display = 'block';
            }

            function showLoading(show) {
                const buttons = document.querySelectorAll('.button');
                buttons.forEach(btn => {
                    if (show) {
                        btn.disabled = true;
                        btn.innerHTML += '<span class="loading">⏳</span>';
                    } else {
                        btn.disabled = false;
                        btn.innerHTML = btn.innerHTML.replace('<span class="loading">⏳</span>', '');
                    }
                });
            }

            // Initialize with first provider
            selectProvider('ollama');

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'testResult':
                        showResult(message.data.message, message.data.success ? 'success' : 'error');
                        showLoading(false);
                        break;
                }
            });
        </script>
    </body>
    </html>`;
  }

  private async _handleMessage(message: any) {
    switch (message.command) {
      case 'testOllamaConnection':
        await this._testOllamaConnection(message.data);
        break;

      case 'testCustomConnection':
        await this._testCustomConnection(message.data);
        break;

      case 'saveOllamaConfig':
        await this._saveOllamaConfig(message.data);
        break;

      case 'saveCustomConfig':
        await this._saveCustomConfig(message.data);
        break;
    }
  }

  private async _testOllamaConnection(data: { model: string; host: string }) {
    try {
      const config: LLMProviderConfig = {
        providerType: 'ollama',
        model: data.model,
        baseUrl: data.host
      };

      const provider = new UnifiedAIProvider(config);
      const result = await provider.testConnection();

      this._sendTestResult(result);
    } catch (error) {
      this._sendTestResult({
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async _testCustomConnection(data: { 
    model: string; 
    url: string; 
    key: string; 
    payloadTemplate?: object 
  }) {
    try {
      const config: LLMProviderConfig = {
        providerType: 'custom',
        model: data.model,
        baseUrl: data.url,
        apiKey: data.key,
        payloadTemplate: data.payloadTemplate
      };

      const provider = new UnifiedAIProvider(config);
      const result = await provider.testConnection();

      this._sendTestResult(result);
    } catch (error) {
      this._sendTestResult({
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async _saveOllamaConfig(data: { model: string; host: string }) {
    try {
      const config: LLMProviderConfig = {
        providerType: 'ollama',
        model: data.model,
        baseUrl: data.host
      };

      const errors = validateProviderConfig(config);
      if (errors.length > 0) {
        this._sendTestResult({
          success: false,
          message: 'Configuration errors: ' + errors.join(', ')
        });
        return;
      }

      // Save to VS Code settings
      const vscodeConfig = vscode.workspace.getConfiguration('testfox');
      await vscodeConfig.update('ai.provider', 'ollama', vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.model', data.model, vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.baseUrl', data.host, vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.apiKey', '', vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        '✅ Ollama configuration saved successfully!',
        'OK'
      );

      // Test if model exists, offer to pull if needed
      const provider = new UnifiedAIProvider(config);
      const modelExists = await provider.ensureModel();
      if (!modelExists) {
        vscode.window.showWarningMessage(
          `Model "${data.model}" not found locally. Please pull it manually with: ollama pull ${data.model}`,
          'OK'
        );
      }

    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async _saveCustomConfig(data: { 
    model: string; 
    url: string; 
    key: string; 
    payloadTemplate?: object 
  }) {
    try {
      const config: LLMProviderConfig = {
        providerType: 'custom',
        model: data.model,
        baseUrl: data.url,
        apiKey: data.key,
        payloadTemplate: data.payloadTemplate
      };

      const errors = validateProviderConfig(config);
      if (errors.length > 0) {
        this._sendTestResult({
          success: false,
          message: 'Configuration errors: ' + errors.join(', ')
        });
        return;
      }

      // Save to VS Code settings
      const vscodeConfig = vscode.workspace.getConfiguration('testfox');
      await vscodeConfig.update('ai.provider', 'custom', vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.model', data.model, vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.baseUrl', data.url, vscode.ConfigurationTarget.Global);
      await vscodeConfig.update('ai.apiKey', data.key, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        '✅ Custom API configuration saved successfully!',
        'OK'
      );

    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private _sendTestResult(result: any) {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: 'testResult',
        data: result
      });
    }
  }

  public dispose() {
    this._disposables.forEach(d => d.dispose());
  }
}
