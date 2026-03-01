import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestCase, TestResult } from '../types';

export interface TestRunData {
    id: string;
    commit?: string;
    trigger: 'manual' | 'scheduled' | 'commit';
    timestamp: Date;
    duration: number;
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    tests: Array<{
        testId: string;
        testName: string;
        category: string;
        status: string;
        duration?: number;
        error?: string;
    }>;
    categoryResults?: Array<{
        category: string;
        total: number;
        passed: number;
        failed: number;
    }>;
}

/**
 * Manages test run storage in .testfox/ directory
 */
export class TestRunStorage {
    private testfoxDir: string;
    private runsDir: string;

    constructor(workspacePath: string) {
        this.testfoxDir = path.join(workspacePath, '.testfox');
        this.runsDir = path.join(this.testfoxDir, 'runs');
        this.ensureDirectories();
    }

    /**
     * Ensure .testfox directory structure exists
     */
    private ensureDirectories(): void {
        if (!fs.existsSync(this.testfoxDir)) {
            fs.mkdirSync(this.testfoxDir, { recursive: true });
        }
        if (!fs.existsSync(this.runsDir)) {
            fs.mkdirSync(this.runsDir, { recursive: true });
        }
    }

    /**
     * Save a test run
     */
    async saveRun(runData: TestRunData): Promise<string> {
        const filename = `${this.formatDate(runData.timestamp)}.json`;
        const filepath = path.join(this.runsDir, filename);

        const data = {
            ...runData,
            timestamp: runData.timestamp.toISOString()
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

        // Update latest.json
        await this.updateLatest(runData);

        return filepath;
    }

    /**
     * Update latest.json
     */
    private async updateLatest(runData: TestRunData): Promise<void> {
        const latestPath = path.join(this.testfoxDir, 'latest.json');
        const data = {
            ...runData,
            timestamp: runData.timestamp.toISOString()
        };
        fs.writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * Get latest test run
     */
    getLatest(): TestRunData | null {
        const latestPath = path.join(this.testfoxDir, 'latest.json');
        if (!fs.existsSync(latestPath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(latestPath, 'utf-8');
            const data = JSON.parse(content);
            return {
                ...data,
                timestamp: new Date(data.timestamp)
            };
        } catch (error) {
            console.error('Failed to read latest.json:', error);
            return null;
        }
    }

    /**
     * Get all test runs
     */
    getAllRuns(): TestRunData[] {
        if (!fs.existsSync(this.runsDir)) {
            return [];
        }

        const files = fs.readdirSync(this.runsDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first

        return files.map(file => {
            try {
                const filepath = path.join(this.runsDir, file);
                const content = fs.readFileSync(filepath, 'utf-8');
                const data = JSON.parse(content);
                return {
                    ...data,
                    timestamp: new Date(data.timestamp)
                };
            } catch (error) {
                console.error(`Failed to read ${file}:`, error);
                return null;
            }
        }).filter((run): run is TestRunData => run !== null);
    }

    /**
     * Get test run by ID
     */
    getRunById(id: string): TestRunData | null {
        const runs = this.getAllRuns();
        return runs.find(r => r.id === id) || null;
    }

    /**
     * Format date for filename
     */
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}`;
    }

    /**
     * Get storage configuration
     */
    getConfig(): any {
        const configPath = path.join(this.testfoxDir, 'config.json');
        if (!fs.existsSync(configPath)) {
            return {};
        }

        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to read config.json:', error);
            return {};
        }
    }

    /**
     * Save storage configuration
     */
    saveConfig(config: any): void {
        const configPath = path.join(this.testfoxDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
}

