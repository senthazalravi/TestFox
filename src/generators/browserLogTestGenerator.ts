import * as vscode from 'vscode';
import { TestCase, TestCategory } from '../types';

/**
 * Generates test cases for browser console logs and network requests
 */
export class BrowserLogTestGenerator {
    
    /**
     * Generate console log test cases
     */
    generateConsoleLogTests(): TestCase[] {
        const tests: TestCase[] = [];

        // No Console Errors
        tests.push(this.createTest(
            'console-no-errors',
            'Console Logs - No JavaScript Errors',
            'Console Logs',
            'Verify no JavaScript errors appear in the console during page load and interaction',
            ['Navigate to each page', 'Monitor console for errors', 'Interact with UI elements', 'Verify no red error messages'],
            'critical',
            ['console', 'errors', 'javascript']
        ));

        // No Unhandled Promise Rejections
        tests.push(this.createTest(
            'console-no-unhandled-promises',
            'Console Logs - No Unhandled Promise Rejections',
            'Console Logs',
            'Verify all async operations handle errors properly without unhandled rejections',
            ['Trigger async operations', 'Monitor for "Unhandled" messages', 'Verify error boundaries work'],
            'high',
            ['console', 'async', 'promises']
        ));

        // No React/Vue/Angular Warnings
        tests.push(this.createTest(
            'console-no-framework-warnings',
            'Console Logs - No Framework Warnings',
            'Console Logs',
            'Verify no React, Vue, or Angular specific warnings (keys, hooks, deprecations)',
            ['Check for "Warning:" messages', 'Verify no hydration errors', 'Check for missing keys warnings'],
            'medium',
            ['console', 'framework', 'warnings']
        ));

        // No Deprecation Warnings
        tests.push(this.createTest(
            'console-no-deprecations',
            'Console Logs - No Deprecation Warnings',
            'Console Logs',
            'Verify no deprecated API usage warnings in the console',
            ['Monitor for "deprecated" messages', 'Check for future compatibility issues'],
            'medium',
            ['console', 'deprecation']
        ));

        // No Security Warnings
        tests.push(this.createTest(
            'console-no-security-warnings',
            'Console Logs - No Security Warnings',
            'Console Logs',
            'Verify no CORS, CSP, or mixed content security warnings',
            ['Check for CORS errors', 'Verify CSP compliance', 'Check for mixed content warnings'],
            'high',
            ['console', 'security']
        ));

        // No Memory Leak Indicators
        tests.push(this.createTest(
            'console-no-memory-issues',
            'Console Logs - No Memory Issues',
            'Console Logs',
            'Verify no memory-related warnings or errors during extended use',
            ['Navigate through app multiple times', 'Monitor for memory warnings', 'Check for leak indicators'],
            'medium',
            ['console', 'memory', 'performance']
        ));

        // No 404 Resource Errors
        tests.push(this.createTest(
            'console-no-missing-resources',
            'Console Logs - No Missing Resources',
            'Console Logs',
            'Verify no 404 errors for images, scripts, stylesheets, or fonts',
            ['Load all pages', 'Check for failed resource loads', 'Verify all assets exist'],
            'high',
            ['console', 'resources', '404']
        ));

        // No Third-Party Script Errors
        tests.push(this.createTest(
            'console-no-third-party-errors',
            'Console Logs - No Third-Party Script Errors',
            'Console Logs',
            'Verify third-party scripts (analytics, ads, widgets) load without errors',
            ['Check external script loading', 'Verify no blocked scripts', 'Monitor tracking pixel errors'],
            'low',
            ['console', 'third-party']
        ));

        return tests;
    }

