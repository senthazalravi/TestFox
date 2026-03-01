import * as vscode from 'vscode';
import { ManualTestEntry } from '../types';

/**
 * Tracks and persists manual test results
 */
export class ManualTestTracker {
    private readonly STORAGE_KEY = 'testfox.manualTests';
    private entries: Map<string, ManualTestEntry> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        this.loadEntries();
    }

    private loadEntries(): void {
        const stored = this.context.workspaceState.get<[string, ManualTestEntry][]>(this.STORAGE_KEY);
        if (stored) {
            this.entries = new Map(stored);
        }
    }

    private saveEntries(): void {
        this.context.workspaceState.update(this.STORAGE_KEY, Array.from(this.entries.entries()));
    }

    async markTest(
        testId: string, 
        status: 'pass' | 'fail' | 'skip', 
        notes?: string
    ): Promise<void> {
        const entry: ManualTestEntry = {
            testId,
            status,
            notes,
            timestamp: new Date(),
            tester: this.getCurrentUser()
        };

        this.entries.set(testId, entry);
        this.saveEntries();
    }

    getEntry(testId: string): ManualTestEntry | undefined {
        return this.entries.get(testId);
    }

    getAllEntries(): ManualTestEntry[] {
        return Array.from(this.entries.values());
    }

    getEntriesByStatus(status: 'pass' | 'fail' | 'skip'): ManualTestEntry[] {
        return Array.from(this.entries.values()).filter(e => e.status === status);
    }

    clearEntries(): void {
        this.entries.clear();
        this.saveEntries();
    }

    removeEntry(testId: string): void {
        this.entries.delete(testId);
        this.saveEntries();
    }

    private getCurrentUser(): string {
        // Try to get git user
        try {
            const gitConfig = vscode.workspace.getConfiguration('git');
            return gitConfig.get<string>('defaultCloneDirectory') || 'Unknown';
        } catch {
            return 'Unknown';
        }
    }

    /**
     * Export manual test data for reporting
     */
    exportData(): {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        entries: ManualTestEntry[];
    } {
        const entries = this.getAllEntries();
        return {
            total: entries.length,
            passed: entries.filter(e => e.status === 'pass').length,
            failed: entries.filter(e => e.status === 'fail').length,
            skipped: entries.filter(e => e.status === 'skip').length,
            entries
        };
    }

    /**
     * Import manual test data from a previous session
     */
    importData(data: ManualTestEntry[]): void {
        for (const entry of data) {
            this.entries.set(entry.testId, entry);
        }
        this.saveEntries();
    }
}

