import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestCase } from '../types';
import { TestFingerprint } from './testFingerprint';
import { RouteInfo, FormInfo, EndpointInfo, ComponentInfo } from '../types';

export interface TestedItem {
    fingerprint: string;
    file: string;
    type: 'route' | 'form' | 'endpoint' | 'component' | 'auth' | 'database' | 'generic';
    identifier: string; // route path, form name, endpoint path, etc.
    testIds: string[]; // IDs of tests that cover this item
    lastTested: Date;
    lastModified: Date; // Last time the source file was modified
}

/**
 * Tracks which files, routes, endpoints, forms, etc. have been tested
 * Prevents duplicate test generation
 */
export class TestCoverageTracker {
    private coverage: Map<string, TestedItem> = new Map();
    private testFingerprints: Map<string, string> = new Map(); // testId -> fingerprint
    private workspacePath: string;
    private coverageFile: string;

    constructor(context: vscode.ExtensionContext, workspacePath: string) {
        this.workspacePath = workspacePath;
        this.coverageFile = path.join(workspacePath, '.testfox', 'coverage.json');
        this.loadCoverage();
    }

    /**
     * Load coverage data from disk
     */
    private loadCoverage(): void {
        if (fs.existsSync(this.coverageFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.coverageFile, 'utf-8'));
                this.coverage = new Map(data.coverage || []);
                this.testFingerprints = new Map(data.testFingerprints || []);
            } catch (error) {
                console.error('Failed to load coverage data:', error);
            }
        }
    }

    /**
     * Save coverage data to disk
     */
    private saveCoverage(): void {
        try {
            const dir = path.dirname(this.coverageFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = {
                coverage: Array.from(this.coverage.entries()),
                testFingerprints: Array.from(this.testFingerprints.entries()),
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.coverageFile, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save coverage data:', error);
        }
    }

    /**
     * Check if a test is a duplicate
     */
    isDuplicate(test: TestCase): boolean {
        const fingerprint = TestFingerprint.generate(test);
        
        // Check if we've seen this fingerprint before
        for (const [testId, existingFingerprint] of this.testFingerprints.entries()) {
            if (existingFingerprint === fingerprint) {
                return true;
            }
        }

        return false;
    }

    /**
     * Register a test and track what it covers
     */
    registerTest(test: TestCase, sourceFile?: string): void {
        const fingerprint = TestFingerprint.generate(test);
        this.testFingerprints.set(test.id, fingerprint);

        // Track what this test covers
        if (test.targetElement) {
            let itemFingerprint: string;
            let type: TestedItem['type'];
            let identifier: string;

            if (test.targetElement.type === 'route' || test.targetElement.type === 'endpoint') {
                itemFingerprint = TestFingerprint.forRoute(
                    test.targetElement.method || 'GET',
                    test.targetElement.path || '',
                    test.category
                );
                type = test.targetElement.type === 'route' ? 'route' : 'endpoint';
                identifier = `${test.targetElement.method} ${test.targetElement.path}`;
            } else if (test.targetElement.type === 'form') {
                itemFingerprint = TestFingerprint.forForm(
                    test.name,
                    test.targetElement.path || '',
                    test.category
                );
                type = 'form';
                identifier = test.targetElement.path || test.name;
            } else if (test.targetElement.type === 'component') {
                itemFingerprint = TestFingerprint.forComponent(
                    test.targetElement.selector || test.name,
                    test.category
                );
                type = 'component';
                identifier = test.targetElement.selector || test.name;
            } else {
                return; // Unknown type
            }

            const existing = this.coverage.get(itemFingerprint);
            if (existing) {
                // Update existing coverage
                if (!existing.testIds.includes(test.id)) {
                    existing.testIds.push(test.id);
                }
                existing.lastTested = new Date();
                if (sourceFile) {
                    existing.file = sourceFile;
                    existing.lastModified = this.getFileModTime(sourceFile);
                }
            } else {
                // New coverage entry
                this.coverage.set(itemFingerprint, {
                    fingerprint: itemFingerprint,
                    file: sourceFile || '',
                    type,
                    identifier,
                    testIds: [test.id],
                    lastTested: new Date(),
                    lastModified: sourceFile ? this.getFileModTime(sourceFile) : new Date()
                });
            }
        }

        this.saveCoverage();
    }

    /**
     * Get file modification time
     */
    private getFileModTime(filePath: string): Date {
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                return stats.mtime;
            }
        } catch (error) {
            // Ignore errors
        }
        return new Date();
    }

    /**
     * Check if a route has been tested
     */
    isRouteTested(method: string, path: string, category: string): boolean {
        const fingerprint = TestFingerprint.forRoute(method, path, category);
        return this.coverage.has(fingerprint);
    }

    /**
     * Check if a form has been tested
     */
    isFormTested(formName: string, action: string, category: string): boolean {
        const fingerprint = TestFingerprint.forForm(formName, action, category);
        return this.coverage.has(fingerprint);
    }

    /**
     * Check if an endpoint has been tested
     */
    isEndpointTested(method: string, path: string, category: string): boolean {
        const fingerprint = TestFingerprint.forEndpoint(method, path, category);
        return this.coverage.has(fingerprint);
    }

    /**
     * Check if a component has been tested
     */
    isComponentTested(componentName: string, category: string): boolean {
        const fingerprint = TestFingerprint.forComponent(componentName, category);
        return this.coverage.has(fingerprint);
    }

    /**
     * Get new/changed items that need testing
     */
    getNewOrChangedItems(analysisResult: {
        routes: RouteInfo[];
        forms: FormInfo[];
        endpoints: EndpointInfo[];
        components: ComponentInfo[];
    }): {
        newRoutes: RouteInfo[];
        changedRoutes: RouteInfo[];
        newForms: FormInfo[];
        changedForms: FormInfo[];
        newEndpoints: EndpointInfo[];
        changedEndpoints: EndpointInfo[];
        newComponents: ComponentInfo[];
        changedComponents: ComponentInfo[];
    } {
        const result = {
            newRoutes: [] as RouteInfo[],
            changedRoutes: [] as RouteInfo[],
            newForms: [] as FormInfo[],
            changedForms: [] as FormInfo[],
            newEndpoints: [] as EndpointInfo[],
            changedEndpoints: [] as EndpointInfo[],
            newComponents: [] as ComponentInfo[],
            changedComponents: [] as ComponentInfo[]
        };

        // Check routes
        for (const route of analysisResult.routes) {
            const fingerprint = TestFingerprint.forRoute(route.method, route.path, 'functional');
            const existing = this.coverage.get(fingerprint);
            
            if (!existing) {
                result.newRoutes.push(route);
            } else {
                // Check if file was modified after last test
                const routeFile = route.file || '';
                if (routeFile) {
                    const fileModTime = this.getFileModTime(routeFile);
                    if (fileModTime > existing.lastTested) {
                        result.changedRoutes.push(route);
                    }
                }
            }
        }

        // Check forms
        for (const form of analysisResult.forms) {
            const fingerprint = TestFingerprint.forForm(form.name, form.action || '', 'functional');
            const existing = this.coverage.get(fingerprint);
            
            if (!existing) {
                result.newForms.push(form);
            } else {
                const formFile = (form as any).file || '';
                if (formFile) {
                    const fileModTime = this.getFileModTime(formFile);
                    if (fileModTime > existing.lastTested) {
                        result.changedForms.push(form);
                    }
                }
            }
        }

        // Check endpoints
        for (const endpoint of analysisResult.endpoints) {
            const fingerprint = TestFingerprint.forEndpoint(endpoint.method, endpoint.path, 'api');
            const existing = this.coverage.get(fingerprint);
            
            if (!existing) {
                result.newEndpoints.push(endpoint);
            } else {
                const endpointFile = (endpoint as any).file || '';
                if (endpointFile) {
                    const fileModTime = this.getFileModTime(endpointFile);
                    if (fileModTime > existing.lastTested) {
                        result.changedEndpoints.push(endpoint);
                    }
                }
            }
        }

        // Check components
        for (const component of analysisResult.components) {
            const fingerprint = TestFingerprint.forComponent(component.name, 'functional');
            const existing = this.coverage.get(fingerprint);
            
            if (!existing) {
                result.newComponents.push(component);
            } else {
                const componentFile = component.file || '';
                if (componentFile) {
                    const fileModTime = this.getFileModTime(componentFile);
                    if (fileModTime > existing.lastTested) {
                        result.changedComponents.push(component);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Remove test from coverage (when test is deleted)
     */
    unregisterTest(testId: string): void {
        this.testFingerprints.delete(testId);
        
        // Remove test ID from coverage items
        for (const [fingerprint, item] of this.coverage.entries()) {
            const index = item.testIds.indexOf(testId);
            if (index >= 0) {
                item.testIds.splice(index, 1);
                // If no tests cover this item, remove it
                if (item.testIds.length === 0) {
                    this.coverage.delete(fingerprint);
                }
            }
        }

        this.saveCoverage();
    }

    /**
     * Clear all coverage (for testing or reset)
     */
    clearCoverage(): void {
        this.coverage.clear();
        this.testFingerprints.clear();
        this.saveCoverage();
    }

    /**
     * Get coverage statistics
     */
    getCoverageStats(): {
        totalItems: number;
        testedItems: number;
        coverageRate: number;
        byType: Map<string, { total: number; tested: number }>;
    } {
        const byType = new Map<string, { total: number; tested: number }>();

        for (const item of this.coverage.values()) {
            const stats = byType.get(item.type) || { total: 0, tested: 0 };
            stats.total++;
            stats.tested++;
            byType.set(item.type, stats);
        }

        const totalItems = this.coverage.size;
        const testedItems = totalItems; // All items in coverage are tested
        const coverageRate = totalItems > 0 ? 100 : 0;

        return {
            totalItems,
            testedItems,
            coverageRate,
            byType
        };
    }
}

