import * as vscode from 'vscode';

/**
 * Scheduler for automated test execution
 */
export class TestScheduler {
    private scheduledTimeout: NodeJS.Timeout | null = null;
    private isEnabled: boolean = false;
    private dailyTestTime: string = '09:00';
    private context: vscode.ExtensionContext;

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
        this.dailyTestTime = config.get<string>('automation.dailyTestTime', '09:00');

        console.log(`TestScheduler: Daily tests ${this.isEnabled ? 'enabled' : 'disabled'}, time: ${this.dailyTestTime}`);
    }

    /**
     * Start the scheduler if enabled
     */
    start(): void {
        if (!this.isEnabled) {
            console.log('TestScheduler: Daily tests disabled, skipping scheduler start');
            return;
        }

        this.scheduleNextRun();
        console.log('TestScheduler: Started daily test scheduler');
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.scheduledTimeout) {
            clearTimeout(this.scheduledTimeout);
            this.scheduledTimeout = null;
            console.log('TestScheduler: Stopped scheduler');
        }
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
    private async runScheduledTests(): Promise<void> {
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

            // Execute full cycle tests
            await vscode.commands.executeCommand('testfox.runFullCycle');

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
        this.loadSettings();

        if (wasEnabled !== this.isEnabled) {
            if (this.isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        } else if (this.isEnabled) {
            // Restart with new time
            this.stop();
            this.start();
        }
    }

    dispose(): void {
        this.stop();
    }
}
