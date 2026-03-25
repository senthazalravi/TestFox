import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Git Commit Hook - Automatically triggers tests on git commit
 */
export class GitCommitHook {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private isWatching: boolean = false;
    private lastCommitHash: string | null = null;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Git Hook');
    }

    /**
     * Start watching for git commits
     */
    startWatching(): void {
        if (this.isWatching) {
            return;
        }

        const config = vscode.workspace.getConfiguration('testfox');
        const autoRunOnCommit = config.get<boolean>('autoRunOnCommit', true);

        if (!autoRunOnCommit) {
            console.log('TestFox: Auto-run on commit is disabled');
            return;
        }

        this.isWatching = true;
        this.outputChannel.appendLine('🔍 Watching for git commits...');

        // Check for commits every 5 seconds
        this.checkInterval = setInterval(() => {
            this.checkForNewCommits();
        }, 5000);

        // Also listen to VS Code Git events if available
        this.setupVSCodeGitListener();
    }

    /**
     * Stop watching for git commits
     */
    stopWatching(): void {
        this.isWatching = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.outputChannel.appendLine('🛑 Stopped watching for git commits');
    }

    /**
     * Check if there's a new commit
     */
    private async checkForNewCommits(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const gitHeadPath = path.join(workspacePath, '.git', 'HEAD');

        if (!fs.existsSync(gitHeadPath)) {
            return; // Not a git repository
        }

        try {
            const currentCommit = await this.getCurrentCommit(workspacePath);
            
            if (currentCommit && currentCommit !== this.lastCommitHash) {
                // New commit detected!
                if (this.lastCommitHash !== null) {
                    this.outputChannel.appendLine(`📝 New commit detected: ${currentCommit.substring(0, 7)}`);
                    await this.onNewCommit(currentCommit);
                }
                this.lastCommitHash = currentCommit;
            }
        } catch (error) {
            console.error('TestFox: Error checking for commits:', error);
        }
    }

    /**
     * Get current commit hash
     */
    private async getCurrentCommit(workspacePath: string): Promise<string | null> {
        try {
            // Try VS Code Git API first
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repositories = git.repositories;
                
                if (repositories.length > 0) {
                    const repo = repositories[0];
                    const head = repo.state.HEAD;
                    return head?.commit || null;
                }
            }

            // Fallback: read .git/HEAD
            const headPath = path.join(workspacePath, '.git', 'HEAD');
            if (fs.existsSync(headPath)) {
                const headContent = fs.readFileSync(headPath, 'utf-8').trim();
                if (headContent.startsWith('ref: ')) {
                    const refPath = path.join(workspacePath, '.git', headContent.substring(5));
                    if (fs.existsSync(refPath)) {
                        return fs.readFileSync(refPath, 'utf-8').trim();
                    }
                } else {
                    return headContent;
                }
            }
        } catch (error) {
            console.error('TestFox: Failed to get commit:', error);
        }
        return null;
    }

    /**
     * Setup VS Code Git extension listener
     */
    private setupVSCodeGitListener(): void {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                
                // Listen for repository state changes
                git.onDidChangeState?.(() => {
                    this.checkForNewCommits();
                });

                // Listen for specific repository changes
                git.repositories.forEach((repo: any) => {
                    repo.state.onDidChange?.(() => {
                        this.checkForNewCommits();
                    });
                });
            }
        } catch (error) {
            console.log('TestFox: VS Code Git API not available, using polling fallback');
        }
    }

    /**
     * Handle new commit - trigger background tests
     */
    private async onNewCommit(commitHash: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('testfox');
        const autoRunOnCommit = config.get<boolean>('autoRunOnCommit', true);
        const backgroundTestMode = config.get<string>('backgroundTestMode', 'full');

        if (!autoRunOnCommit) {
            return;
        }

        this.outputChannel.appendLine(`🚀 Triggering background tests for commit ${commitHash.substring(0, 7)}...`);

        // Show notification to user
        const notification = vscode.window.showInformationMessage(
            `🦊 TestFox: New commit detected (${commitHash.substring(0, 7)}). Run tests?`,
            'Run Full Cycle',
            'Quick Test',
            'Skip'
        );

        const selection = await notification;
        
        if (selection === 'Run Full Cycle' || selection === 'Quick Test') {
            const isFullCycle = selection === 'Run Full Cycle';
            
            // Start background test run
            await this.startBackgroundTestRun(commitHash, isFullCycle);
        } else {
            this.outputChannel.appendLine('⏭️ User skipped tests for this commit');
        }
    }

    /**
     * Start background test run
     */
    private async startBackgroundTestRun(commitHash: string, isFullCycle: boolean): Promise<void> {
        try {
            this.outputChannel.appendLine(`▶️ Starting ${isFullCycle ? 'full cycle' : 'quick'} background test run...`);
            this.outputChannel.show(true);

            // Import and run tests
            const { runBackgroundTests } = require('./backgroundTestRunner');
            
            const result = await runBackgroundTests({
                commitHash,
                isFullCycle,
                outputChannel: this.outputChannel,
                onProgress: (progress: any) => {
                    this.updateStatusBar(progress);
                },
                onComplete: (result: any) => {
                    this.onTestRunComplete(result);
                }
            });

            return result;
        } catch (error) {
            this.outputChannel.appendLine(`❌ Background test run failed: ${error}`);
            vscode.window.showErrorMessage(`TestFox: Background tests failed - ${error}`);
        }
    }

    /**
     * Update status bar with progress
     */
    private updateStatusBar(progress: { completed: number; total: number; currentTest?: string }): void {
        const percent = Math.round((progress.completed / progress.total) * 100);
        
        // Update status bar item if available
        try {
            vscode.commands.executeCommand('testfox.updateStatus', {
                status: 'running',
                progress: percent,
                currentTest: progress.currentTest
            });
        } catch (error) {
            // Status update failed, ignore
        }
    }

    /**
     * Handle test run completion
     */
    private async onTestRunComplete(result: any): Promise<void> {
        const { total, passed, failed, skipped, reportPath } = result;
        
        this.outputChannel.appendLine(`\n✅ Test Run Complete!`);
        this.outputChannel.appendLine(`   Total: ${total}`);
        this.outputChannel.appendLine(`   Passed: ${passed}`);
        this.outputChannel.appendLine(`   Failed: ${failed}`);
        this.outputChannel.appendLine(`   Skipped: ${skipped}`);
        
        if (reportPath) {
            this.outputChannel.appendLine(`   Report: ${reportPath}`);
        }

        // Show completion notification
        const passRate = Math.round((passed / total) * 100);
        const icon = failed === 0 ? '✅' : '⚠️';
        
        const notification = vscode.window.showInformationMessage(
            `${icon} TestFox: Background tests complete - ${passRate}% passed (${passed}/${total})`,
            'View Report',
            'Open Dashboard',
            'Dismiss'
        );

        const selection = await notification;
        
        if (selection === 'View Report' && reportPath) {
            const uri = vscode.Uri.file(reportPath);
            await vscode.env.openExternal(uri);
        } else if (selection === 'Open Dashboard') {
            vscode.commands.executeCommand('testfox.openDashboard');
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopWatching();
        this.outputChannel.dispose();
    }
}