    /**
     * Generate network log test cases
     */
    generateNetworkLogTests(): TestCase[] {
        const tests: TestCase[] = [];

        // No Failed API Calls
        tests.push(this.createTest(
            'network-no-failed-apis',
            'Network Logs - No Failed API Calls',
            'Network Logs',
            'Verify all API calls return successful responses (2xx or 3xx)',
            ['Monitor all fetch/XHR requests', 'Check for 4xx/5xx responses', 'Verify error handling'],
            'critical',
            ['network', 'api', 'errors']
        ));

        // No 500 Server Errors
        tests.push(this.createTest(
            'network-no-server-errors',
            'Network Logs - No Server Errors (5xx)',
            'Network Logs',
            'Verify no internal server errors occur during testing',
            ['Trigger all API endpoints', 'Monitor for 500, 502, 503 responses', 'Verify backend stability'],
            'critical',
            ['network', 'server', '500']
        ));

        // No 404 Not Found
        tests.push(this.createTest(
            'network-no-404',
            'Network Logs - No 404 Not Found Errors',
            'Network Logs',
            'Verify all resources and API endpoints exist',
            ['Check all static resources', 'Verify API endpoints', 'Check dynamic routes'],
            'high',
            ['network', '404', 'resources']
        ));

        // No CORS Errors
        tests.push(this.createTest(
            'network-no-cors',
            'Network Logs - No CORS Errors',
            'Network Logs',
            'Verify cross-origin requests are properly configured',
            ['Test API calls', 'Check preflight requests', 'Verify CORS headers'],
            'high',
            ['network', 'cors', 'security']
        ));

        // API Response Times
        tests.push(this.createTest(
            'network-api-response-time',
            'Network Logs - API Response Times < 3s',
            'Network Logs',
            'Verify all API calls complete within acceptable time limits',
            ['Measure response times', 'Check for slow endpoints', 'Verify no timeouts'],
            'high',
            ['network', 'performance', 'latency']
        ));

        // No Large Payloads
        tests.push(this.createTest(
            'network-payload-size',
            'Network Logs - Reasonable Payload Sizes',
            'Network Logs',
            'Verify API responses are not excessively large (< 1MB)',
            ['Measure response sizes', 'Check for bloated responses', 'Verify pagination'],
            'medium',
            ['network', 'performance', 'payload']
        ));

        // HTTPS Usage
        tests.push(this.createTest(
            'network-https-only',
            'Network Logs - HTTPS Only (No Mixed Content)',
            'Network Logs',
            'Verify all requests use HTTPS (no insecure HTTP requests)',
            ['Check request protocols', 'Verify no mixed content', 'Check for http:// URLs'],
            'high',
            ['network', 'security', 'https']
        ));

        // No Timeout Errors
        tests.push(this.createTest(
            'network-no-timeouts',
            'Network Logs - No Request Timeouts',
            'Network Logs',
            'Verify no network requests timeout during normal operation',
            ['Test all API endpoints', 'Monitor for timeout errors', 'Check request completion'],
            'high',
            ['network', 'timeout', 'reliability']
        ));

        // Proper Error Responses
        tests.push(this.createTest(
            'network-proper-error-format',
            'Network Logs - Proper Error Response Format',
            'Network Logs',
            'Verify error responses include proper error messages and status codes',
            ['Trigger error conditions', 'Verify error response format', 'Check error messages'],
            'medium',
            ['network', 'api', 'error-handling']
        ));

        // No Duplicate Requests
        tests.push(this.createTest(
            'network-no-duplicates',
            'Network Logs - No Duplicate API Calls',
            'Network Logs',
            'Verify the same API is not called multiple times unnecessarily',
            ['Monitor request patterns', 'Check for duplicate calls', 'Verify caching'],
            'medium',
            ['network', 'performance', 'optimization']
        ));

        // Proper Caching
        tests.push(this.createTest(
            'network-caching',
            'Network Logs - Proper Resource Caching',
            'Network Logs',
            'Verify static resources are properly cached',
            ['Check cache headers', 'Verify cached responses', 'Monitor cache hit rate'],
            'medium',
            ['network', 'performance', 'caching']
        ));

        // WebSocket Stability (if applicable)
        tests.push(this.createTest(
            'network-websocket-stability',
            'Network Logs - WebSocket Connection Stability',
            'Network Logs',
            'Verify WebSocket connections remain stable without disconnects',
            ['Monitor WebSocket connections', 'Check for reconnection patterns', 'Verify message delivery'],
            'medium',
            ['network', 'websocket', 'realtime']
        ));

        return tests;
    }

    /**
     * Generate all browser log tests
     */
    generateAllBrowserLogTests(): TestCase[] {
        return [
            ...this.generateConsoleLogTests(),
            ...this.generateNetworkLogTests()
        ];
    }

    private createTest(
        id: string,
        name: string,
        category: string,
        description: string,
        steps: string[],
        priority: 'critical' | 'high' | 'medium' | 'low',
        tags: string[]
    ): TestCase {
        return {
            id,
            name,
            category: category as TestCategory,
            description,
            automationLevel: 'automated',
            priority,
            status: 'pending',
            tags,
            steps: steps.map((step, i) => ({
                order: i + 1,
                action: step,
                expectedResult: 'Step passes without issues'
            })),
            expectedResult: 'No errors or issues detected',
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }
}

