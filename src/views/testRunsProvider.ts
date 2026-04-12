/**
 * Test Runs Provider - Fire-and-forget tracking
 *
 * Shows historical test runs in a tree view.
 * Each run can be clicked to view its detailed report.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TestRunSummary {
    id: string;
    timestamp: string;
    trigger: 'manual' | 'scheduled' | 'mcp' | 'fire-and-forget';
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    duration?: number;
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    categories?: string[];
    mcpType?: string;
    commit?: string;
}

export class TestRunsProvider implements vscode.TreeDataProvider<TestRunItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TestRunItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _runs: TestRunSummary[] = [];
    private _workspacePath: string;
    private _activeRuns = new Map<string, TestRunSummary>();

    constructor(workspacePath: string) {
        this._workspacePath = workspacePath;
        this._loadRuns();
    }

    refresh(): void {
        this._loadRuns();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TestRunItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TestRunItem): TestRunItem[] {
        if (element) {
            return [];
        }

        // Active runs first, then completed runs sorted by timestamp
        const activeItems = Array.from(this._activeRuns.values()).map(run =>
            this._createRunItem(run)
        );

        const completedItems = this._runs
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 20) // Show last 20 runs
            .map(run => this._createRunItem(run));

        return [...activeItems, ...completedItems];
    }

    /**
     * Start tracking a new run (fire-and-forget)
     */
    startRun(id: string, trigger: TestRunSummary['trigger'], categories?: string[], mcpType?: string): TestRunSummary {
        const run: TestRunSummary = {
            id,
            timestamp: new Date().toISOString(),
            trigger,
            status: 'running',
            summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
            categories,
            mcpType
        };
        this._activeRuns.set(id, run);
        this._onDidChangeTreeData.fire();
        return run;
    }

    /**
     * Update progress of a running test
     */
    updateRun(id: string, update: Partial<TestRunSummary>): void {
        const run = this._activeRuns.get(id);
        if (run) {
            Object.assign(run, update);
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * Complete a run and move it to history
     */
    completeRun(id: string, summary: TestRunSummary['summary'], duration: number, status: 'completed' | 'failed' = 'completed'): void {
        const run = this._activeRuns.get(id);
        if (run) {
            run.status = status;
            run.summary = summary;
            run.duration = duration;
            this._activeRuns.delete(id);
            this._runs.unshift(run);
            this._saveRun(run);
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * Get a specific run by ID
     */
    getRun(id: string): TestRunSummary | undefined {
        return this._activeRuns.get(id) || this._runs.find(r => r.id === id);
    }

    private _createRunItem(run: TestRunSummary): TestRunItem {
        const isRunning = run.status === 'running';
        const date = new Date(run.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = this._isToday(date) ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

        let label: string;
        let description: string;
        let icon: vscode.ThemeIcon;

        if (isRunning) {
            label = `Running...`;
            description = run.mcpType ? `MCP: ${run.mcpType}` : (run.categories?.join(', ') || 'All tests');
            icon = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('testing.runAction'));
        } else {
            const passRate = run.summary.total > 0
                ? Math.round((run.summary.passed / run.summary.total) * 100)
                : 0;
            label = `${dateStr} ${timeStr}`;
            description = `${run.summary.passed}/${run.summary.total} passed (${passRate}%)`;

            if (run.summary.failed > 0) {
                icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            } else if (run.summary.total === 0) {
                icon = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconUnset'));
            } else {
                icon = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            }
        }

        const item = new TestRunItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = description;
        item.iconPath = icon;
        item.runId = run.id;

        if (!isRunning) {
            const durationStr = run.duration ? this._formatDuration(run.duration) : '';
            const triggerStr = run.trigger === 'mcp' ? `MCP ${run.mcpType || ''}` : run.trigger;
            const tooltip = new vscode.MarkdownString();
            tooltip.appendMarkdown(`### Test Run\n\n`);
            tooltip.appendMarkdown(`- **Time:** ${date.toLocaleString()}\n`);
            tooltip.appendMarkdown(`- **Trigger:** ${triggerStr}\n`);
            tooltip.appendMarkdown(`- **Duration:** ${durationStr}\n`);
            tooltip.appendMarkdown(`- **Total:** ${run.summary.total}\n`);
            tooltip.appendMarkdown(`- **Passed:** ${run.summary.passed}\n`);
            tooltip.appendMarkdown(`- **Failed:** ${run.summary.failed}\n`);
            tooltip.appendMarkdown(`- **Skipped:** ${run.summary.skipped}\n`);
            if (run.categories?.length) {
                tooltip.appendMarkdown(`- **Categories:** ${run.categories.join(', ')}\n`);
            }
            item.tooltip = tooltip;

            item.command = {
                command: 'testfox.viewRunReport',
                title: 'View Report',
                arguments: [run.id]
            };
        }

        return item;
    }

    private _loadRuns(): void {
        try {
            const runsDir = path.join(this._workspacePath, '.testfox', 'runs');
            if (!fs.existsSync(runsDir)) {
                this._runs = [];
                return;
            }

            const files = fs.readdirSync(runsDir)
                .filter(f => f.endsWith('.json'))
                .sort()
                .reverse()
                .slice(0, 50);

            this._runs = files.map(f => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8'));
                    return {
                        id: data.id || f.replace('.json', ''),
                        timestamp: data.timestamp || data.date || new Date().toISOString(),
                        trigger: data.trigger || 'manual',
                        status: 'completed' as const,
                        duration: data.duration,
                        summary: data.summary || { total: 0, passed: 0, failed: 0, skipped: 0 },
                        categories: data.categories,
                        mcpType: data.mcpType,
                        commit: data.commit
                    };
                } catch {
                    return null;
                }
            }).filter((r): r is TestRunSummary => r !== null);
        } catch {
            this._runs = [];
        }
    }

    private _saveRun(run: TestRunSummary): void {
        try {
            const runsDir = path.join(this._workspacePath, '.testfox', 'runs');
            if (!fs.existsSync(runsDir)) {
                fs.mkdirSync(runsDir, { recursive: true });
            }
            const filename = `${run.timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}.json`;
            fs.writeFileSync(
                path.join(runsDir, filename),
                JSON.stringify(run, null, 2)
            );
        } catch (err) {
            console.error('TestFox: Failed to save run:', err);
        }
    }

    private _isToday(date: Date): boolean {
        const today = new Date();
        return date.getDate() === today.getDate()
            && date.getMonth() === today.getMonth()
            && date.getFullYear() === today.getFullYear();
    }

    private _formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }
}

export class TestRunItem extends vscode.TreeItem {
    runId?: string;
}
