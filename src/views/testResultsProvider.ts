import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestStatus } from '../types';

/**
 * Tree data provider for the Test Results view
 */
export class TestResultsProvider implements vscode.TreeDataProvider<ResultTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ResultTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<ResultTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ResultTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private testStore: TestStore) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ResultTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ResultTreeItem): Thenable<ResultTreeItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }

        if (element.contextValue === 'resultGroup') {
            return Promise.resolve(this.getResultsInGroup(element.status!));
        }

        return Promise.resolve([]);
    }

    private getRootItems(): ResultTreeItem[] {
        const stats = this.testStore.getStatistics();
        const items: ResultTreeItem[] = [];

        // Summary item
        const summaryItem = new ResultTreeItem(
            `Summary: ${stats.passed + stats.manualPass}/${stats.total} passed`,
            vscode.TreeItemCollapsibleState.None,
            'summary'
        );
        summaryItem.iconPath = new vscode.ThemeIcon('graph');
        summaryItem.description = `${((stats.passed + stats.manualPass) / stats.total * 100 || 0).toFixed(1)}% pass rate`;
        items.push(summaryItem);

        // Status groups
        const groups: Array<{ status: TestStatus; label: string; icon: string; color: string }> = [
            { status: 'passed', label: 'Passed', icon: 'check', color: 'testing.iconPassed' },
            { status: 'failed', label: 'Failed', icon: 'x', color: 'testing.iconFailed' },
            { status: 'manual_pass', label: 'Manual Pass', icon: 'check-all', color: 'testing.iconPassed' },
            { status: 'manual_fail', label: 'Manual Fail', icon: 'error', color: 'testing.iconFailed' },
            { status: 'skipped', label: 'Skipped', icon: 'debug-step-over', color: 'testing.iconSkipped' },
            { status: 'not_tested', label: 'Not Tested', icon: 'question', color: 'testing.iconUnset' },
            { status: 'pending', label: 'Pending', icon: 'circle-outline', color: 'testing.iconUnset' }
        ];

        for (const group of groups) {
            const tests = this.testStore.getTestsByStatus(group.status);
            if (tests.length > 0 || group.status === 'pending') {
                const count = group.status === 'pending' ? stats.pending : tests.length;
                const groupItem = new ResultTreeItem(
                    `${group.label} (${count})`,
                    count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    'resultGroup'
                );
                groupItem.status = group.status;
                groupItem.iconPath = new vscode.ThemeIcon(group.icon, new vscode.ThemeColor(group.color));
                items.push(groupItem);
            }
        }

        return items;
    }

    private getResultsInGroup(status: TestStatus): ResultTreeItem[] {
        const tests = this.testStore.getTestsByStatus(status);
        
        // For pending, we need to find tests without results
        if (status === 'pending') {
            const allTests = this.testStore.getAllTests();
            const testsWithResults = new Set(this.testStore.getTestResults().map(r => r.testId));
            const pendingTests = allTests.filter(t => !testsWithResults.has(t.id));
            
            return pendingTests.map(test => {
                const item = new ResultTreeItem(
                    test.name,
                    vscode.TreeItemCollapsibleState.None,
                    'resultItem'
                );
                item.description = test.category;
                item.iconPath = new vscode.ThemeIcon('circle-outline');
                item.tooltip = test.description;
                return item;
            });
        }

        return tests.map(test => {
            const result = this.testStore.getTestResult(test.id);
            const item = new ResultTreeItem(
                test.name,
                vscode.TreeItemCollapsibleState.None,
                'resultItem'
            );
            item.description = result?.duration ? `${result.duration}ms` : test.category;
            item.tooltip = this.getResultTooltip(test.name, result);
            
            if (result?.error) {
                item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            }

            return item;
        });
    }

    private getResultTooltip(testName: string, result?: { error?: string; duration?: number; notes?: string }): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${testName}\n\n`);
        
        if (result) {
            if (result.duration) {
                md.appendMarkdown(`**Duration:** ${result.duration}ms\n\n`);
            }
            if (result.notes) {
                md.appendMarkdown(`**Notes:** ${result.notes}\n\n`);
            }
            if (result.error) {
                md.appendMarkdown(`**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n`);
            }
        }

        return md;
    }
}

/**
 * Tree item for the results view
 */
export class ResultTreeItem extends vscode.TreeItem {
    status?: TestStatus;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}

