/**
 * AI Connection Manager
 * 
 * Handles AI connection logic with proper user experience:
 * - No connection attempts before AI is configured
 * - Silent background checks after configuration
 * - Success notifications when AI is ready
 * - Graceful handling of missing AI configuration
 */

import * as vscode from 'vscode';
import { UnifiedAIProvider, LLMProviderConfig, validateProviderConfig } from '../ai/unifiedAIProvider';

export interface AIConnectionStatus {
    isConfigured: boolean;
    isConnected: boolean;
    provider?: string;
    model?: string;
    lastChecked?: Date;
    error?: string;
}

export class AIConnectionManager {
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private connectionStatus: AIConnectionStatus = {
        isConfigured: false,
        isConnected: false
    };
    private checkInterval?: NodeJS.Timeout;
    private isChecking: boolean = false;

    constructor(outputChannel: vscode.OutputChannel, statusBarItem: vscode.StatusBarItem) {
        this.outputChannel = outputChannel;
        this.statusBarItem = statusBarItem;
        this.updateStatusBar();
    }

    /**
     * Initialize AI connection management
     */
    async initialize(): Promise<void> {
        console.log('🦊 TestFox: Initializing AI Connection Manager');
        
        // Check if AI is configured
        await this.checkAIConfiguration();
        
        // If configured, do a silent connection test
        if (this.connectionStatus.isConfigured) {
            await this.silentConnectionTest();
        }
        
        // Set up periodic checks (every 5 minutes)
        this.startPeriodicChecks();
    }

    /**
     * Check if AI is properly configured
     */
    async checkAIConfiguration(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('testfox');
        const provider = config.get<string>('ai.provider');
        const model = config.get<string>('ai.model');
        const baseUrl = config.get<string>('ai.baseUrl');
        const apiKey = config.get<string>('ai.apiKey');

        // Check if essential configuration exists
        if (!provider || !model) {
            this.connectionStatus.isConfigured = false;
            this.connectionStatus.isConnected = false;
            this.updateStatusBar();
            return false;
        }

        // For custom providers, check API key
        if (provider === 'custom' && !apiKey) {
            this.connectionStatus.isConfigured = false;
            this.connectionStatus.isConnected = false;
            this.updateStatusBar();
            return false;
        }

        // Validate configuration
        const providerConfig: LLMProviderConfig = {
            providerType: provider as 'ollama' | 'custom',
            model,
            baseUrl: baseUrl || 'http://localhost:11434',
            apiKey: apiKey || undefined
        };

        const errors = validateProviderConfig(providerConfig);
        if (errors.length > 0) {
            this.outputChannel?.appendLine(`❌ AI configuration validation failed: ${errors.join(', ')}`);
            this.connectionStatus.isConfigured = false;
            this.connectionStatus.isConnected = false;
            this.updateStatusBar();
            return false;
        }

        this.connectionStatus.isConfigured = true;
        this.connectionStatus.provider = provider;
        this.connectionStatus.model = model;
        this.updateStatusBar();
        
        console.log('✅ AI configuration is valid');
        return true;
    }

