import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestStatus, TestCategory } from '../types';

/**
 * Enhanced Tree data provider for the Test Results view
 * Shows comprehensive metrics and detailed test information
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

        if (element.contextValue === 'metricsGroup') {
            return Promise.resolve(this.getMetricsItems());
        }

        if (element.contextValue === 'categoryGroup') {
            return Promise.resolve(this.getCategoryItems());
        }

        if (element.contextValue === 'performanceGroup') {
            return Promise.resolve(this.getPerformanceItems());
        }

        return Promise.resolve([]);
    }

    private getRootItems(): ResultTreeItem[] {
        const stats = this.testStore.getStatistics();
        const items: ResultTreeItem[] = [];

        // Overall Summary with pass rate
        const passRate = stats.total > 0 ? ((stats.passed + stats.manualPass) / stats.total * 100).toFixed(1) : '0.0';
        const summaryItem = new ResultTreeItem(
            `📊 Test Results Summary`,
            vscode.TreeItemCollapsibleState.None,
            'summary'
        );
        summaryItem.iconPath = new vscode.ThemeIcon('dashboard');
        summaryItem.description = `${passRate}% pass rate (${stats.passed + stats.manualPass}/${stats.total})`;
        summaryItem.tooltip = this.getSummaryTooltip(stats);
        items.push(summaryItem);

        // Metrics Overview Section
        const metricsItem = new ResultTreeItem(
            `📈 Detailed Metrics`,
            vscode.TreeItemCollapsibleState.Expanded,
            'metricsGroup'
        );
        metricsItem.iconPath = new vscode.ThemeIcon('graph');
        items.push(metricsItem);

        // Category Breakdown
        const categoryItem = new ResultTreeItem(
            `📁 By Category`,
            vscode.TreeItemCollapsibleState.Collapsed,
            'categoryGroup'
        );
        categoryItem.iconPath = new vscode.ThemeIcon('folder');
        items.push(categoryItem);

        // Performance Metrics
        const performanceItem = new ResultTreeItem(
            `⏱️ Performance`,
            vscode.TreeItemCollapsibleState.Collapsed,
            'performanceGroup'
        );
        performanceItem.iconPath = new vscode.ThemeIcon('stopwatch');
        items.push(performanceItem);

        // Status groups with counts and icons
        const statusGroups: Array<{ status: TestStatus; label: string; icon: string; color: string }> = [
            { status: 'passed', label: '✅ Passed', icon: 'check', color: 'testing.iconPassed' },
            { status: 'failed', label: '❌ Failed', icon: 'x', color: 'testing.iconFailed' },
            { status: 'manual_pass', label: '✔️ Manual Pass', icon: 'check-all', color: 'testing.iconPassed' },
            { status: 'manual_fail', label: '✖️ Manual Fail', icon: 'error', color: 'testing.iconFailed' },
            { status: 'skipped', label: '⏭️ Skipped', icon: 'debug-step-over', color: 'testing.iconSkipped' },
            { status: 'not_tested', label: '❓ Not Tested', icon: 'question', color: 'testing.iconUnset' },
            { status: 'pending', label: '⏳ Pending', icon: 'circle-outline', color: 'testing.iconUnset' }
        ];

        for (const group of statusGroups) {
            const tests = this.testStore.getTestsByStatus(group.status);
            if (tests.length > 0 || group.status === 'pending') {
                const count = group.status === 'pending' ? stats.pending : tests.length;
                const groupItem = new ResultTreeItem(
                    group.label,
                    count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    'resultGroup'
                );
                groupItem.status = group.status;
                groupItem.iconPath = new vscode.ThemeIcon(group.icon, new vscode.ThemeColor(group.color));
                groupItem.description = `${count} tests`;
                items.push(groupItem);
            }
        }

        return items;
    }

    private getMetricsItems(): ResultTreeItem[] {
        const stats = this.testStore.getStatistics();
        const results = this.testStore.getTestResults();
        const items: ResultTreeItem[] = [];

        // Calculate additional metrics
        const totalCompleted = stats.passed + stats.failed + stats.manualPass + stats.manualFail;
        const automationRate = stats.total > 0 ? ((stats.passed + stats.failed) / stats.total * 100).toFixed(1) : '0.0';
        const manualRate = stats.total > 0 ? ((stats.manualPass + stats.manualFail) / stats.total * 100).toFixed(1) : '0.0';
        
        // Average duration
        const completedResults = results.filter(r => r.duration);
        const avgDuration = completedResults.length > 0 
            ? (completedResults.reduce((sum, r) => sum + (r.duration || 0), 0) / completedResults.length).toFixed(0)
            : '0';

        // Success rate (excluding pending/skipped)
        const actionableTests = stats.passed + stats.failed + stats.manualPass + stats.manualFail;
        const successRate = actionableTests > 0 
            ? ((stats.passed + stats.manualPass) / actionableTests * 100).toFixed(1) 
            : '0.0';

        items.push(this.createMetricItem('🎯 Pass Rate', `${successRate}%`, 'Percentage of passed tests', 'testing.iconPassed'));
        items.push(this.createMetricItem('🤖 Automation', `${automationRate}%`, 'Automated test coverage', 'gear'));
        items.push(this.createMetricItem('👤 Manual', `${manualRate}%`, 'Manual test coverage', 'person'));
        items.push(this.createMetricItem('⏱️ Avg Duration', `${avgDuration}ms`, 'Average test execution time', 'clock'));
        items.push(this.createMetricItem('📊 Completed', `${totalCompleted}/${stats.total}`, 'Tests with results', 'check'));

        return items;
    }

    private createMetricItem(label: string, value: string, tooltip: string, icon: string): ResultTreeItem {
        const item = new ResultTreeItem(label, vscode.TreeItemCollapsibleState.None, 'metricItem');
        item.description = value;
        item.tooltip = tooltip;
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }

    private getCategoryItems(): ResultTreeItem[] {
        const stats = this.testStore.getStatistics();
        const items: ResultTreeItem[] = [];

        for (const [category, data] of stats.byCategory) {
            const passRate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(0) : '0';
            const categoryItem = new ResultTreeItem(
                category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                vscode.TreeItemCollapsibleState.None,
                'categoryItem'
            );
            categoryItem.description = `${passRate}% (${data.passed}/${data.total})`;
            categoryItem.tooltip = `${category}: ${data.passed} passed, ${data.failed} failed, ${data.total} total`;
            
            // Set icon based on pass rate
            if (parseInt(passRate) >= 80) {
                categoryItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            } else if (parseInt(passRate) >= 50) {
                categoryItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconSkipped'));
            } else {
                categoryItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            }
            
            items.push(categoryItem);
        }

        return items;
    }

    private getPerformanceItems(): ResultTreeItem[] {
        const results = this.testStore.getTestResults();
        const items: ResultTreeItem[] = [];
        const tests = this.testStore.getAllTests();

        const completedResults = results.filter(r => r.duration);
        if (completedResults.length === 0) {
            items.push(this.createMetricItem('ℹ️ No Data', 'No performance data available', 'Run tests to collect performance metrics', 'info'));
            return items;
        }

        // Calculate performance metrics
        const durations = completedResults.map(r => r.duration || 0).sort((a, b) => a - b);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = durations[0];
        const max = durations[durations.length - 1];
        const median = durations[Math.floor(durations.length / 2)];

        // Find slowest tests
        const slowTests = completedResults
            .sort((a, b) => (b.duration || 0) - (a.duration || 0))
            .slice(0, 3);

        items.push(this.createMetricItem('⚡ Fastest', `${min}ms`, 'Minimum execution time', 'rocket'));
        items.push(this.createMetricItem('📊 Average', `${avg.toFixed(0)}ms`, 'Average execution time', 'clock'));
        items.push(this.createMetricItem('📈 Median', `${median}ms`, 'Median execution time', 'graph'));
        items.push(this.createMetricItem('🐌 Slowest', `${max}ms`, 'Maximum execution time', 'warning'));

        // Add slowest test names
        for (const result of slowTests) {
            const test = tests.find(t => t.id === result.testId);
            if (test) {
                const slowItem = new ResultTreeItem(
                    `  ${test.name.substring(0, 40)}${test.name.length > 40 ? '...' : ''}`,
                    vscode.TreeItemCollapsibleState.None,
                    'slowTest'
                );
                slowItem.description = `${result.duration}ms`;
                slowItem.tooltip = `Slow test: ${test.name}\nDuration: ${result.duration}ms\nCategory: ${test.category}`;
                slowItem.iconPath = new vscode.ThemeIcon('alert', new vscode.ThemeColor('testing.iconSkipped'));
                items.push(slowItem);
            }
        }

        return items;
    }

    private getResultsInGroup(status: TestStatus): ResultTreeItem[] {
        const tests = this.testStore.getTestsByStatus(status);
        const results = this.testStore.getTestResults();
        
        // For pending, we need to find tests without results
        if (status === 'pending') {
            const allTests = this.testStore.getAllTests();
            const testsWithResults = new Set(results.map(r => r.testId));
            const pendingTests = allTests.filter(t => !testsWithResults.has(t.id));
            
            return pendingTests.map(test => {
                const item = new ResultTreeItem(
                    test.name,
                    vscode.TreeItemCollapsibleState.None,
                    'resultItem'
                );
                item.description = `${test.category} • ${test.priority}`;
                item.tooltip = this.getTestDetailsTooltip(test);
                item.iconPath = new vscode.ThemeIcon('circle-outline');
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
            
            // Enhanced description with duration and category
            const parts: string[] = [];
            if (result?.duration) {
                parts.push(`${result.duration}ms`);
            }
            parts.push(test.category);
            if (test.priority === 'critical' || test.priority === 'high') {
                parts.push(`[${test.priority.toUpperCase()}]`);
            }
            item.description = parts.join(' • ');
            
            item.tooltip = this.getDetailedResultTooltip(test, result);
            
            // Set appropriate icon based on status
            if (status === 'failed' || status === 'manual_fail') {
                item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            } else if (status === 'passed' || status === 'manual_pass') {
                item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            } else if (status === 'skipped') {
                item.iconPath = new vscode.ThemeIcon('debug-step-over', new vscode.ThemeColor('testing.iconSkipped'));
            }

            return item;
        });
    }

    private getSummaryTooltip(stats: any): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`## Test Execution Summary\n\n`);
        md.appendMarkdown(`**Total Tests:** ${stats.total}\n\n`);
        md.appendMarkdown(`| Status | Count |\n|--------|-------|\n`);
        md.appendMarkdown(`| ✅ Passed | ${stats.passed} |\n`);
        md.appendMarkdown(`| ❌ Failed | ${stats.failed} |\n`);
        md.appendMarkdown(`| ✔️ Manual Pass | ${stats.manualPass} |\n`);
        md.appendMarkdown(`| ✖️ Manual Fail | ${stats.manualFail} |\n`);
        md.appendMarkdown(`| ⏭️ Skipped | ${stats.skipped} |\n`);
        md.appendMarkdown(`| ⏳ Pending | ${stats.pending} |\n`);
        md.appendMarkdown(`| ❓ Not Tested | ${stats.notTested} |\n`);
        return md;
    }

    private getTestDetailsTooltip(test: any): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${test.name}\n\n`);
        md.appendMarkdown(`**Category:** ${test.category}\n\n`);
        md.appendMarkdown(`**Priority:** ${test.priority}\n\n`);
        md.appendMarkdown(`**Automation:** ${test.automationLevel}\n\n`);
        if (test.description) {
            md.appendMarkdown(`**Description:** ${test.description}\n\n`);
        }
        return md;
    }

    private getDetailedResultTooltip(test: any, result?: any): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${test.name}\n\n`);
        md.appendMarkdown(`**Status:** ${result?.status || 'pending'}\n\n`);
        
        if (result?.duration) {
            md.appendMarkdown(`**Duration:** ${result.duration}ms\n\n`);
        }
        
        md.appendMarkdown(`**Category:** ${test.category}\n\n`);
        md.appendMarkdown(`**Priority:** ${test.priority}\n\n`);
        
        if (test.automationLevel) {
            md.appendMarkdown(`**Automation Level:** ${test.automationLevel}\n\n`);
        }
        
        if (result?.error) {
            md.appendMarkdown(`**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n`);
        }
        
        if (result?.notes) {
            md.appendMarkdown(`**Notes:** ${result.notes}\n\n`);
        }
        
        if (test.steps && test.steps.length > 0) {
            md.appendMarkdown(`**Steps:**\n`);
            test.steps.forEach((step: any, idx: number) => {
                md.appendMarkdown(`${idx + 1}. ${step.action}\n`);
            });
        }
        
        return md;
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
 * Enhanced Tree item for the results view
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

