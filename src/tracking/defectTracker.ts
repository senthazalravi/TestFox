import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Defect status lifecycle
 */
export type DefectStatus = 'open' | 'fixed' | 'reopen' | 'wont_fix' | 'duplicate';

/**
 * Defect severity levels
 */
export type DefectSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Defect category prefix mapping
 */
export const DEFECT_PREFIXES: Record<string, string> = {
    'smoke': 'SMK',
    'sanity': 'SAN',
    'regression': 'REG',
    'functional': 'FUN',
    'api': 'API',
    'ui': 'UI',
    'e2e': 'E2E',
    'integration': 'INT',
    'database': 'DB',
    'security': 'SEC',
    'performance': 'PRF',
    'load': 'LOD',
    'stress': 'STR',
    'accessibility': 'ACC',
    'negative': 'NEG',
    'boundary': 'BND',
    'monkey': 'MNK',
    'exploratory': 'EXP',
    'usability': 'USA',
    'acceptance': 'UAT',
    'compatibility': 'CMP',
    'console_logs': 'CON',
    'network_logs': 'NET',
    'ui_e2e': 'E2E'
};

/**
 * Defect record
 */
export interface Defect {
    id: string;                    // e.g., "UI-0001"
    testId: string;                // Associated test ID
    testName: string;              // Test name
    category: string;              // Test category
    status: DefectStatus;
    severity: DefectSeverity;
    description: string;
    errorMessage?: string;
    stackTrace?: string;
    screenshot?: string;
    firstFoundRun: number;         // Run number when first found
    lastSeenRun: number;           // Run number when last seen
    fixedInRun?: number;           // Run number when fixed
    createdAt: Date;
    updatedAt: Date;
    history: DefectHistoryEntry[];
}

/**
 * Defect history entry
 */
export interface DefectHistoryEntry {
    runNumber: number;
    status: DefectStatus;
    timestamp: Date;
    notes?: string;
}

/**
 * Test run record
 */
export interface TestRun {
    runNumber: number;
    timestamp: Date;
    duration: number;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    newDefects: number;
    fixedDefects: number;
    openDefects: number;
    passRate: number;
    categories: CategoryResult[];
}

/**
 * Category result in a test run
 */
export interface CategoryResult {
    category: string;
    total: number;
    passed: number;
    failed: number;
}

/**
 * Defect and Test Run Tracker
 */
export class DefectTracker {
    private context: vscode.ExtensionContext;
    private defects: Map<string, Defect> = new Map();
    private testRuns: TestRun[] = [];
    private currentRunNumber: number = 0;
    private defectCounters: Map<string, number> = new Map();
    private outputChannel: vscode.OutputChannel;
    
