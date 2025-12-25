import * as vscode from 'vscode';
import {
    ProjectInfo,
    AnalysisResult,
    TestCase,
    TestResult,
    TestCategory,
    TestStatus
} from '../types';

/**
 * Central store for all test-related data
 */
export class TestStore {
    private context: vscode.ExtensionContext;
    private projectInfo: ProjectInfo | null = null;
    private analysisResult: AnalysisResult | null = null;
    private tests: Map<string, TestCase> = new Map();
    private results: Map<string, TestResult> = new Map();

    private readonly TESTS_KEY = 'testfox.tests';
    private readonly RESULTS_KEY = 'testfox.results';
    private readonly PROJECT_KEY = 'testfox.projectInfo';
    private readonly ANALYSIS_KEY = 'testfox.analysisResult';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        // Load project info
        const storedProjectInfo = this.context.workspaceState.get<ProjectInfo>(this.PROJECT_KEY);
        if (storedProjectInfo) {
            this.projectInfo = storedProjectInfo;
        }

        // Load analysis result
        const storedAnalysis = this.context.workspaceState.get<AnalysisResult>(this.ANALYSIS_KEY);
        if (storedAnalysis) {
            this.analysisResult = storedAnalysis;
        }

        // Load tests
        const storedTests = this.context.workspaceState.get<[string, TestCase][]>(this.TESTS_KEY);
        if (storedTests) {
            this.tests = new Map(storedTests);
        }

        // Load results
        const storedResults = this.context.workspaceState.get<[string, TestResult][]>(this.RESULTS_KEY);
        if (storedResults) {
            this.results = new Map(storedResults);
        }
    }

    private saveToStorage(): void {
        this.context.workspaceState.update(this.PROJECT_KEY, this.projectInfo);
        this.context.workspaceState.update(this.ANALYSIS_KEY, this.analysisResult);
        this.context.workspaceState.update(this.TESTS_KEY, Array.from(this.tests.entries()));
        this.context.workspaceState.update(this.RESULTS_KEY, Array.from(this.results.entries()));
    }

    // Project Info
    setProjectInfo(info: ProjectInfo): void {
        this.projectInfo = info;
        this.saveToStorage();
    }

    getProjectInfo(): ProjectInfo | null {
        return this.projectInfo;
    }

    // Analysis Result
    setAnalysisResult(result: AnalysisResult): void {
        this.analysisResult = result;
        this.saveToStorage();
    }

    getAnalysisResult(): AnalysisResult | null {
        if (!this.analysisResult) {
            return null;
        }

        // Ensure the analysis result has all required properties
        this.ensureValidAnalysisResult(this.analysisResult);
        return this.analysisResult;
    }

    private ensureValidAnalysisResult(analysisResult: AnalysisResult): void {
        if (!analysisResult.routes || !Array.isArray(analysisResult.routes)) {
            analysisResult.routes = [];
        }
        if (!analysisResult.forms || !Array.isArray(analysisResult.forms)) {
            analysisResult.forms = [];
        }
        if (!analysisResult.endpoints || !Array.isArray(analysisResult.endpoints)) {
            analysisResult.endpoints = [];
        }
        if (!analysisResult.authFlows || !Array.isArray(analysisResult.authFlows)) {
            analysisResult.authFlows = [];
        }
        if (!analysisResult.databaseQueries || !Array.isArray(analysisResult.databaseQueries)) {
            analysisResult.databaseQueries = [];
        }
        if (!analysisResult.externalApis || !Array.isArray(analysisResult.externalApis)) {
            analysisResult.externalApis = [];
        }
        if (!analysisResult.components || !Array.isArray(analysisResult.components)) {
            analysisResult.components = [];
        }
    }

    // Tests
    addTest(test: TestCase): void {
        this.tests.set(test.id, test);
        this.saveToStorage();
    }

    addTests(tests: TestCase[]): void {
        tests.forEach(test => this.tests.set(test.id, test));
        this.saveToStorage();
    }

    getTest(id: string): TestCase | undefined {
        return this.tests.get(id);
    }

    getAllTests(): TestCase[] {
        return Array.from(this.tests.values());
    }

    getTestsByCategory(category: string): TestCase[] {
        const normalizedCategory = category.toLowerCase().replace(/\s+/g, '_');
        return Array.from(this.tests.values()).filter(
            test => test.category.toLowerCase() === normalizedCategory ||
                    test.category === category
        );
    }

    getTestsByStatus(status: TestStatus): TestCase[] {
        return Array.from(this.tests.values()).filter(test => {
            const result = this.results.get(test.id);
            return result?.status === status;
        });
    }

    clearTests(): void {
        this.tests.clear();
        this.results.clear();
        this.saveToStorage();
    }

    // Results
    updateTestResult(testId: string, result: Partial<TestResult>): void {
        const existing = this.results.get(testId) || {
            testId,
            status: 'pending' as TestStatus,
            timestamp: new Date()
        };

        this.results.set(testId, {
            ...existing,
            ...result,
            testId,
            timestamp: new Date()
        });
        this.saveToStorage();
    }

    getTestResult(testId: string): TestResult | undefined {
        return this.results.get(testId);
    }

    getTestResults(): TestResult[] {
        return Array.from(this.results.values());
    }

    // Statistics
    getStatistics(): {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        notTested: number;
        manualPass: number;
        manualFail: number;
        pending: number;
        byCategory: Map<TestCategory, { total: number; passed: number; failed: number }>;
    } {
        const tests = this.getAllTests();
        const stats = {
            total: tests.length,
            passed: 0,
            failed: 0,
            skipped: 0,
            notTested: 0,
            manualPass: 0,
            manualFail: 0,
            pending: 0,
            byCategory: new Map<TestCategory, { total: number; passed: number; failed: number }>()
        };

        for (const test of tests) {
            const result = this.results.get(test.id);
            const status = result?.status || 'pending';

            // Category stats
            let catStats = stats.byCategory.get(test.category);
            if (!catStats) {
                catStats = { total: 0, passed: 0, failed: 0 };
                stats.byCategory.set(test.category, catStats);
            }
            catStats.total++;

            switch (status) {
                case 'passed':
                    stats.passed++;
                    catStats.passed++;
                    break;
                case 'failed':
                    stats.failed++;
                    catStats.failed++;
                    break;
                case 'skipped':
                    stats.skipped++;
                    break;
                case 'not_tested':
                    stats.notTested++;
                    break;
                case 'manual_pass':
                    stats.manualPass++;
                    catStats.passed++;
                    break;
                case 'manual_fail':
                    stats.manualFail++;
                    catStats.failed++;
                    break;
                case 'pending':
                default:
                    stats.pending++;
                    break;
            }
        }

        return stats;
    }

    // Export data for reports
    exportData(): {
        projectInfo: ProjectInfo | null;
        analysisResult: AnalysisResult | null;
        tests: TestCase[];
        results: TestResult[];
        statistics: ReturnType<TestStore['getStatistics']>;
    } {
        return {
            projectInfo: this.projectInfo,
            analysisResult: this.analysisResult,
            tests: this.getAllTests(),
            results: this.getTestResults(),
            statistics: this.getStatistics()
        };
    }
}

