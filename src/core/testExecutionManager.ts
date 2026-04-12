import * as vscode from 'vscode';
import { TestCase, TestResult } from '../types';

/**
 * Manages test execution state (pause/resume/stop)
 * Decoupled from UI - works independently of any view provider
 */
export class TestExecutionManager {
    private _isPaused = false;
    private _isStopped = false;
    private _outputChannel: vscode.OutputChannel;
    private _currentRun: {
        tests: TestCase[];
        completed: number;
        passed: number;
        failed: number;
        skipped: number;
        startTime: number;
    } | null = null;

    constructor(_unused?: any) {
        this._outputChannel = vscode.window.createOutputChannel('TestFox Execution');
    }

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

        this.addLog('info', `Starting test run with ${tests.length} tests${trigger ? ` (${trigger})` : ''}`);
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
            this.addLog('warning', 'Test execution paused');
        }
    }

    /**
     * Resume execution
     */
    resume(): void {
        if (this._currentRun) {
            this._isPaused = false;
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
            this.addLog('success', `PASS ${test.name}`);
        } else if (result.status === 'failed') {
            this._currentRun.failed++;
            this.addLog('error', `FAIL ${test.name}: ${result.error || 'Failed'}`);
        } else {
            this._currentRun.skipped++;
            this.addLog('warning', `SKIP ${test.name}`);
        }
    }

    /**
     * Complete the test run
     */
    completeRun(): void {
        if (!this._currentRun) return;

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
        const timestamp = new Date().toISOString().slice(11, 19);
        const prefix = type === 'error' ? 'ERR' : type === 'warning' ? 'WRN' : type === 'success' ? 'OK ' : 'INF';
        this._outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
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
