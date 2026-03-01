import * as vscode from 'vscode';

/**
 * Console log entry captured from browser
 */
export interface ConsoleLogEntry {
    type: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';
    message: string;
    url?: string;
    lineNumber?: number;
    timestamp: Date;
    stackTrace?: string;
}

/**
 * Network request entry captured from browser
 */
export interface NetworkLogEntry {
    url: string;
    method: string;
    status: number;
    statusText: string;
    resourceType: string;
    duration: number;
    requestSize: number;
    responseSize: number;
    timestamp: Date;
    failed: boolean;
    failureReason?: string;
    headers?: Record<string, string>;
    cached: boolean;
}

/**
 * Console log test result
 */
export interface ConsoleTestResult {
    passed: boolean;
    totalLogs: number;
    errors: ConsoleLogEntry[];
    warnings: ConsoleLogEntry[];
    issues: string[];
}

/**
 * Network test result
 */
export interface NetworkTestResult {
    passed: boolean;
    totalRequests: number;
    failedRequests: NetworkLogEntry[];
    slowRequests: NetworkLogEntry[];
    largeResponses: NetworkLogEntry[];
    issues: string[];
}

/**
 * Browser Monitor - Captures console logs and network requests during testing
 */
export class BrowserMonitor {
    private consoleLogs: ConsoleLogEntry[] = [];
    private networkLogs: NetworkLogEntry[] = [];
    private page: any = null;
    private outputChannel: vscode.OutputChannel;
    private isMonitoring: boolean = false;

