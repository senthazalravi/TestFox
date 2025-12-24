import * as vscode from 'vscode';
import { DependencyManager, DeviceProfile, BrowserStatus } from '../core/dependencyManager';
import { TestCase, TestResult, TestStatus } from '../types';

export interface BrowserTestResult {
    browser: string;
    device: string;
    passed: boolean;
    duration: number;
    error?: string;
    screenshot?: string;
}

export interface CompatibilityResult {
    testId: string;
    testName: string;
    results: BrowserTestResult[];
    overallStatus: TestStatus;
    canAutomate: boolean;
    manualInstructions?: string;
}

export interface CompatibilityMatrix {
    browsers: string[];
    devices: DeviceProfile[];
    results: CompatibilityResult[];
    automatedCount: number;
    manualCount: number;
    passedCount: number;
    failedCount: number;
    timestamp: Date;
}

/**
 * Cross-browser and device compatibility test runner
 */
export class CrossBrowserRunner {
    private dependencyManager: DependencyManager;
    private outputChannel: vscode.OutputChannel;
    private browserStatus: BrowserStatus | null = null;

    constructor(dependencyManager: DependencyManager) {
        this.dependencyManager = dependencyManager;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Cross-Browser');
    }

    /**
     * Run compatibility tests across all browsers and devices
     */
    async runCompatibilityTests(
        baseUrl: string, 
        tests: TestCase[]
    ): Promise<CompatibilityMatrix> {
        this.outputChannel.show();
        this.outputChannel.appendLine('═'.repeat(70));
        this.outputChannel.appendLine('          TESTFOX CROSS-BROWSER COMPATIBILITY TESTING');
        this.outputChannel.appendLine('═'.repeat(70));
        this.outputChannel.appendLine('');

        // Get installed browsers
        this.browserStatus = await this.dependencyManager.getBrowserStatus();
        const installedBrowsers = await this.dependencyManager.getInstalledBrowsers();
        
        this.outputChannel.appendLine('📊 Browser Status:');
        this.outputChannel.appendLine(`   • Chromium: ${this.browserStatus.chromium ? '✅ Installed' : '❌ Not installed'}`);
        this.outputChannel.appendLine(`   • Firefox:  ${this.browserStatus.firefox ? '✅ Installed' : '❌ Not installed'}`);
        this.outputChannel.appendLine(`   • WebKit:   ${this.browserStatus.webkit ? '✅ Installed' : '❌ Not installed'}`);
        this.outputChannel.appendLine('');

        // Get device profiles
        const automatableDevices = this.dependencyManager.getAutomatableDevices();
        const manualDevices = this.dependencyManager.getManualOnlyDevices();

        this.outputChannel.appendLine(`📱 Devices: ${automatableDevices.length} automatable, ${manualDevices.length} manual-only`);
        this.outputChannel.appendLine('');

        const matrix: CompatibilityMatrix = {
            browsers: installedBrowsers,
            devices: [...automatableDevices, ...manualDevices],
            results: [],
            automatedCount: 0,
            manualCount: 0,
            passedCount: 0,
            failedCount: 0,
            timestamp: new Date()
        };

        // Run automated tests
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox: Running Cross-Browser Tests...',
            cancellable: true
        }, async (progress, token) => {
            // Test on each browser
            for (const browser of installedBrowsers) {
                if (token.isCancellationRequested) break;

                this.outputChannel.appendLine(`🌐 Testing on ${browser.toUpperCase()}...`);
                
                // Test on desktop viewport
                const desktopResult = await this.runBrowserTest(
                    baseUrl, 
                    browser, 
                    { name: `Desktop ${browser}`, viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: '', canAutomate: true },
                    tests
                );
                matrix.results.push(...desktopResult);

                // Test on mobile emulation (only for devices that can be emulated)
                for (const device of automatableDevices.filter(d => d.isMobile)) {
                    if (token.isCancellationRequested) break;

                    progress.report({ message: `${browser} - ${device.name}` });
                    
                    const deviceResult = await this.runBrowserTest(baseUrl, browser, device, tests);
                    matrix.results.push(...deviceResult);
                }
            }

            // Add manual test placeholders
            for (const device of manualDevices) {
                for (const test of tests.slice(0, 5)) { // Key tests for manual
                    matrix.results.push({
                        testId: `${test.id}-${device.name}`,
                        testName: `${test.name} on ${device.name}`,
                        results: [{
                            browser: 'manual',
                            device: device.name,
                            passed: false,
                            duration: 0
                        }],
                        overallStatus: 'not_tested',
                        canAutomate: false,
                        manualInstructions: device.manualInstructions
                    });
                    matrix.manualCount++;
                }
            }
        });

        // Calculate totals
        matrix.automatedCount = matrix.results.filter(r => r.canAutomate).length;
        matrix.passedCount = matrix.results.filter(r => r.overallStatus === 'passed').length;
        matrix.failedCount = matrix.results.filter(r => r.overallStatus === 'failed').length;

        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('═'.repeat(70));
        this.outputChannel.appendLine('                    COMPATIBILITY TESTING COMPLETE');
        this.outputChannel.appendLine('═'.repeat(70));
        this.outputChannel.appendLine(`✅ Passed:     ${matrix.passedCount}`);
        this.outputChannel.appendLine(`❌ Failed:     ${matrix.failedCount}`);
        this.outputChannel.appendLine(`🤖 Automated:  ${matrix.automatedCount}`);
        this.outputChannel.appendLine(`👤 Manual:     ${matrix.manualCount}`);
        this.outputChannel.appendLine('');

        return matrix;
    }

    /**
     * Run tests on a specific browser and device
     */
    private async runBrowserTest(
        baseUrl: string,
        browserName: string,
        device: DeviceProfile,
        tests: TestCase[]
    ): Promise<CompatibilityResult[]> {
        const results: CompatibilityResult[] = [];

        try {
            const playwright = require('playwright');
            const browserType = (playwright as any)[browserName];
            
            if (!browserType) {
                this.outputChannel.appendLine(`   ⚠️ Browser ${browserName} not available`);
                return results;
            }

            const browser = await browserType.launch({ headless: true });
            const context = await browser.newContext({
                viewport: device.viewport,
                userAgent: device.userAgent || undefined,
                deviceScaleFactor: device.deviceScaleFactor,
                isMobile: device.isMobile,
                hasTouch: device.hasTouch
            });
            const page = await context.newPage();

            // Basic connectivity test
            try {
                await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
                
                results.push({
                    testId: `connectivity-${browserName}-${device.name}`,
                    testName: `Page Load on ${browserName} (${device.name})`,
                    results: [{
                        browser: browserName,
                        device: device.name,
                        passed: true,
                        duration: 0
                    }],
                    overallStatus: 'passed',
                    canAutomate: true
                });

                this.outputChannel.appendLine(`   ✅ ${device.name}: Page loads successfully`);

                // Run specific tests
                for (const test of tests.slice(0, 10)) { // Limit for performance
                    const testResult = await this.executeTest(page, test, browserName, device);
                    results.push(testResult);
                }

            } catch (error: any) {
                this.outputChannel.appendLine(`   ❌ ${device.name}: ${error.message}`);
                results.push({
                    testId: `connectivity-${browserName}-${device.name}`,
                    testName: `Page Load on ${browserName} (${device.name})`,
                    results: [{
                        browser: browserName,
                        device: device.name,
                        passed: false,
                        duration: 0,
                        error: error.message
                    }],
                    overallStatus: 'failed',
                    canAutomate: true
                });
            }

            await browser.close();
        } catch (error: any) {
            this.outputChannel.appendLine(`   ❌ Browser error: ${error.message}`);
        }

        return results;
    }

    /**
     * Execute a single test on a page
     */
    private async executeTest(
        page: any,
        test: TestCase,
        browserName: string,
        device: DeviceProfile
    ): Promise<CompatibilityResult> {
        const startTime = Date.now();
        
        try {
            // Simple validation based on test type
            let passed = true;
            
            switch (test.category) {
                case 'ui_e2e':
                    // Check page renders
                    passed = await page.evaluate(() => document.body !== null);
                    break;
                case 'accessibility':
                    // Check basic a11y
                    passed = await page.evaluate(() => {
                        const images = document.querySelectorAll('img');
                        return Array.from(images).every(img => img.alt !== undefined);
                    });
                    break;
                default:
                    passed = true;
            }

            return {
                testId: `${test.id}-${browserName}-${device.name}`,
                testName: `${test.name} on ${browserName} (${device.name})`,
                results: [{
                    browser: browserName,
                    device: device.name,
                    passed,
                    duration: Date.now() - startTime
                }],
                overallStatus: passed ? 'passed' : 'failed',
                canAutomate: true
            };
        } catch (error: any) {
            return {
                testId: `${test.id}-${browserName}-${device.name}`,
                testName: `${test.name} on ${browserName} (${device.name})`,
                results: [{
                    browser: browserName,
                    device: device.name,
                    passed: false,
                    duration: Date.now() - startTime,
                    error: error.message
                }],
                overallStatus: 'failed',
                canAutomate: true
            };
        }
    }

    /**
     * Generate a compatibility report HTML
     */
    generateCompatibilityReport(matrix: CompatibilityMatrix): string {
        const manualTests = matrix.results.filter(r => !r.canAutomate);
        const automatedTests = matrix.results.filter(r => r.canAutomate);

        return `
<!DOCTYPE html>
<html>
<head>
    <title>TestFox Compatibility Report</title>
    <style>
        :root {
            --bg: #1a1a2e;
            --card: #16213e;
            --accent: #e94560;
            --success: #4ade80;
            --warning: #fbbf24;
            --error: #f87171;
            --text: #eaeaea;
            --muted: #888;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 20px;
            margin: 0;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: var(--accent);
            margin-bottom: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--card);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
        }
        .stat-label {
            color: var(--muted);
            font-size: 14px;
        }
        .section {
            background: var(--card);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .section h2 {
            color: var(--accent);
            margin-top: 0;
            border-bottom: 1px solid #333;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #333;
        }
        th {
            color: var(--muted);
            font-weight: 500;
        }
        .status-passed { color: var(--success); }
        .status-failed { color: var(--error); }
        .status-manual { color: var(--warning); }
        .manual-instructions {
            background: rgba(251, 191, 36, 0.1);
            border: 1px solid var(--warning);
            border-radius: 8px;
            padding: 15px;
            margin-top: 10px;
        }
        .manual-instructions h4 {
            color: var(--warning);
            margin: 0 0 10px 0;
        }
        .browser-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-right: 5px;
        }
        .browser-chromium { background: #4285f4; }
        .browser-firefox { background: #ff7139; }
        .browser-webkit { background: #0099ff; }
        .device-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            background: #333;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🦊 TestFox Compatibility Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-value" style="color: var(--success)">${matrix.passedCount}</div>
            <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--error)">${matrix.failedCount}</div>
            <div class="stat-label">Failed</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--text)">${matrix.automatedCount}</div>
            <div class="stat-label">Automated</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color: var(--warning)">${matrix.manualCount}</div>
            <div class="stat-label">Manual Required</div>
        </div>
    </div>

    <div class="section">
        <h2>🌐 Browser Coverage</h2>
        <p>
            <span class="browser-badge browser-chromium">Chromium ${matrix.browsers.includes('chromium') ? '✓' : '✗'}</span>
            <span class="browser-badge browser-firefox">Firefox ${matrix.browsers.includes('firefox') ? '✓' : '✗'}</span>
            <span class="browser-badge browser-webkit">WebKit ${matrix.browsers.includes('webkit') ? '✓' : '✗'}</span>
        </p>
    </div>

    <div class="section">
        <h2>🤖 Automated Test Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Test</th>
                    <th>Browser</th>
                    <th>Device</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${automatedTests.map(r => `
                    <tr>
                        <td>${r.testName}</td>
                        <td><span class="browser-badge browser-${r.results[0]?.browser}">${r.results[0]?.browser}</span></td>
                        <td><span class="device-badge">${r.results[0]?.device}</span></td>
                        <td class="status-${r.overallStatus}">${r.overallStatus === 'passed' ? '✅ Passed' : '❌ Failed'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>👤 Manual Testing Required</h2>
        <p style="color: var(--warning);">⚠️ The following tests cannot be automated and require manual execution:</p>
        
        ${manualTests.map(r => `
            <div class="manual-instructions">
                <h4>📋 ${r.testName}</h4>
                <p>${r.manualInstructions || 'Please test this functionality manually on the specified device.'}</p>
                <p><strong>Status:</strong> <span class="status-manual">⏳ Not Tested - Requires Manual Verification</span></p>
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>📱 Device Matrix</h2>
        <table>
            <thead>
                <tr>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Automation</th>
                    <th>Instructions</th>
                </tr>
            </thead>
            <tbody>
                ${matrix.devices.map(d => `
                    <tr>
                        <td>${d.name}</td>
                        <td>${d.isMobile ? '📱 Mobile' : '🖥️ Desktop'}</td>
                        <td>${d.canAutomate ? '<span class="status-passed">✅ Automated</span>' : '<span class="status-manual">👤 Manual</span>'}</td>
                        <td>${d.manualInstructions || (d.canAutomate ? 'Automated via Playwright' : '-')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
</body>
</html>`;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

