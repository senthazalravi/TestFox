import * as vscode from 'vscode';
import { TestStore } from '../store/testStore';
import { TestCase, TestCategory, TestStatus, TEST_CATEGORIES, CATEGORY_GROUPS, TestCategoryGroup } from '../types';

/**
 * Tree data provider for the Test Explorer view
 */
export class TestExplorerProvider implements vscode.TreeDataProvider<TestTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TestTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<TestTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TestTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private testStore: TestStore) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TestTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TestTreeItem): Thenable<TestTreeItem[]> {
        if (!element) {
            // Root level - show category groups
            return Promise.resolve(this.getCategoryGroups());
        }

        if (element.contextValue === 'categoryGroup') {
            // Show categories in this group
            return Promise.resolve(this.getCategoriesInGroup(element.groupId!));
        }

        if (element.contextValue === 'testCategory') {
            // Show tests in category
            return Promise.resolve(this.getTestsInCategory(element.category!));
        }

        if (element.contextValue === 'testSubcategory') {
            // Show tests in subcategory
            return Promise.resolve(this.getTestsInSubcategory(element.category!, element.subcategory!));
        }

        return Promise.resolve([]);
    }

    private getCategoryGroups(): TestTreeItem[] {
        return CATEGORY_GROUPS.map(group => {
            const categoriesInGroup = TEST_CATEGORIES.filter(c => c.group === group.id);
            const allTests = categoriesInGroup.flatMap(c => this.testStore.getTestsByCategory(c.id));
            const stats = this.getCategoryStats(allTests);
            
            const item = new TestTreeItem(
                `${group.name}`,
                vscode.TreeItemCollapsibleState.Expanded,
                'categoryGroup'
            );
            item.groupId = group.id as TestCategoryGroup;
            item.iconPath = new vscode.ThemeIcon(group.icon);
            item.description = allTests.length > 0 ? `${stats.passed}/${allTests.length}` : '';
            item.tooltip = this.getGroupTooltip(group.name, allTests.length, stats);

            return item;
        });
    }

    private getCategoriesInGroup(groupId: TestCategoryGroup): TestTreeItem[] {
        const categoriesInGroup = TEST_CATEGORIES.filter(c => c.group === groupId);
        
        return categoriesInGroup.map(cat => {
            const tests = this.testStore.getTestsByCategory(cat.id);
            const stats = this.getCategoryStats(tests);
            
            const item = new TestTreeItem(
                `${cat.name}`,
                tests.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                'testCategory'
            );
            item.category = cat.id;
            item.iconPath = new vscode.ThemeIcon(cat.icon);
            item.description = tests.length > 0 ? `${stats.passed}/${tests.length}` : 'No tests';
            item.tooltip = this.getCategoryTooltip(cat.name, cat.description, tests.length, stats);

            return item;
        });
    }

    private getTestsInCategory(category: TestCategory): TestTreeItem[] {
        const tests = this.testStore.getTestsByCategory(category);
        
        // Group by subcategory if available
        const subcategories = new Map<string, TestCase[]>();
        const ungrouped: TestCase[] = [];

        for (const test of tests) {
            if (test.subcategory) {
                const existing = subcategories.get(test.subcategory) || [];
                existing.push(test);
                subcategories.set(test.subcategory, existing);
            } else {
                ungrouped.push(test);
            }
        }

        const items: TestTreeItem[] = [];

        // Add subcategory groups
        for (const [subcat, subTests] of subcategories) {
            const stats = this.getCategoryStats(subTests);
            const item = new TestTreeItem(
                `${this.formatSubcategory(subcat)} (${stats.passed}/${subTests.length})`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'testSubcategory'
            );
            item.category = category;
            item.subcategory = subcat;
            item.iconPath = new vscode.ThemeIcon('folder');
            item.description = this.getStatusDescription(stats);
            items.push(item);
        }

        // Add ungrouped tests
        for (const test of ungrouped) {
            items.push(this.createTestItem(test));
        }

        return items;
    }

    private getTestsInSubcategory(category: TestCategory, subcategory: string): TestTreeItem[] {
        const tests = this.testStore.getTestsByCategory(category)
            .filter(t => t.subcategory === subcategory);

        return tests.map(test => this.createTestItem(test));
    }

    private createTestItem(test: TestCase): TestTreeItem {
        const result = this.testStore.getTestResult(test.id);
        const status = result?.status || 'pending';

        // Determine context value based on status
        let contextValue: string;
        if (test.automationLevel === 'manual') {
            contextValue = 'manualTest';
        } else if (status === 'failed') {
            contextValue = 'failedTest';
        } else {
            contextValue = 'automatedTest';
        }

        const item = new TestTreeItem(
            test.name,
            vscode.TreeItemCollapsibleState.None,
            contextValue
        );

        item.testId = test.id;
        item.iconPath = this.getStatusIcon(status);
        item.description = this.getTestDescription(test, status);
        item.tooltip = this.getTestTooltip(test, result);
        
        // Add command to show test details
        item.command = {
            command: 'testfox.showTestDetails',
            title: 'Show Test Details',
            arguments: [test.id]
        };

        return item;
    }

    private getStatusIcon(status: TestStatus): vscode.ThemeIcon {
        const icons: Record<TestStatus, { icon: string; color?: string }> = {
            'pending': { icon: 'circle-outline', color: 'testing.iconUnset' },
            'running': { icon: 'sync~spin', color: 'testing.runAction' },
            'passed': { icon: 'check', color: 'testing.iconPassed' },
            'failed': { icon: 'x', color: 'testing.iconFailed' },
            'skipped': { icon: 'debug-step-over', color: 'testing.iconSkipped' },
            'not_tested': { icon: 'question', color: 'testing.iconUnset' },
            'manual_pass': { icon: 'check-all', color: 'testing.iconPassed' },
            'manual_fail': { icon: 'error', color: 'testing.iconFailed' }
        };

        const iconInfo = icons[status] || icons['pending'];
        return new vscode.ThemeIcon(iconInfo.icon, iconInfo.color ? new vscode.ThemeColor(iconInfo.color) : undefined);
    }

    private getCategoryStats(tests: TestCase[]): { passed: number; failed: number; pending: number } {
        let passed = 0;
        let failed = 0;
        let pending = 0;

        for (const test of tests) {
            const result = this.testStore.getTestResult(test.id);
            const status = result?.status || 'pending';

            if (status === 'passed' || status === 'manual_pass') {
                passed++;
            } else if (status === 'failed' || status === 'manual_fail') {
                failed++;
            } else {
                pending++;
            }
        }

        return { passed, failed, pending };
    }

    private getStatusDescription(stats: { passed: number; failed: number; pending: number }): string {
        const parts: string[] = [];
        if (stats.failed > 0) parts.push(`${stats.failed} failed`);
        if (stats.pending > 0) parts.push(`${stats.pending} pending`);
        return parts.join(', ');
    }

    private getGroupTooltip(name: string, total: number, stats: { passed: number; failed: number; pending: number }): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${name}\n\n`);
        md.appendMarkdown(`- **Total:** ${total} tests\n`);
        md.appendMarkdown(`- **Passed:** ${stats.passed}\n`);
        md.appendMarkdown(`- **Failed:** ${stats.failed}\n`);
        md.appendMarkdown(`- **Pending:** ${stats.pending}\n`);
        return md;
    }

    private getCategoryTooltip(name: string, description: string, total: number, stats: { passed: number; failed: number; pending: number }): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${name}\n\n`);
        md.appendMarkdown(`*${description}*\n\n`);
        md.appendMarkdown(`- **Total:** ${total} tests\n`);
        md.appendMarkdown(`- **Passed:** ${stats.passed}\n`);
        md.appendMarkdown(`- **Failed:** ${stats.failed}\n`);
        md.appendMarkdown(`- **Pending:** ${stats.pending}\n`);
        return md;
    }

    private getTestDescription(test: TestCase, status: TestStatus): string {
        const parts: string[] = [];
        
        if (test.automationLevel === 'manual') {
            parts.push('Manual');
        }
        
        if (test.priority === 'critical' || test.priority === 'high') {
            parts.push(test.priority.charAt(0).toUpperCase() + test.priority.slice(1));
        }

        if (test.istqbTechnique) {
            parts.push(this.formatIstqbTechnique(test.istqbTechnique));
        }

        return parts.join(' | ');
    }

    private getTestTooltip(test: TestCase, result?: { status: TestStatus; error?: string; duration?: number }): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${test.name}\n\n`);
        md.appendMarkdown(`${test.description}\n\n`);
        md.appendMarkdown(`- **Category:** ${test.category}\n`);
        md.appendMarkdown(`- **Priority:** ${test.priority}\n`);
        md.appendMarkdown(`- **Automation:** ${test.automationLevel}\n`);
        
        if (test.istqbTechnique) {
            md.appendMarkdown(`- **ISTQB Technique:** ${this.formatIstqbTechnique(test.istqbTechnique)}\n`);
        }

        if (result) {
            md.appendMarkdown(`\n**Status:** ${result.status}\n`);
            if (result.duration) {
                md.appendMarkdown(`**Duration:** ${result.duration}ms\n`);
            }
            if (result.error) {
                md.appendMarkdown(`\n**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n`);
            }
        }

        return md;
    }

    private formatSubcategory(subcat: string): string {
        return subcat
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    private formatIstqbTechnique(technique: string): string {
        const names: Record<string, string> = {
            'boundary_value_analysis': 'BVA',
            'equivalence_partitioning': 'EP',
            'decision_table': 'Decision Table',
            'state_transition': 'State Transition',
            'use_case': 'Use Case',
            'error_guessing': 'Error Guessing',
            'exploratory': 'Exploratory'
        };
        return names[technique] || technique;
    }
}

/**
 * Tree item for the test explorer
 */
export class TestTreeItem extends vscode.TreeItem {
    groupId?: TestCategoryGroup;
    category?: TestCategory;
    subcategory?: string;
    testId?: string;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}