    // Thresholds for tests
    private readonly SLOW_REQUEST_THRESHOLD = 3000; // 3 seconds
    private readonly LARGE_RESPONSE_THRESHOLD = 1024 * 1024; // 1MB

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestFox Browser Monitor');
    }

    /**
     * Start monitoring a Playwright page
     */
    async startMonitoring(page: any): Promise<void> {
        this.page = page;
        this.consoleLogs = [];
        this.networkLogs = [];
        this.isMonitoring = true;

        this.log('🔍 Starting browser monitoring...');

        // Monitor console messages
        page.on('console', (msg: any) => {
            const entry: ConsoleLogEntry = {
                type: this.mapConsoleType(msg.type()),
                message: msg.text(),
                url: msg.location()?.url,
                lineNumber: msg.location()?.lineNumber,
                timestamp: new Date()
            };
            this.consoleLogs.push(entry);

            // Log errors and warnings
            if (entry.type === 'error') {
                this.log(`❌ Console Error: ${entry.message}`);
            } else if (entry.type === 'warn') {
                this.log(`⚠️ Console Warning: ${entry.message}`);
            }
        });

        // Monitor page errors
        page.on('pageerror', (error: Error) => {
            const entry: ConsoleLogEntry = {
                type: 'error',
                message: error.message,
                stackTrace: error.stack,
                timestamp: new Date()
            };
            this.consoleLogs.push(entry);
            this.log(`❌ Page Error: ${error.message}`);
        });

        // Monitor network requests
        page.on('request', (request: any) => {
            request._startTime = Date.now();
        });

        page.on('response', async (response: any) => {
            const request = response.request();
            const startTime = request._startTime || Date.now();
            const duration = Date.now() - startTime;

            let responseSize = 0;
            try {
                const body = await response.body().catch(() => null);
                responseSize = body ? body.length : 0;
            } catch {
                // Ignore size calculation errors
            }

            const entry: NetworkLogEntry = {
                url: request.url(),
                method: request.method(),
                status: response.status(),
                statusText: response.statusText(),
                resourceType: request.resourceType(),
                duration,
                requestSize: request.postDataBuffer()?.length || 0,
                responseSize,
                timestamp: new Date(),
                failed: !response.ok(),
                cached: response.fromCache()
            };

            this.networkLogs.push(entry);

            // Log issues
            if (!response.ok()) {
                this.log(`❌ Network Error: ${entry.method} ${entry.url} - ${entry.status} ${entry.statusText}`);
            } else if (duration > this.SLOW_REQUEST_THRESHOLD) {
                this.log(`🐌 Slow Request: ${entry.method} ${entry.url} - ${duration}ms`);
            }
        });

        // Monitor failed requests
        page.on('requestfailed', (request: any) => {
            const entry: NetworkLogEntry = {
                url: request.url(),
                method: request.method(),
                status: 0,
                statusText: 'Failed',
                resourceType: request.resourceType(),
                duration: 0,
                requestSize: 0,
                responseSize: 0,
                timestamp: new Date(),
                failed: true,
                failureReason: request.failure()?.errorText,
                cached: false
            };

            this.networkLogs.push(entry);
            this.log(`❌ Request Failed: ${entry.method} ${entry.url} - ${entry.failureReason}`);
        });

        this.log('✅ Browser monitoring active');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring(): void {
        this.isMonitoring = false;
        this.log('🛑 Browser monitoring stopped');
        this.log(`📊 Captured ${this.consoleLogs.length} console logs, ${this.networkLogs.length} network requests`);
    }

    /**
     * Run console log tests
     */
    runConsoleTests(): ConsoleTestResult {
        this.log('\n📋 Running Console Log Tests...');

        const result: ConsoleTestResult = {
            passed: true,
            totalLogs: this.consoleLogs.length,
            errors: [],
            warnings: [],
            issues: []
        };

        // Collect errors and warnings
        result.errors = this.consoleLogs.filter(l => l.type === 'error');
        result.warnings = this.consoleLogs.filter(l => l.type === 'warn');

        // Check for critical errors
        if (result.errors.length > 0) {
            result.passed = false;
            result.issues.push(`Found ${result.errors.length} console error(s)`);
            
            for (const error of result.errors) {
                result.issues.push(`  - ${error.message.substring(0, 100)}`);
            }
        }

        // Check for unhandled promise rejections
        const unhandledPromises = result.errors.filter(e => 
            e.message.includes('Unhandled') || e.message.includes('unhandled')
        );
        if (unhandledPromises.length > 0) {
            result.issues.push(`Found ${unhandledPromises.length} unhandled promise rejection(s)`);
        }

        // Check for React/Vue/Angular specific errors
        const frameworkErrors = result.errors.filter(e =>
            e.message.includes('React') || 
            e.message.includes('Vue') || 
            e.message.includes('Angular') ||
            e.message.includes('Hydration') ||
            e.message.includes('undefined is not')
        );
        if (frameworkErrors.length > 0) {
            result.issues.push(`Found ${frameworkErrors.length} framework-related error(s)`);
        }

        // Check for deprecation warnings
        const deprecations = result.warnings.filter(w =>
            w.message.includes('deprecated') || w.message.includes('Deprecation')
        );
        if (deprecations.length > 0) {
            result.issues.push(`Found ${deprecations.length} deprecation warning(s)`);
        }

        // Check for security warnings
        const securityWarnings = this.consoleLogs.filter(l =>
            l.message.includes('CORS') ||
            l.message.includes('Mixed Content') ||
            l.message.includes('insecure') ||
            l.message.includes('CSP')
        );
        if (securityWarnings.length > 0) {
            result.issues.push(`Found ${securityWarnings.length} security-related warning(s)`);
        }

        // Log results
        this.log(`\n📊 Console Test Results:`);
        this.log(`   Total logs: ${result.totalLogs}`);
        this.log(`   Errors: ${result.errors.length}`);
        this.log(`   Warnings: ${result.warnings.length}`);
        this.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

        return result;
    }

    /**
     * Run network log tests
     */
    runNetworkTests(): NetworkTestResult {
        this.log('\n🌐 Running Network Log Tests...');

        const result: NetworkTestResult = {
            passed: true,
            totalRequests: this.networkLogs.length,
            failedRequests: [],
            slowRequests: [],
            largeResponses: [],
            issues: []
        };

        // Collect failed requests (4xx and 5xx errors)
        result.failedRequests = this.networkLogs.filter(r => 
            r.failed || r.status >= 400
        );

        // Collect slow requests
        result.slowRequests = this.networkLogs.filter(r => 
            r.duration > this.SLOW_REQUEST_THRESHOLD
        );

        // Collect large responses
        result.largeResponses = this.networkLogs.filter(r =>
            r.responseSize > this.LARGE_RESPONSE_THRESHOLD
        );

        // Check for failed API calls
        const failedAPIs = result.failedRequests.filter(r =>
            r.resourceType === 'fetch' || r.resourceType === 'xhr'
        );
        if (failedAPIs.length > 0) {
            result.passed = false;
            result.issues.push(`${failedAPIs.length} API request(s) failed`);
            for (const api of failedAPIs.slice(0, 5)) {
                result.issues.push(`  - ${api.method} ${api.url} → ${api.status || api.failureReason}`);
            }
        }

        // Check for 404 errors
        const notFoundErrors = result.failedRequests.filter(r => r.status === 404);
        if (notFoundErrors.length > 0) {
            result.issues.push(`${notFoundErrors.length} resource(s) not found (404)`);
        }

        // Check for 500 errors
        const serverErrors = result.failedRequests.filter(r => r.status >= 500);
        if (serverErrors.length > 0) {
            result.passed = false;
            result.issues.push(`${serverErrors.length} server error(s) (5xx)`);
        }

        // Check for slow requests
        if (result.slowRequests.length > 0) {
            result.issues.push(`${result.slowRequests.length} slow request(s) (>${this.SLOW_REQUEST_THRESHOLD}ms)`);
            for (const slow of result.slowRequests.slice(0, 3)) {
                result.issues.push(`  - ${slow.url.substring(0, 50)}... (${slow.duration}ms)`);
            }
        }

        // Check for large responses
        if (result.largeResponses.length > 0) {
            result.issues.push(`${result.largeResponses.length} large response(s) (>1MB)`);
        }

        // Check for CORS errors
        const corsErrors = result.failedRequests.filter(r =>
            r.failureReason?.includes('CORS') || r.failureReason?.includes('cross-origin')
        );
        if (corsErrors.length > 0) {
            result.passed = false;
            result.issues.push(`${corsErrors.length} CORS error(s)`);
        }

        // Check for mixed content
        const mixedContent = this.networkLogs.filter(r =>
            r.url.startsWith('http://') && !r.url.includes('localhost')
        );
        if (mixedContent.length > 0) {
            result.issues.push(`${mixedContent.length} insecure (HTTP) request(s)`);
        }

        // Calculate performance metrics
        const apiCalls = this.networkLogs.filter(r => 
            r.resourceType === 'fetch' || r.resourceType === 'xhr'
        );
        if (apiCalls.length > 0) {
            const avgDuration = apiCalls.reduce((sum, r) => sum + r.duration, 0) / apiCalls.length;
            if (avgDuration > 1000) {
                result.issues.push(`Average API response time is slow: ${Math.round(avgDuration)}ms`);
            }
        }

        // Log results
        this.log(`\n📊 Network Test Results:`);
        this.log(`   Total requests: ${result.totalRequests}`);
        this.log(`   Failed: ${result.failedRequests.length}`);
        this.log(`   Slow: ${result.slowRequests.length}`);
        this.log(`   Large: ${result.largeResponses.length}`);
        this.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

        return result;
    }

    /**
     * Get all console logs
     */
    getConsoleLogs(): ConsoleLogEntry[] {
        return this.consoleLogs;
    }

    /**
     * Get all network logs
     */
    getNetworkLogs(): NetworkLogEntry[] {
        return this.networkLogs;
    }

    /**
     * Generate console log report HTML
     */
    generateConsoleReport(): string {
        const errors = this.consoleLogs.filter(l => l.type === 'error');
        const warnings = this.consoleLogs.filter(l => l.type === 'warn');
        const infos = this.consoleLogs.filter(l => l.type === 'info' || l.type === 'log');

        return `
<div class="section">
    <h2>🖥️ Console Log Analysis</h2>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value" style="color: var(--error)">${errors.length}</div>
            <div class="stat-label">Errors</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--warning)">${warnings.length}</div>
            <div class="stat-label">Warnings</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${infos.length}</div>
            <div class="stat-label">Info/Log</div>
        </div>
    </div>

    ${errors.length > 0 ? `
    <h3>❌ Errors</h3>
    <table>
        <thead><tr><th>Message</th><th>Source</th><th>Time</th></tr></thead>
        <tbody>
            ${errors.map(e => `
                <tr>
                    <td style="color: var(--error)">${this.escapeHtml(e.message.substring(0, 100))}</td>
                    <td>${e.url || '-'}</td>
                    <td>${e.timestamp.toLocaleTimeString()}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<p style="color: var(--success)">✅ No console errors detected</p>'}

    ${warnings.length > 0 ? `
    <h3>⚠️ Warnings</h3>
    <table>
        <thead><tr><th>Message</th><th>Source</th></tr></thead>
        <tbody>
            ${warnings.slice(0, 20).map(w => `
                <tr>
                    <td style="color: var(--warning)">${this.escapeHtml(w.message.substring(0, 100))}</td>
                    <td>${w.url || '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}
</div>`;
    }

    /**
     * Generate network log report HTML
     */
    generateNetworkReport(): string {
        const failed = this.networkLogs.filter(r => r.failed || r.status >= 400);
        const slow = this.networkLogs.filter(r => r.duration > this.SLOW_REQUEST_THRESHOLD);
        const successful = this.networkLogs.filter(r => !r.failed && r.status < 400);

        const totalSize = this.networkLogs.reduce((sum, r) => sum + r.responseSize, 0);
        const avgDuration = this.networkLogs.length > 0 
            ? Math.round(this.networkLogs.reduce((sum, r) => sum + r.duration, 0) / this.networkLogs.length)
            : 0;

        return `
<div class="section">
    <h2>🌐 Network Log Analysis</h2>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${this.networkLogs.length}</div>
            <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--error)">${failed.length}</div>
            <div class="stat-label">Failed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--warning)">${slow.length}</div>
            <div class="stat-label">Slow (&gt;3s)</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avgDuration}ms</div>
            <div class="stat-label">Avg Response</div>
        </div>
    </div>

    <p>📦 Total data transferred: ${this.formatBytes(totalSize)}</p>

    ${failed.length > 0 ? `
    <h3>❌ Failed Requests</h3>
    <table>
        <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Reason</th></tr></thead>
        <tbody>
            ${failed.map(r => `
                <tr>
                    <td><span class="method-badge">${r.method}</span></td>
                    <td>${this.escapeHtml(r.url.substring(0, 60))}...</td>
                    <td style="color: var(--error)">${r.status || 'N/A'}</td>
                    <td>${r.failureReason || r.statusText || '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<p style="color: var(--success)">✅ No failed requests detected</p>'}

    ${slow.length > 0 ? `
    <h3>🐌 Slow Requests (&gt;3s)</h3>
    <table>
        <thead><tr><th>Method</th><th>URL</th><th>Duration</th><th>Size</th></tr></thead>
        <tbody>
            ${slow.map(r => `
                <tr>
                    <td><span class="method-badge">${r.method}</span></td>
                    <td>${this.escapeHtml(r.url.substring(0, 60))}...</td>
                    <td style="color: var(--warning)">${r.duration}ms</td>
                    <td>${this.formatBytes(r.responseSize)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}

    <h3>📊 Request Types</h3>
    <table>
        <thead><tr><th>Type</th><th>Count</th><th>Avg Duration</th></tr></thead>
        <tbody>
            ${this.getRequestTypeStats().map(stat => `
                <tr>
                    <td>${stat.type}</td>
                    <td>${stat.count}</td>
                    <td>${stat.avgDuration}ms</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</div>`;
    }

    private getRequestTypeStats(): { type: string; count: number; avgDuration: number }[] {
        const typeMap = new Map<string, { total: number; count: number }>();
        
        for (const log of this.networkLogs) {
            const current = typeMap.get(log.resourceType) || { total: 0, count: 0 };
            current.total += log.duration;
            current.count++;
            typeMap.set(log.resourceType, current);
        }

        return Array.from(typeMap.entries()).map(([type, data]) => ({
            type,
            count: data.count,
            avgDuration: Math.round(data.total / data.count)
        }));
    }

    private mapConsoleType(type: string): ConsoleLogEntry['type'] {
        const typeMap: Record<string, ConsoleLogEntry['type']> = {
            'log': 'log',
            'info': 'info',
            'warning': 'warn',
            'error': 'error',
            'debug': 'debug',
            'trace': 'trace'
        };
        return typeMap[type] || 'log';
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