    /**
     * Perform silent connection test
     */
    async silentConnectionTest(): Promise<boolean> {
        if (this.isChecking || !this.connectionStatus.isConfigured) {
            return this.connectionStatus.isConnected;
        }

        this.isChecking = true;
        
        try {
            const config = vscode.workspace.getConfiguration('testfox');
            const provider = config.get<string>('ai.provider');
            const model = config.get<string>('ai.model');
            const baseUrl = config.get<string>('ai.baseUrl');
            const apiKey = config.get<string>('ai.apiKey');

            const providerConfig: LLMProviderConfig = {
                providerType: provider as 'ollama' | 'custom',
                model: model!,
                baseUrl: baseUrl || 'http://localhost:11434',
                apiKey: apiKey || undefined
            };

            const aiProvider = new UnifiedAIProvider(providerConfig);
            const result = await aiProvider.testConnection();

            this.connectionStatus.isConnected = result.success;
            this.connectionStatus.lastChecked = new Date();
            this.connectionStatus.error = result.success ? undefined : result.message;

            if (result.success) {
                console.log('✅ AI connection test successful');
                this.outputChannel?.appendLine(`✅ AI connection successful (${provider} - ${model})`);
                
                // Show success notification if this is the first successful connection
                if (!this.connectionStatus.lastChecked || this.connectionStatus.lastChecked.getTime() < Date.now() - 60000) {
                    vscode.window.showInformationMessage(
                        `🦊 TestFox: AI connected and ready! Using ${provider} - ${model}`,
                        'View Tests'
                    ).then(selection => {
                        if (selection === 'View Tests') {
                            vscode.commands.executeCommand('testfox.refreshTests');
                        }
                    });
                }
            } else {
                console.log(`❌ AI connection test failed: ${result.message}`);
                this.outputChannel?.appendLine(`❌ AI connection failed: ${result.message}`);
            }

            this.updateStatusBar();
            return result.success;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.log(`❌ AI connection test error: ${errorMessage}`);
            this.outputChannel?.appendLine(`❌ AI connection error: ${errorMessage}`);
            
            this.connectionStatus.isConnected = false;
            this.connectionStatus.error = errorMessage;
            this.updateStatusBar();
            
            return false;
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Manual connection test (user-initiated)
     */
    async testConnection(): Promise<boolean> {
        if (!this.connectionStatus.isConfigured) {
            vscode.window.showWarningMessage(
                'AI is not configured. Please configure AI first.',
                'Configure AI'
            ).then(selection => {
                if (selection === 'Configure AI') {
                    vscode.commands.executeCommand('testfox.configureAI');
                }
            });
            return false;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing AI connection...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Connecting to AI provider...' });
            
            const success = await this.silentConnectionTest();
            
            if (success) {
                vscode.window.showInformationMessage(
                    '✅ AI connection successful! Ready for testing and analysis.',
                    'OK'
                );
            } else {
                vscode.window.showErrorMessage(
                    `❌ AI connection failed: ${this.connectionStatus.error || 'Unknown error'}`,
                    'Configure AI',
                    'View Diagnostics'
                ).then(selection => {
                    if (selection === 'Configure AI') {
                        vscode.commands.executeCommand('testfox.configureAI');
                    } else if (selection === 'View Diagnostics') {
                        this.outputChannel.show(true);
                    }
                });
            }
        });

        return this.connectionStatus.isConnected;
    }

    /**
     * Start periodic connection checks
     */
    private startPeriodicChecks(): void {
        // Check every 5 minutes
        this.checkInterval = setInterval(async () => {
            try {
                if (this.connectionStatus.isConfigured) {
                    await this.silentConnectionTest();
                }
            } catch (err) {
                console.error('AIConnectionManager: Periodic check failed:', err);
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Stop periodic checks
     */
    stopPeriodicChecks(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }
    }

    /**
     * Update status bar
     */
    private updateStatusBar(): void {
        if (!this.connectionStatus.isConfigured) {
            this.statusBarItem.text = '$(plug) AI: Not Configured';
            this.statusBarItem.tooltip = 'AI is not configured. Click to set up AI.';
            this.statusBarItem.command = 'testfox.configureAI';
            this.statusBarItem.color = new vscode.ThemeColor('descriptionForeground');
        } else if (this.connectionStatus.isConnected) {
            this.statusBarItem.text = `$(check) AI: ${this.connectionStatus.provider}`;
            this.statusBarItem.tooltip = `AI connected (${this.connectionStatus.provider} - ${this.connectionStatus.model})`;
            this.statusBarItem.command = 'testfox.testAIConnection';
            this.statusBarItem.color = undefined;
        } else {
            this.statusBarItem.text = '$(x) AI: Disconnected';
            this.statusBarItem.tooltip = `AI connection failed: ${this.connectionStatus.error || 'Unknown error'}. Click to test connection.`;
            this.statusBarItem.command = 'testfox.testAIConnection';
            this.statusBarItem.color = new vscode.ThemeColor('errorForeground');
        }
    }

    /**
     * Get current connection status
     */
    getConnectionStatus(): AIConnectionStatus {
        return { ...this.connectionStatus };
    }

    /**
     * Force recheck of AI configuration
     */
    async recheckConfiguration(): Promise<void> {
        await this.checkAIConfiguration();
        if (this.connectionStatus.isConfigured) {
            await this.silentConnectionTest();
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopPeriodicChecks();
    }
}
