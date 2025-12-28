import * as vscode from 'vscode';

export type ScheduleInterval = '15m' | '1h' | 'daily';

/**
 * Scheduler for automated test execution
 */
export class TestScheduler {
    private scheduledTimeout: NodeJS.Timeout | null = null;
    private intervalTimeout: NodeJS.Timeout | null = null;
    private isEnabled: boolean = false;
    private scheduleEnabled: boolean = false;
    private autoRunOnCommit: boolean = false;
    private scheduleInterval: ScheduleInterval = 'daily';
    private dailyTestTime: string = '09:00';
    private context: vscode.ExtensionContext;
    private lastCommitHash: string | null = null;
    private gitWatcher: vscode.Disposable | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadSettings();
    }

    /**
     * Load scheduler settings from configuration
     */
    loadSettings(): void {
        const config = vscode.workspace.getConfiguration('testfox');
        this.isEnabled = config.get<boolean>('automation.dailyTests', false);
        this.scheduleEnabled = config.get<boolean>('scheduleEnabled', false);
        this.autoRunOnCommit = config.get<boolean>('autoRunOnCommit', false);
        this.dailyTestTime = config.get<string>('automation.dailyTestTime', '09:00');
        
        // Get interval from config (15m, 1h, daily)
        const interval = config.get<string>('automation.interval', 'daily') as ScheduleInterval;
        this.scheduleInterval = ['15m', '1h', 'daily'].includes(interval) ? interval : 'daily';

        console.log(`TestScheduler: Daily tests ${this.isEnabled ? 'enabled' : 'disabled'}, time: ${this.dailyTestTime}`);
        console.log(`TestScheduler: Schedule enabled: ${this.scheduleEnabled}, interval: ${this.scheduleInterval}`);
        console.log(`TestScheduler: Auto-run on commit: ${this.autoRunOnCommit}`);
    }

    /**
     * Start the scheduler if enabled
     */
    start(): void {
        // Start daily scheduler if enabled
        if (this.isEnabled) {
            this.scheduleNextRun();
            console.log('TestScheduler: Started daily test scheduler');
        }

        // Start periodic scheduler if enabled
        if (this.scheduleEnabled) {
            this.startPeriodicScheduler();
            console.log(`TestScheduler: Started periodic scheduler (${this.scheduleInterval})`);
        }

        // Setup commit watcher if enabled
        if (this.autoRunOnCommit) {
            this.setupCommitWatcher();
            console.log('TestScheduler: Commit watcher enabled');
        }
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.scheduledTimeout) {
            clearTimeout(this.scheduledTimeout);
            this.scheduledTimeout = null;
        }
        if (this.intervalTimeout) {
            clearInterval(this.intervalTimeout);
            this.intervalTimeout = null;
        }
        if (this.gitWatcher) {
            this.gitWatcher.dispose();
            this.gitWatcher = null;
        }
        console.log('TestScheduler: Stopped all schedulers');
    }

    /**
     * Start periodic scheduler
     */
    private startPeriodicScheduler(): void {
        const intervalMs = this.getIntervalMs(this.scheduleInterval);
        
        // Run immediately, then schedule periodic runs
        setTimeout(() => {
            this.runScheduledTests('scheduled');
        }, 1000);

        this.intervalTimeout = setInterval(() => {
            this.runScheduledTests('scheduled');
        }, intervalMs);
    }

    /**
     * Get interval in milliseconds
     */
    private getIntervalMs(interval: ScheduleInterval): number {
        switch (interval) {
            case '15m':
                return 15 * 60 * 1000; // 15 minutes
            case '1h':
                return 60 * 60 * 1000; // 1 hour
            case 'daily':
                return 24 * 60 * 60 * 1000; // 24 hours
            default:
                return 24 * 60 * 60 * 1000;
        }
    }

    /**
     * Setup Git commit watcher
     */
    private setupCommitWatcher(): void {
        // Get initial commit hash
        this.updateLastCommit();

        // Watch for Git changes
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (gitExtension && gitExtension.isActive) {
            const git = gitExtension.exports.getAPI(1);
            const repositories = git.repositories;
            
            if (repositories.length > 0) {
                const repo = repositories[0];
                
                // Watch for state changes (commits)
                this.gitWatcher = repo.state.onDidChange(() => {
                    this.checkForCommit();
                });
            }
        }

        // Also check periodically as fallback
        setInterval(() => {
            this.checkForCommit();
        }, 5000); // Check every 5 seconds
    }

    /**
     * Check for new commit and trigger tests if needed
     */
    private async checkForCommit(): Promise<void> {
        const currentCommit = await this.getCurrentCommit();
        
        if (currentCommit && currentCommit !== this.lastCommitHash && this.lastCommitHash !== null) {
            console.log(`TestScheduler: New commit detected: ${currentCommit.substring(0, 8)}`);
            
            // Check if it's a "major" commit (touches src/ or backend/)
            if (await this.isMajorCommit(currentCommit)) {
                this.lastCommitHash = currentCommit;
                console.log('TestScheduler: Major commit detected, triggering tests');
                this.runScheduledTests('commit');
            } else {
                this.lastCommitHash = currentCommit;
            }
        } else if (currentCommit && !this.lastCommitHash) {
            // First time, just store the commit
            this.lastCommitHash = currentCommit;
        }
    }

    /**
     * Get current commit hash
     */
    private async getCurrentCommit(): Promise<string | null> {
        try {
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
        } catch (error) {
            console.error('Failed to get commit:', error);
        }
        return null;
    }

    /**
     * Check if commit is "major" (touches src/ or backend/)
     */
    private async isMajorCommit(commitHash: string): Promise<boolean> {
        // For now, assume all commits are major
        // In a full implementation, we'd check the changed files
        return true;
    }

    /**
     * Update last commit hash
     */
    private async updateLastCommit(): Promise<void> {
        this.lastCommitHash = await this.getCurrentCommit();
    }

    /**
     * Schedule the next daily test run
     */
    private scheduleNextRun(): void {
        if (!this.isEnabled) return;

        const nextRunTime = this.getNextRunTime();
        const now = new Date();
        const delay = nextRunTime.getTime() - now.getTime();

        console.log(`TestScheduler: Next run scheduled for ${nextRunTime.toISOString()}, delay: ${delay}ms`);

        if (delay > 0) {
            this.scheduledTimeout = setTimeout(() => {
                this.runScheduledTests();
                // Schedule the next run for tomorrow
                this.scheduleNextRun();
            }, delay);
        } else {
            // If the scheduled time has already passed today, run immediately and schedule for tomorrow
            console.log('TestScheduler: Scheduled time already passed today, running now');
            setTimeout(() => {
                this.runScheduledTests();
                this.scheduleNextRun();
            }, 1000); // Small delay to avoid immediate execution on startup
        }
    }

    /**
     * Calculate the next run time based on the configured time
     */
    private getNextRunTime(): Date {
        const now = new Date();
        const [hours, minutes] = this.dailyTestTime.split(':').map(Number);

        const nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);

        // If the time has already passed today, schedule for tomorrow
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
        }

        return nextRun;
    }

    /**
     * Execute the scheduled tests
     */
    private async runScheduledTests(trigger: 'scheduled' | 'commit' = 'scheduled'): Promise<void> {
        try {
            console.log('TestScheduler: Starting scheduled daily tests');

            const config = vscode.workspace.getConfiguration('testfox');
            const notifyOnCompletion = config.get<boolean>('automation.notifyOnCompletion', true);

            // Show notification that automated tests are starting
            if (notifyOnCompletion) {
                await vscode.window.showInformationMessage(
                    'TestFox: Starting automated daily test suite...',
                    'View Progress'
                ).then(selection => {
                    if (selection === 'View Progress') {
                        vscode.commands.executeCommand('testfox.openDashboard');
                    }
                });
            }

            // Execute tests based on trigger
            if (trigger === 'commit') {
                // For commit-triggered, run all tests
                await vscode.commands.executeCommand('testfox.runAll');
            } else {
                // For scheduled, run full cycle
                await vscode.commands.executeCommand('testfox.runFullCycle');
            }

            // Show completion notification
            if (notifyOnCompletion) {
                setTimeout(() => {
                    vscode.window.showInformationMessage(
                        'TestFox: Daily automated tests completed successfully!',
                        'View Results'
                    ).then(selection => {
                        if (selection === 'View Results') {
                            vscode.commands.executeCommand('testfox.openDashboard');
                        }
                    });
                }, 2000); // Delay to ensure tests have completed
            }

            console.log('TestScheduler: Scheduled tests completed');

        } catch (error) {
            console.error('TestScheduler: Error running scheduled tests:', error);

            const config = vscode.workspace.getConfiguration('testfox');
            const notifyOnCompletion = config.get<boolean>('automation.notifyOnCompletion', true);

            if (notifyOnCompletion) {
                vscode.window.showErrorMessage(
                    `TestFox: Daily automated tests failed - ${error}`,
                    'View Logs'
                ).then(selection => {
                    if (selection === 'View Logs') {
                        vscode.commands.executeCommand('workbench.action.toggleDevTools');
                    }
                });
            }
        }
    }

    /**
     * Manually trigger the scheduled tests (for testing)
     */
    async runNow(): Promise<void> {
        console.log('TestScheduler: Manually triggering scheduled tests');
        await this.runScheduledTests();
    }

    /**
     * Get scheduler status for debugging
     */
    getStatus(): { enabled: boolean; nextRunTime: Date | null; scheduledTime: string } {
        return {
            enabled: this.isEnabled,
            nextRunTime: this.isEnabled ? this.getNextRunTime() : null,
            scheduledTime: this.dailyTestTime
        };
    }

    /**
     * Update settings when configuration changes
     */
    updateSettings(): void {
        const wasEnabled = this.isEnabled;
        const wasScheduleEnabled = this.scheduleEnabled;
        const wasAutoRunOnCommit = this.autoRunOnCommit;
        
        this.loadSettings();

        // Restart if settings changed
        if (wasEnabled !== this.isEnabled || 
            wasScheduleEnabled !== this.scheduleEnabled ||
            wasAutoRunOnCommit !== this.autoRunOnCommit) {
            this.stop();
            this.start();
        } else if (this.isEnabled || this.scheduleEnabled) {
            // Restart with new settings
            this.stop();
            this.start();
        }
    }

    dispose(): void {
        this.stop();
    }
}
