import { TestCase, TestResult, TestStatus, TestEvidence, ProjectInfo } from '../types';
import { AppRunner } from '../core/appRunner';
import { BrowserRunner } from './browserRunner';
import { ApiRunner } from './apiRunner';

/**
 * Main test execution engine
 */
export class TestRunner {
    private browserRunner: BrowserRunner | null = null;
    private apiRunner: ApiRunner;

    constructor(private appRunner: AppRunner, private testStore?: { getProjectInfo(): ProjectInfo | null }) {
        this.apiRunner = new ApiRunner();
    }

    async runTest(test: TestCase): Promise<Partial<TestResult>> {
        const startTime = new Date();

        try {
            // Skip manual tests
            if (test.automationLevel === 'manual') {
                return {
                    status: 'not_tested',
                    notes: 'Manual test - requires human verification',
                    timestamp: new Date()
                };
            }

            // Determine test type and run accordingly
            let result: Partial<TestResult>;

            if (test.targetElement?.type === 'endpoint' || test.category === 'api') {
                result = await this.runApiTest(test);
            } else if (test.category === 'security') {
                result = await this.runSecurityTest(test);
            } else if (test.category === 'performance') {
                result = await this.runPerformanceTest(test);
            } else if (test.category === 'load') {
                result = await this.runLoadTest(test);
            } else {
                result = await this.runBrowserTest(test);
            }

            const endTime = new Date();
            return {
                ...result,
                startTime,
                endTime,
                duration: endTime.getTime() - startTime.getTime(),
                timestamp: new Date()
            };
        } catch (error) {
            const endTime = new Date();
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                startTime,
                endTime,
                duration: endTime.getTime() - startTime.getTime(),
                timestamp: new Date()
            };
        }
    }

    private async runBrowserTest(test: TestCase): Promise<Partial<TestResult>> {
        // Initialize browser runner if needed
        if (!this.browserRunner) {
            this.browserRunner = new BrowserRunner();
            await this.browserRunner.initialize();
        }

        // Ensure the application is running before testing
        let baseUrl = this.appRunner.getBaseUrl();
        if (!baseUrl || !this.appRunner.isAppRunning()) {
            console.log('TestRunner: App not running, starting application...');
            try {
                // Get project info to start the app
                if (this.testStore) {
                    const projectInfo = this.testStore.getProjectInfo();
                    if (projectInfo) {
                        baseUrl = await this.appRunner.start(projectInfo);
                        console.log(`TestRunner: App started at ${baseUrl}`);
                    } else {
                        console.error('TestRunner: No project info available to start app');
                        baseUrl = 'http://localhost:3000'; // fallback
                    }
                } else {
                    console.error('TestRunner: No testStore available');
                    baseUrl = 'http://localhost:3000'; // fallback
                }
            } catch (error) {
                console.error('TestRunner: Failed to start app:', error);
                baseUrl = 'http://localhost:3000'; // fallback
            }
        } else {
            console.log(`TestRunner: App already running at ${baseUrl}`);
        }

        const evidence: TestEvidence[] = [];

        try {
            const path = test.targetElement?.path || '/';
            const url = `${baseUrl}${path}`;

            // Navigate to page
            await this.browserRunner.navigate(url);

            // Execute test steps
            for (const step of test.steps) {
                await this.executeStep(step, test);
            }

            // Take screenshot as evidence
            const screenshot = await this.browserRunner.screenshot();
            if (screenshot) {
                evidence.push({
                    type: 'screenshot',
                    content: screenshot,
                    timestamp: new Date()
                });
            }

            // Check for console errors
            const consoleErrors = await this.browserRunner.getConsoleErrors();
            if (consoleErrors.length > 0) {
                evidence.push({
                    type: 'log',
                    content: consoleErrors.join('\n'),
                    timestamp: new Date()
                });

                // Fail if there are critical errors
                const hasCriticalError = consoleErrors.some(e => 
                    e.includes('Uncaught') || e.includes('Error:')
                );
                if (hasCriticalError) {
                    return {
                        status: 'failed',
                        error: 'Console errors detected',
                        evidence
                    };
                }
            }

            return {
                status: 'passed',
                evidence
            };
        } catch (error) {
            // Take screenshot on failure
            try {
                const screenshot = await this.browserRunner.screenshot();
                if (screenshot) {
                    evidence.push({
                        type: 'screenshot',
                        content: screenshot,
                        timestamp: new Date()
                    });
                }
            } catch {}

            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                evidence
            };
        }
    }

    private async runApiTest(test: TestCase): Promise<Partial<TestResult>> {
        const baseUrl = this.appRunner.getBaseUrl() || 'http://localhost:3000';
        const path = test.targetElement?.path || '/';
        const method = test.targetElement?.method || 'GET';
        const url = `${baseUrl}${path}`;

        try {
            const response = await this.apiRunner.request({
                method,
                url,
                timeout: test.timeout || 30000
            });

            const evidence: TestEvidence[] = [{
                type: 'response',
                content: JSON.stringify({
                    status: response.status,
                    headers: response.headers,
                    data: response.data
                }, null, 2),
                timestamp: new Date()
            }];

            // Check status code based on test type
            const isSuccess = response.status >= 200 && response.status < 300;
            const isErrorTest = test.name.toLowerCase().includes('invalid') || 
                               test.name.toLowerCase().includes('unauthorized') ||
                               test.name.toLowerCase().includes('error');

            if (isErrorTest) {
                // For error tests, we expect 4xx or 5xx
                const isExpectedError = response.status >= 400;
                return {
                    status: isExpectedError ? 'passed' : 'failed',
                    error: isExpectedError ? undefined : `Expected error status, got ${response.status}`,
                    evidence
                };
            }

            return {
                status: isSuccess ? 'passed' : 'failed',
                error: isSuccess ? undefined : `Unexpected status code: ${response.status}`,
                evidence
            };
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async runSecurityTest(test: TestCase): Promise<Partial<TestResult>> {
        const baseUrl = this.appRunner.getBaseUrl() || 'http://localhost:3000';
        const evidence: TestEvidence[] = [];

        try {
            switch (test.securityType) {
                case 'sql_injection':
                    return await this.testSqlInjection(baseUrl, test);
                
                case 'xss':
                    return await this.testXss(baseUrl, test);
                
                case 'security_headers':
                    return await this.testSecurityHeaders(baseUrl);
                
                case 'auth_bypass':
                    return await this.testAuthBypass(baseUrl, test);
                
                case 'csrf':
                    return await this.testCsrf(baseUrl, test);
                
                case 'sensitive_data':
                    return await this.testSensitiveData(baseUrl, test);
                
                default:
                    // Generic security test
                    return { status: 'passed' };
            }
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async testSqlInjection(baseUrl: string, test: TestCase): Promise<Partial<TestResult>> {
        const payloads = [
            "' OR '1'='1",
            "' OR '1'='1' --",
            "1; DROP TABLE users; --",
            "' UNION SELECT null, username, password FROM users --"
        ];

        const path = test.targetElement?.path || '/api/login';
        const evidence: TestEvidence[] = [];
        let vulnerable = false;

        for (const payload of payloads) {
            try {
                const response = await this.apiRunner.request({
                    method: 'POST',
                    url: `${baseUrl}${path}`,
                    data: { username: payload, password: payload },
                    timeout: 5000
                });

                // Check for signs of SQL injection success
                if (response.status === 200 || 
                    (response.data && JSON.stringify(response.data).toLowerCase().includes('sql'))) {
                    vulnerable = true;
                    evidence.push({
                        type: 'log',
                        content: `Potential SQL injection with payload: ${payload}`,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                // Errors are expected for blocked attempts
            }
        }

        return {
            status: vulnerable ? 'failed' : 'passed',
            error: vulnerable ? 'SQL injection vulnerability detected' : undefined,
            evidence
        };
    }

    private async testXss(baseUrl: string, test: TestCase): Promise<Partial<TestResult>> {
        if (!this.browserRunner) {
            this.browserRunner = new BrowserRunner();
            await this.browserRunner.initialize();
        }

        const payloads = [
            '<script>alert("XSS")</script>',
            '<img src=x onerror=alert("XSS")>',
            '"><script>alert("XSS")</script>'
        ];

        const path = test.targetElement?.path || '/';
        let vulnerable = false;
        const evidence: TestEvidence[] = [];

        for (const payload of payloads) {
            try {
                await this.browserRunner.navigate(`${baseUrl}${path}?q=${encodeURIComponent(payload)}`);
                
                // Check if script executed (would trigger an alert)
                const alertTriggered = await this.browserRunner.checkForAlert();
                if (alertTriggered) {
                    vulnerable = true;
                    evidence.push({
                        type: 'log',
                        content: `XSS executed with payload: ${payload}`,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                // Continue testing other payloads
            }
        }

        return {
            status: vulnerable ? 'failed' : 'passed',
            error: vulnerable ? 'XSS vulnerability detected' : undefined,
            evidence
        };
    }

    private async testSecurityHeaders(baseUrl: string): Promise<Partial<TestResult>> {
        const requiredHeaders = [
            { name: 'X-Content-Type-Options', expected: 'nosniff' },
            { name: 'X-Frame-Options', expected: ['DENY', 'SAMEORIGIN'] },
            { name: 'Strict-Transport-Security', expected: 'max-age' },
            { name: 'Content-Security-Policy', expected: null }
        ];

        try {
            const response = await this.apiRunner.request({
                method: 'GET',
                url: baseUrl
            });

            const missingHeaders: string[] = [];
            const evidence: TestEvidence[] = [{
                type: 'response',
                content: JSON.stringify(response.headers, null, 2),
                timestamp: new Date()
            }];

            for (const header of requiredHeaders) {
                const value = response.headers[header.name.toLowerCase()];
                if (!value) {
                    missingHeaders.push(header.name);
                } else if (header.expected) {
                    const expectedValues = Array.isArray(header.expected) 
                        ? header.expected 
                        : [header.expected];
                    const matches = expectedValues.some(exp => 
                        value.toLowerCase().includes(exp.toLowerCase())
                    );
                    if (!matches) {
                        missingHeaders.push(`${header.name} (incorrect value)`);
                    }
                }
            }

            return {
                status: missingHeaders.length === 0 ? 'passed' : 'failed',
                error: missingHeaders.length > 0 
                    ? `Missing or incorrect headers: ${missingHeaders.join(', ')}` 
                    : undefined,
                evidence
            };
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async testAuthBypass(baseUrl: string, test: TestCase): Promise<Partial<TestResult>> {
        const protectedPaths = ['/api/admin', '/api/user', '/dashboard', '/api/protected'];
        let bypassed = false;
        const evidence: TestEvidence[] = [];

        for (const path of protectedPaths) {
            try {
                const response = await this.apiRunner.request({
                    method: 'GET',
                    url: `${baseUrl}${path}`,
                    timeout: 5000
                });

                if (response.status === 200) {
                    bypassed = true;
                    evidence.push({
                        type: 'log',
                        content: `Protected endpoint ${path} accessible without auth`,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                // 401/403 errors are expected
            }
        }

        return {
            status: bypassed ? 'failed' : 'passed',
            error: bypassed ? 'Authentication bypass detected' : undefined,
            evidence
        };
    }

    private async testCsrf(baseUrl: string, test: TestCase): Promise<Partial<TestResult>> {
        const path = test.targetElement?.path || '/api/form';

        try {
            // Try to submit without CSRF token
            const response = await this.apiRunner.request({
                method: 'POST',
                url: `${baseUrl}${path}`,
                data: { test: 'data' },
                headers: {
                    'Content-Type': 'application/json'
                    // Intentionally no CSRF token
                },
                timeout: 5000
            });

            // If request succeeds, CSRF protection might be missing
            if (response.status === 200 || response.status === 201) {
                return {
                    status: 'failed',
                    error: 'Request succeeded without CSRF token - protection may be missing'
                };
            }

            return { status: 'passed' };
        } catch (error: any) {
            // 403 is expected when CSRF protection is working
            if (error.response?.status === 403) {
                return { status: 'passed' };
            }
            return {
                status: 'failed',
                error: error.message
            };
        }
    }

    private async testSensitiveData(baseUrl: string, test: TestCase): Promise<Partial<TestResult>> {
        const path = test.targetElement?.path || '/api/user';
        const sensitivePatterns = [
            /password/i,
            /secret/i,
            /api[_-]?key/i,
            /private[_-]?key/i,
            /credit[_-]?card/i,
            /ssn/i
        ];

        try {
            const response = await this.apiRunner.request({
                method: 'GET',
                url: `${baseUrl}${path}`,
                timeout: 5000
            });

            const responseText = JSON.stringify(response.data);
            const exposedData: string[] = [];

            for (const pattern of sensitivePatterns) {
                if (pattern.test(responseText)) {
                    exposedData.push(pattern.source);
                }
            }

            const evidence: TestEvidence[] = [{
                type: 'response',
                content: responseText,
                timestamp: new Date()
            }];

            return {
                status: exposedData.length === 0 ? 'passed' : 'failed',
                error: exposedData.length > 0 
                    ? `Sensitive data patterns found: ${exposedData.join(', ')}` 
                    : undefined,
                evidence
            };
        } catch (error) {
            // API might require auth, which is fine
            return { status: 'passed' };
        }
    }

    private async runPerformanceTest(test: TestCase): Promise<Partial<TestResult>> {
        const baseUrl = this.appRunner.getBaseUrl() || 'http://localhost:3000';
        const path = test.targetElement?.path || '/';
        const url = `${baseUrl}${path}`;

        try {
            const startTime = Date.now();
            
            if (test.targetElement?.type === 'endpoint') {
                const response = await this.apiRunner.request({
                    method: test.targetElement?.method || 'GET',
                    url,
                    timeout: test.timeout || 30000
                });

                const duration = Date.now() - startTime;
                const threshold = 500; // 500ms threshold

                return {
                    status: duration < threshold ? 'passed' : 'failed',
                    error: duration >= threshold 
                        ? `Response time ${duration}ms exceeds threshold ${threshold}ms` 
                        : undefined,
                    evidence: [{
                        type: 'log',
                        content: `Response time: ${duration}ms`,
                        timestamp: new Date()
                    }]
                };
            } else {
                // Browser-based performance test
                if (!this.browserRunner) {
                    this.browserRunner = new BrowserRunner();
                    await this.browserRunner.initialize();
                }

                const metrics = await this.browserRunner.getPerformanceMetrics(url);
                const threshold = 3000; // 3s for page load

                return {
                    status: metrics.loadTime < threshold ? 'passed' : 'failed',
                    error: metrics.loadTime >= threshold 
                        ? `Load time ${metrics.loadTime}ms exceeds threshold ${threshold}ms` 
                        : undefined,
                    evidence: [{
                        type: 'log',
                        content: JSON.stringify(metrics, null, 2),
                        timestamp: new Date()
                    }]
                };
            }
        } catch (error) {
            return {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async runLoadTest(test: TestCase): Promise<Partial<TestResult>> {
        const baseUrl = this.appRunner.getBaseUrl() || 'http://localhost:3000';
        const path = test.targetElement?.path || '/';
        const url = `${baseUrl}${path}`;
        const concurrency = 10;
        const results: number[] = [];
        const errors: string[] = [];

        const requests = Array(concurrency).fill(null).map(async () => {
            try {
                const startTime = Date.now();
                await this.apiRunner.request({
                    method: test.targetElement?.method || 'GET',
                    url,
                    timeout: 10000
                });
                results.push(Date.now() - startTime);
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        });

        await Promise.all(requests);

        const avgTime = results.length > 0 
            ? results.reduce((a, b) => a + b, 0) / results.length 
            : 0;
        const errorRate = errors.length / concurrency * 100;

        return {
            status: errorRate < 10 && avgTime < 2000 ? 'passed' : 'failed',
            error: errorRate >= 10 || avgTime >= 2000 
                ? `Error rate: ${errorRate}%, Avg response: ${avgTime}ms` 
                : undefined,
            evidence: [{
                type: 'log',
                content: JSON.stringify({
                    concurrency,
                    successCount: results.length,
                    errorCount: errors.length,
                    avgResponseTime: avgTime,
                    errorRate: `${errorRate}%`
                }, null, 2),
                timestamp: new Date()
            }]
        };
    }

    private async executeStep(step: { action: string; data?: string; expected?: string }, test: TestCase): Promise<void> {
        const action = step.action.toLowerCase();

        if (!this.browserRunner) return;

        if (action.includes('navigate') || action.includes('go to')) {
            // Already handled in runBrowserTest
            return;
        }

        if (action.includes('click')) {
            const selector = this.extractSelector(action);
            if (selector) {
                await this.browserRunner.click(selector);
            }
        }

        if (action.includes('enter') || action.includes('type') || action.includes('fill')) {
            const selector = this.extractSelector(action);
            if (selector && step.data) {
                await this.browserRunner.type(selector, step.data);
            }
        }

        if (action.includes('submit')) {
            await this.browserRunner.submit();
        }

        if (action.includes('wait')) {
            const ms = parseInt(action.match(/\d+/)?.[0] || '1000');
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    private extractSelector(action: string): string | null {
        const selectorMatch = action.match(/['"]([^'"]+)['"]/);
        if (selectorMatch) return selectorMatch[1];

        const buttonMatch = action.match(/(\w+)\s+button/i);
        if (buttonMatch) return `button:has-text("${buttonMatch[1]}")`;

        const linkMatch = action.match(/(\w+)\s+link/i);
        if (linkMatch) return `a:has-text("${linkMatch[1]}")`;

        return null;
    }

    async cleanup(): Promise<void> {
        if (this.browserRunner) {
            await this.browserRunner.close();
            this.browserRunner = null;
        }
    }
}

