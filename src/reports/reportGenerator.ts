import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    ProjectInfo,
    TestCase,
    TestResult,
    TestReport,
    ReportSummary,
    CategoryReport,
    SecurityFinding,
    PerformanceMetrics,
    TestCategory,
    TestStatus
} from '../types';

export interface ReportGeneratorOptions {
    projectInfo?: ProjectInfo | null;
    tests: TestCase[];
    results: TestResult[];
    format: 'html' | 'json' | 'both';
}

/**
 * Generates comprehensive test reports
 */
export class ReportGenerator {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async generate(options: ReportGeneratorOptions): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }

        const reportsDir = path.join(workspaceFolders[0].uri.fsPath, '.testfox', 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const report = this.buildReport(options);

        let outputPath = '';

        if (options.format === 'html' || options.format === 'both') {
            outputPath = path.join(reportsDir, `testfox-report-${timestamp}.html`);
            const html = this.generateHtml(report);
            fs.writeFileSync(outputPath, html, 'utf-8');
        }

        if (options.format === 'json' || options.format === 'both') {
            const jsonPath = path.join(reportsDir, `testfox-report-${timestamp}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
            if (options.format === 'json') {
                outputPath = jsonPath;
            }
        }

        return outputPath;
    }

    private buildReport(options: ReportGeneratorOptions): TestReport {
        const { tests, results } = options;
        const resultsMap = new Map(results.map(r => [r.testId, r]));

        // Build summary
        const summary = this.buildSummary(tests, resultsMap);

        // Build category reports
        const categories = this.buildCategoryReports(tests, resultsMap);

        // Extract security findings
        const securityFindings = this.extractSecurityFindings(tests, resultsMap);

        // Build performance metrics
        const performanceMetrics = this.buildPerformanceMetrics(tests, resultsMap);

        // Generate recommendations
        const recommendations = this.generateRecommendations(summary, securityFindings, categories);

        return {
            projectInfo: options.projectInfo || undefined,
            generatedAt: new Date(),
            summary,
            categories,
            securityFindings,
            performanceMetrics,
            recommendations
        };
    }

    private buildSummary(tests: TestCase[], results: Map<string, TestResult>): ReportSummary {
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        let notTested = 0;
        let manualPassed = 0;
        let manualFailed = 0;
        let totalDuration = 0;

        for (const test of tests) {
            const result = results.get(test.id);
            const status = result?.status || 'pending';

            if (result?.duration) {
                totalDuration += result.duration;
            }

            switch (status) {
                case 'passed':
                    passed++;
                    break;
                case 'failed':
                    failed++;
                    break;
                case 'skipped':
                    skipped++;
                    break;
                case 'not_tested':
                case 'pending':
                    notTested++;
                    break;
                case 'manual_pass':
                    manualPassed++;
                    break;
                case 'manual_fail':
                    manualFailed++;
                    break;
            }
        }

        const totalTests = tests.length;
        const passRate = totalTests > 0 
            ? ((passed + manualPassed) / totalTests) * 100 
            : 0;

        return {
            totalTests,
            passed,
            failed,
            skipped,
            notTested,
            manualPassed,
            manualFailed,
            passRate: Math.round(passRate * 100) / 100,
            duration: totalDuration
        };
    }

    private buildCategoryReports(tests: TestCase[], results: Map<string, TestResult>): CategoryReport[] {
        const categoryMap = new Map<TestCategory, TestCase[]>();

        for (const test of tests) {
            const existing = categoryMap.get(test.category) || [];
            existing.push(test);
            categoryMap.set(test.category, existing);
        }

        const reports: CategoryReport[] = [];

        for (const [category, categoryTests] of categoryMap) {
            let passed = 0;
            let failed = 0;
            let skipped = 0;

            const testResults = categoryTests.map(test => {
                const result = results.get(test.id) || {
                    testId: test.id,
                    status: 'pending' as TestStatus,
                    timestamp: new Date()
                };

                if (result.status === 'passed' || result.status === 'manual_pass') {
                    passed++;
                } else if (result.status === 'failed' || result.status === 'manual_fail') {
                    failed++;
                } else if (result.status === 'skipped') {
                    skipped++;
                }

                return { test, result };
            });

            reports.push({
                category,
                total: categoryTests.length,
                passed,
                failed,
                skipped,
                tests: testResults
            });
        }

        return reports.sort((a, b) => a.category.localeCompare(b.category));
    }

    private extractSecurityFindings(tests: TestCase[], results: Map<string, TestResult>): SecurityFinding[] {
        const findings: SecurityFinding[] = [];
        const securityTests = tests.filter(t => t.category === 'security');

        for (const test of securityTests) {
            const result = results.get(test.id);
            
            if (result?.status === 'failed' && test.securityType) {
                findings.push({
                    severity: test.priority === 'critical' ? 'critical' : 
                             test.priority === 'high' ? 'high' : 'medium',
                    type: test.securityType,
                    title: test.name,
                    description: test.description,
                    location: test.targetElement?.path,
                    recommendation: this.getSecurityRecommendation(test.securityType),
                    evidence: result.error
                });
            }
        }

        // Sort by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    }

    private getSecurityRecommendation(type: string): string {
        const recommendations: Record<string, string> = {
            'sql_injection': 'Use parameterized queries or prepared statements. Never concatenate user input into SQL queries.',
            'xss': 'Encode all user-supplied output. Implement Content Security Policy headers.',
            'csrf': 'Implement CSRF tokens for all state-changing operations.',
            'auth_bypass': 'Review authentication logic. Ensure all protected routes check authentication.',
            'security_headers': 'Configure security headers: X-Content-Type-Options, X-Frame-Options, CSP, HSTS.',
            'sensitive_data': 'Remove sensitive data from API responses. Use encryption for sensitive data.',
            'session_management': 'Use secure session configuration. Regenerate session IDs after login.',
            'input_validation': 'Validate all input on the server side. Use whitelisting over blacklisting.',
            'broken_access_control': 'Implement proper access control checks. Follow principle of least privilege.'
        };

        return recommendations[type] || 'Review and remediate the identified vulnerability.';
    }

    private buildPerformanceMetrics(tests: TestCase[], results: Map<string, TestResult>): PerformanceMetrics {
        const perfTests = tests.filter(t => t.category === 'performance');
        const responseTimes: number[] = [];
        const endpointMetrics: Map<string, { times: number[]; errors: number }> = new Map();

        for (const test of perfTests) {
            const result = results.get(test.id);
            if (result?.duration) {
                responseTimes.push(result.duration);
            }

            if (test.targetElement?.path) {
                const key = `${test.targetElement.method || 'GET'} ${test.targetElement.path}`;
                const existing = endpointMetrics.get(key) || { times: [], errors: 0 };
                if (result?.duration) {
                    existing.times.push(result.duration);
                }
                if (result?.status === 'failed') {
                    existing.errors++;
                }
                endpointMetrics.set(key, existing);
            }
        }

        // Calculate percentiles
        const sortedTimes = [...responseTimes].sort((a, b) => a - b);
        const p95Index = Math.floor(sortedTimes.length * 0.95);
        const p99Index = Math.floor(sortedTimes.length * 0.99);

        return {
            averageResponseTime: responseTimes.length > 0 
                ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) 
                : 0,
            maxResponseTime: Math.max(...responseTimes, 0),
            minResponseTime: Math.min(...responseTimes, Infinity) === Infinity ? 0 : Math.min(...responseTimes),
            p95ResponseTime: sortedTimes[p95Index] || 0,
            p99ResponseTime: sortedTimes[p99Index] || 0,
            throughput: perfTests.length,
            errorRate: perfTests.filter(t => results.get(t.id)?.status === 'failed').length / perfTests.length * 100 || 0,
            endpoints: Array.from(endpointMetrics.entries()).map(([key, data]) => {
                const [method, path] = key.split(' ');
                return {
                    path,
                    method: method as any,
                    averageTime: data.times.length > 0 
                        ? Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length)
                        : 0,
                    maxTime: Math.max(...data.times, 0),
                    minTime: Math.min(...data.times, 0),
                    requestCount: data.times.length,
                    errorCount: data.errors
                };
            })
        };
    }

    private generateRecommendations(
        summary: ReportSummary, 
        securityFindings: SecurityFinding[], 
        categories: CategoryReport[]
    ): string[] {
        const recommendations: string[] = [];

        // Pass rate recommendations
        if (summary.passRate < 70) {
            recommendations.push('Critical: Pass rate is below 70%. Address failing tests before release.');
        } else if (summary.passRate < 90) {
            recommendations.push('Pass rate is below 90%. Review and fix failing tests.');
        }

        // Untested recommendations
        if (summary.notTested > 0) {
            recommendations.push(`${summary.notTested} tests have not been executed. Complete all test execution.`);
        }

        // Security recommendations
        const criticalFindings = securityFindings.filter(f => f.severity === 'critical');
        if (criticalFindings.length > 0) {
            recommendations.push(`CRITICAL: ${criticalFindings.length} critical security vulnerabilities found. Fix immediately.`);
        }

        const highFindings = securityFindings.filter(f => f.severity === 'high');
        if (highFindings.length > 0) {
            recommendations.push(`${highFindings.length} high-severity security issues require attention.`);
        }

        // Category-specific recommendations
        for (const category of categories) {
            if (category.failed > 0 && category.category === 'smoke') {
                recommendations.push('Smoke tests failing. Basic functionality may be broken.');
            }
            if (category.failed > 0 && category.category === 'api') {
                recommendations.push(`${category.failed} API tests failing. Review API functionality.`);
            }
        }

        // Manual test recommendations
        if (summary.notTested > summary.totalTests * 0.2) {
            recommendations.push('More than 20% of tests are pending. Accelerate test execution.');
        }

        if (recommendations.length === 0) {
            recommendations.push('All tests passing. Application ready for release.');
        }

        return recommendations;
    }

    private generateHtml(report: TestReport): string {
        const passedColor = '#00d9a0';
        const failedColor = '#ff4757';
        const pendingColor = '#ffc107';
        const skippedColor = '#95a5a6';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Report - ${new Date().toLocaleDateString()}</title>
    <style>
        :root {
            --bg-primary: #1a1a2e;
            --bg-secondary: #16213e;
            --bg-card: #0f3460;
            --text-primary: #eaeaea;
            --text-secondary: #a0a0a0;
            --accent: #e94560;
            --success: ${passedColor};
            --warning: ${pendingColor};
            --danger: ${failedColor};
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 40px;
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 50px;
            padding-bottom: 30px;
            border-bottom: 2px solid rgba(255,255,255,0.1);
        }

        .header h1 {
            font-size: 3rem;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent), #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }

        .header h1::before {
            content: "🦊 ";
            -webkit-text-fill-color: initial;
        }

        .header .meta {
            color: var(--text-secondary);
            font-size: 1rem;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .stat-card {
            background: var(--bg-card);
            padding: 24px;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .stat-card .value {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .stat-card .label {
            color: var(--text-secondary);
            text-transform: uppercase;
            font-size: 0.8rem;
            letter-spacing: 1px;
        }

        .stat-card.passed .value { color: var(--success); }
        .stat-card.failed .value { color: var(--danger); }
        .stat-card.pending .value { color: var(--warning); }

        .section {
            background: var(--bg-card);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .section h2 {
            font-size: 1.5rem;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .category-table {
            width: 100%;
            border-collapse: collapse;
        }

        .category-table th,
        .category-table td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .category-table th {
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.8rem;
        }

        .category-name {
            font-weight: 600;
            text-transform: capitalize;
        }

        .progress-bar {
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
            min-width: 100px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--success), #00ff88);
            border-radius: 4px;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
        }

        .badge.passed { background: rgba(0,217,160,0.2); color: var(--success); }
        .badge.failed { background: rgba(255,71,87,0.2); color: var(--danger); }
        .badge.pending { background: rgba(255,193,7,0.2); color: var(--warning); }
        .badge.critical { background: rgba(255,71,87,0.3); color: #ff6b6b; }
        .badge.high { background: rgba(255,107,107,0.2); color: #ff8585; }
        .badge.medium { background: rgba(255,193,7,0.2); color: var(--warning); }

        .security-finding {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
            border-left: 4px solid var(--danger);
        }

        .security-finding.critical { border-left-color: #ff4757; }
        .security-finding.high { border-left-color: #ff6b6b; }
        .security-finding.medium { border-left-color: #ffc107; }

        .security-finding h4 {
            font-size: 1.1rem;
            margin-bottom: 10px;
        }

        .security-finding p {
            color: var(--text-secondary);
            margin-bottom: 10px;
        }

        .recommendation-list {
            list-style: none;
        }

        .recommendation-list li {
            padding: 16px;
            margin-bottom: 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }

        .recommendation-list li::before {
            content: "💡";
            font-size: 1.2rem;
        }

        .recommendation-list li.critical::before {
            content: "🚨";
        }

        .chart-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 30px;
        }

        .pie-chart {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: conic-gradient(
                ${passedColor} 0% ${report.summary.passRate}%,
                ${failedColor} ${report.summary.passRate}% ${report.summary.passRate + (report.summary.failed / report.summary.totalTests * 100)}%,
                ${pendingColor} ${report.summary.passRate + (report.summary.failed / report.summary.totalTests * 100)}% 100%
            );
            position: relative;
        }

        .pie-chart::after {
            content: '${Math.round(report.summary.passRate)}%';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 2rem;
            font-weight: 700;
            color: var(--text-primary);
            background: var(--bg-card);
            width: 120px;
            height: 120px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .legend {
            display: flex;
            gap: 20px;
            justify-content: center;
            margin-top: 20px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }

        .test-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .test-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .test-item:hover {
            background: rgba(255,255,255,0.03);
        }

        .test-name {
            flex: 1;
        }

        .test-duration {
            color: var(--text-secondary);
            font-size: 0.85rem;
            margin-right: 12px;
        }

        .footer {
            text-align: center;
            padding: 40px;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        @media print {
            body {
                background: white;
                color: #333;
            }
            .section {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>TestFox Report</h1>
            <p class="meta">
                Generated: ${report.generatedAt.toLocaleString()}<br>
                ${report.projectInfo ? `Project: ${report.projectInfo.framework || report.projectInfo.type} (${report.projectInfo.language})` : ''}
            </p>
        </header>

        <div class="summary-grid">
            <div class="stat-card">
                <div class="value">${report.summary.totalTests}</div>
                <div class="label">Total Tests</div>
            </div>
            <div class="stat-card passed">
                <div class="value">${report.summary.passed + report.summary.manualPassed}</div>
                <div class="label">Passed</div>
            </div>
            <div class="stat-card failed">
                <div class="value">${report.summary.failed + report.summary.manualFailed}</div>
                <div class="label">Failed</div>
            </div>
            <div class="stat-card pending">
                <div class="value">${report.summary.notTested + report.summary.skipped}</div>
                <div class="label">Pending</div>
            </div>
            <div class="stat-card passed">
                <div class="value">${report.summary.passRate}%</div>
                <div class="label">Pass Rate</div>
            </div>
            <div class="stat-card">
                <div class="value">${(report.summary.duration / 1000).toFixed(1)}s</div>
                <div class="label">Duration</div>
            </div>
        </div>

        <div class="section">
            <h2>📊 Test Results by Category</h2>
            <div class="chart-container">
                <div>
                    <div class="pie-chart"></div>
                    <div class="legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${passedColor}"></div>
                            <span>Passed</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${failedColor}"></div>
                            <span>Failed</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${pendingColor}"></div>
                            <span>Pending</span>
                        </div>
                    </div>
                </div>
            </div>
            <table class="category-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th>Total</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Pass Rate</th>
                        <th>Progress</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.categories.map(cat => {
                        const passRate = cat.total > 0 ? (cat.passed / cat.total * 100) : 0;
                        return `
                        <tr>
                            <td class="category-name">${this.formatCategoryName(cat.category)}</td>
                            <td>${cat.total}</td>
                            <td><span class="badge passed">${cat.passed}</span></td>
                            <td><span class="badge ${cat.failed > 0 ? 'failed' : ''}">${cat.failed}</span></td>
                            <td>${passRate.toFixed(1)}%</td>
                            <td>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${passRate}%"></div>
                                </div>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>

        ${report.securityFindings.length > 0 ? `
        <div class="section">
            <h2>🛡️ Security Findings</h2>
            ${report.securityFindings.map(finding => `
                <div class="security-finding ${finding.severity}">
                    <h4>
                        <span class="badge ${finding.severity}">${finding.severity.toUpperCase()}</span>
                        ${finding.title}
                    </h4>
                    <p>${finding.description}</p>
                    ${finding.location ? `<p><strong>Location:</strong> ${finding.location}</p>` : ''}
                    <p><strong>Recommendation:</strong> ${finding.recommendation}</p>
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${report.performanceMetrics.endpoints.length > 0 ? `
        <div class="section">
            <h2>⚡ Performance Metrics</h2>
            <div class="summary-grid" style="margin-bottom: 20px;">
                <div class="stat-card">
                    <div class="value">${report.performanceMetrics.averageResponseTime}ms</div>
                    <div class="label">Avg Response</div>
                </div>
                <div class="stat-card">
                    <div class="value">${report.performanceMetrics.p95ResponseTime}ms</div>
                    <div class="label">P95 Response</div>
                </div>
                <div class="stat-card">
                    <div class="value">${report.performanceMetrics.errorRate.toFixed(1)}%</div>
                    <div class="label">Error Rate</div>
                </div>
            </div>
            <table class="category-table">
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>Method</th>
                        <th>Avg Time</th>
                        <th>Max Time</th>
                        <th>Requests</th>
                        <th>Errors</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.performanceMetrics.endpoints.map(ep => `
                    <tr>
                        <td>${ep.path}</td>
                        <td>${ep.method}</td>
                        <td>${ep.averageTime}ms</td>
                        <td>${ep.maxTime}ms</td>
                        <td>${ep.requestCount}</td>
                        <td>${ep.errorCount}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="section">
            <h2>💡 Recommendations</h2>
            <ul class="recommendation-list">
                ${report.recommendations.map(rec => `
                    <li class="${rec.toLowerCase().includes('critical') ? 'critical' : ''}">${rec}</li>
                `).join('')}
            </ul>
        </div>

        ${report.categories.filter(c => c.failed > 0).map(cat => `
        <div class="section">
            <h2>❌ Failed Tests - ${this.formatCategoryName(cat.category)}</h2>
            <div class="test-list">
                ${cat.tests.filter(t => t.result.status === 'failed' || t.result.status === 'manual_fail').map(t => `
                    <div class="test-item">
                        <span class="test-name">${t.test.name}</span>
                        ${t.result.duration ? `<span class="test-duration">${t.result.duration}ms</span>` : ''}
                        <span class="badge failed">Failed</span>
                    </div>
                    ${t.result.error ? `<div style="padding: 8px 16px; color: var(--text-secondary); font-size: 0.9rem; background: rgba(255,71,87,0.1); margin: 0 0 8px 0; border-radius: 4px;">${t.result.error}</div>` : ''}
                `).join('')}
            </div>
        </div>
        `).join('')}

        <footer class="footer">
            <p>Generated by TestFox 🦊</p>
            <p>The Final Quality Gate for Your Application</p>
        </footer>
    </div>
</body>
</html>`;
    }

    private formatCategoryName(category: string): string {
        return category
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
}

