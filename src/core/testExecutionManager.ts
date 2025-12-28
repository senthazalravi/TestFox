import * as vscode from 'vscode';
import { TestCase, TestResult } from '../types';
import { TestControlCenterProvider, TestRunState, LogEntry } from '../views/testControlCenter';

/**
 * Manages test execution state and integrates with Test Control Center
 */
export class TestExecutionManager {
    private _isPaused = false;
    private _isStopped = false;
    private _currentRun: {
        tests: TestCase[];
        completed: number;
        passed: number;
        failed: number;
        skipped: number;
        startTime: number;
    } | null = null;

    constructor(private controlCenter: TestControlCenterProvider) {}

    /**
     * Start a new test run
     */
    startRun(tests: TestCase[], trigger?: string): void {
        this._isPaused = false;
        this._isStopped = false;
        this._currentRun = {
            tests,
            completed: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            startTime: Date.now()
        };

        this.controlCenter.updateState({
            status: 'running',
            elapsed: 0,
            progress: 0,
            currentTest: null,
            logs: [],
            summary: { total: tests.length, passed: 0, failed: 0, skipped: 0 },
            trigger
        });

        this.addLog('info', `Starting test run with ${tests.length} tests`);
    }

    /**
     * Check if execution should pause
     */
    async checkPause(): Promise<void> {
        while (this._isPaused && !this._isStopped) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    /**
     * Check if execution should stop
     */
    isStopped(): boolean {
        return this._isStopped;
    }

    /**
     * Pause execution
     */
    pause(): void {
        if (this._currentRun) {
            this._isPaused = true;
            this.controlCenter.updateState({ status: 'paused' });
            this.addLog('warning', 'Test execution paused');
        }
    }

    /**
     * Resume execution
     */
    resume(): void {
        if (this._currentRun) {
            this._isPaused = false;
            this.controlCenter.updateState({ status: 'running' });
            this.addLog('info', 'Test execution resumed');
        }
    }

    /**
     * Stop execution
     */
    stop(): void {
        if (this._currentRun) {
            this._isStopped = true;
            this._isPaused = false;
            this.controlCenter.updateState({ status: 'stopped' });
            this.addLog('warning', 'Test execution stopped by user');
        }
    }

    /**
     * Update progress for current test
     */
    updateTestProgress(test: TestCase, result: Partial<TestResult>): void {
        if (!this._currentRun) return;

        this._currentRun.completed++;
        
        if (result.status === 'passed') {
            this._currentRun.passed++;
            this.addLog('success', `✔ ${test.name}`);
        } else if (result.status === 'failed') {
            this._currentRun.failed++;
            this.addLog('error', `✖ ${test.name}: ${result.error || 'Failed'}`);
        } else {
            this._currentRun.skipped++;
            this.addLog('warning', `⚠ ${test.name}: Skipped`);
        }

        const progress = Math.round((this._currentRun.completed / this._currentRun.tests.length) * 100);
        const elapsed = Math.floor((Date.now() - this._currentRun.startTime) / 1000);

        this.controlCenter.updateState({
            progress,
            elapsed,
            currentTest: test.name,
            summary: {
                total: this._currentRun.tests.length,
                passed: this._currentRun.passed,
                failed: this._currentRun.failed,
                skipped: this._currentRun.skipped
            }
        });
    }

    /**
     * Complete the test run
     */
    completeRun(): void {
        if (!this._currentRun) return;

        this.controlCenter.updateState({
            status: 'completed',
            progress: 100,
            currentTest: null
        });

        const summary = this._currentRun;
        this.addLog('info', 
            `Test run completed: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`
        );

        this._currentRun = null;
        this._isPaused = false;
        this._isStopped = false;
    }

    /**
     * Add a log entry
     */
    addLog(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
        this.controlCenter.addLog({
            type,
            message,
            timestamp: new Date()
        });
    }

    /**
     * Get current run statistics
     */
    getStats() {
        return this._currentRun ? {
            completed: this._currentRun.completed,
            total: this._currentRun.tests.length,
            passed: this._currentRun.passed,
            failed: this._currentRun.failed,
            skipped: this._currentRun.skipped
        } : null;
    }
}