    private readonly DEFECTS_KEY = 'testfox.defects';
    private readonly RUNS_KEY = 'testfox.testRuns';
    private readonly COUNTERS_KEY = 'testfox.defectCounters';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Defects');
        this.loadData();
    }

    /**
     * Load persisted data
     */
    private loadData(): void {
        try {
            // Load defects
            const defectsData = this.context.globalState.get<string>(this.DEFECTS_KEY);
            if (defectsData) {
                const parsed = JSON.parse(defectsData);
                this.defects = new Map(Object.entries(parsed));
            }

            // Load test runs
            const runsData = this.context.globalState.get<string>(this.RUNS_KEY);
            if (runsData) {
                this.testRuns = JSON.parse(runsData);
                this.currentRunNumber = this.testRuns.length;
            }

            // Load counters
            const countersData = this.context.globalState.get<string>(this.COUNTERS_KEY);
            if (countersData) {
                this.defectCounters = new Map(Object.entries(JSON.parse(countersData)));
            }

            this.log(`Loaded ${this.defects.size} defects, ${this.testRuns.length} runs`);
        } catch (error) {
            this.log('Error loading data, starting fresh');
        }
    }

    /**
     * Save data to persistent storage
     */
    private async saveData(): Promise<void> {
        try {
            // Save defects
            const defectsObj: Record<string, Defect> = {};
            this.defects.forEach((v, k) => defectsObj[k] = v);
            await this.context.globalState.update(this.DEFECTS_KEY, JSON.stringify(defectsObj));

            // Save runs
            await this.context.globalState.update(this.RUNS_KEY, JSON.stringify(this.testRuns));

            // Save counters
            const countersObj: Record<string, number> = {};
            this.defectCounters.forEach((v, k) => countersObj[k] = v);
            await this.context.globalState.update(this.COUNTERS_KEY, JSON.stringify(countersObj));
        } catch (error) {
            this.log('Error saving data');
        }
    }

    /**
     * Generate a defect ID for a category
     */
    generateDefectId(category: string): string {
        const prefix = DEFECT_PREFIXES[category.toLowerCase()] || 'DEF';
        const currentCount = this.defectCounters.get(prefix) || 0;
        const newCount = currentCount + 1;
        this.defectCounters.set(prefix, newCount);
        
        const id = `${prefix}-${String(newCount).padStart(4, '0')}`;
        return id;
    }

    /**
     * Start a new test run
     */
    startNewRun(): number {
        this.currentRunNumber++;
        this.log(`Starting Test Run #${this.currentRunNumber}`);
        return this.currentRunNumber;
    }

    /**
     * Report a test failure and create/update defect
     */
    reportFailure(
        testId: string,
        testName: string,
        category: string,
        errorMessage: string,
        severity: DefectSeverity = 'medium',
        screenshot?: string,
        stackTrace?: string
    ): Defect {
        // Check if defect already exists for this test
        const existingDefect = this.findDefectByTestId(testId);

        if (existingDefect) {
            // Reopen if it was fixed
            if (existingDefect.status === 'fixed') {
                existingDefect.status = 'reopen';
                existingDefect.history.push({
                    runNumber: this.currentRunNumber,
                    status: 'reopen',
                    timestamp: new Date(),
                    notes: 'Defect reoccurred'
                });
                this.log(`🔄 Defect ${existingDefect.id} reopened`);
            }
            
            existingDefect.lastSeenRun = this.currentRunNumber;
            existingDefect.errorMessage = errorMessage;
            existingDefect.updatedAt = new Date();
            
            this.defects.set(existingDefect.id, existingDefect);
            this.saveData();
            return existingDefect;
        }

        // Create new defect
        const defectId = this.generateDefectId(category);
        const defect: Defect = {
            id: defectId,
            testId,
            testName,
            category,
            status: 'open',
            severity,
            description: `Test "${testName}" failed`,
            errorMessage,
            stackTrace,
            screenshot,
            firstFoundRun: this.currentRunNumber,
            lastSeenRun: this.currentRunNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
            history: [{
                runNumber: this.currentRunNumber,
                status: 'open',
                timestamp: new Date(),
                notes: 'Defect created'
            }]
        };

        this.defects.set(defectId, defect);
        this.saveData();
        
        this.log(`🐛 New Defect: ${defectId} - ${testName}`);
        return defect;
    }

    /**
     * Report a test passing - may fix a defect
     */
    reportPass(testId: string): Defect | null {
        const existingDefect = this.findDefectByTestId(testId);

        if (existingDefect && existingDefect.status !== 'fixed' && existingDefect.status !== 'wont_fix') {
            existingDefect.status = 'fixed';
            existingDefect.fixedInRun = this.currentRunNumber;
            existingDefect.updatedAt = new Date();
            existingDefect.history.push({
                runNumber: this.currentRunNumber,
                status: 'fixed',
                timestamp: new Date(),
                notes: 'Test passed - defect fixed'
            });

            this.defects.set(existingDefect.id, existingDefect);
            this.saveData();
            
            this.log(`✅ Defect ${existingDefect.id} marked as FIXED`);
            return existingDefect;
        }

        return null;
    }

    /**
     * Complete a test run and record statistics
     */
    completeRun(
        totalTests: number,
        passed: number,
        failed: number,
        skipped: number,
        duration: number,
        categoryResults: CategoryResult[]
    ): TestRun {
        const openDefects = Array.from(this.defects.values())
            .filter(d => d.status === 'open' || d.status === 'reopen').length;
        
        const newDefects = Array.from(this.defects.values())
            .filter(d => d.firstFoundRun === this.currentRunNumber).length;
        
        const fixedDefects = Array.from(this.defects.values())
            .filter(d => d.fixedInRun === this.currentRunNumber).length;

        const run: TestRun = {
            runNumber: this.currentRunNumber,
            timestamp: new Date(),
            duration,
            totalTests,
            passed,
            failed,
            skipped,
            newDefects,
            fixedDefects,
            openDefects,
            passRate: totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0,
            categories: categoryResults
        };

        this.testRuns.push(run);
        this.saveData();

        this.log(`📊 Run #${this.currentRunNumber} complete: ${passed}/${totalTests} passed (${run.passRate}%)`);
        return run;
    }

    /**
     * Find defect by test ID
     */
    findDefectByTestId(testId: string): Defect | undefined {
        return Array.from(this.defects.values()).find(d => d.testId === testId);
    }

    /**
     * Get all defects
     */
    getAllDefects(): Defect[] {
        return Array.from(this.defects.values());
    }

    /**
     * Get open defects
     */
    getOpenDefects(): Defect[] {
        return Array.from(this.defects.values())
            .filter(d => d.status === 'open' || d.status === 'reopen');
    }

    /**
     * Get fixed defects
     */
    getFixedDefects(): Defect[] {
        return Array.from(this.defects.values())
            .filter(d => d.status === 'fixed');
    }

    /**
     * Get all test runs
     */
    getAllRuns(): TestRun[] {
        return this.testRuns;
    }

    /**
     * Get current run number
     */
    getCurrentRunNumber(): number {
        return this.currentRunNumber;
    }

    /**
     * Get improvement metrics between runs
     */
    getImprovementMetrics(): {
        passRateTrend: number[];
        defectTrend: number[];
        fixedTrend: number[];
        runLabels: string[];
    } {
        const recentRuns = this.testRuns.slice(-10); // Last 10 runs
        
        return {
            passRateTrend: recentRuns.map(r => r.passRate),
            defectTrend: recentRuns.map(r => r.openDefects),
            fixedTrend: recentRuns.map(r => r.fixedDefects),
            runLabels: recentRuns.map(r => `Run #${r.runNumber}`)
        };
    }

    /**
     * Get defect statistics
     */
    getDefectStats(): {
        total: number;
        open: number;
        fixed: number;
        reopen: number;
        bySeverity: Record<string, number>;
        byCategory: Record<string, number>;
    } {
        const defects = Array.from(this.defects.values());
        
        const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
        const byCategory: Record<string, number> = {};

        for (const defect of defects) {
            bySeverity[defect.severity] = (bySeverity[defect.severity] || 0) + 1;
            byCategory[defect.category] = (byCategory[defect.category] || 0) + 1;
        }

        return {
            total: defects.length,
            open: defects.filter(d => d.status === 'open').length,
            fixed: defects.filter(d => d.status === 'fixed').length,
            reopen: defects.filter(d => d.status === 'reopen').length,
            bySeverity,
            byCategory
        };
    }

    /**
     * Clear all tracking data
     */
    async clearAllData(): Promise<void> {
        this.defects.clear();
        this.testRuns = [];
        this.currentRunNumber = 0;
        this.defectCounters.clear();
        await this.saveData();
        this.log('All tracking data cleared');
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    showOutput(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

