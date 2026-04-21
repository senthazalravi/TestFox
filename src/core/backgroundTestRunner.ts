import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Background Test Runner - Runs tests automatically and generates reports
 */
export interface BackgroundTestOptions {
    context: vscode.ExtensionContext;
    commitHash: string;
    isFullCycle: boolean;
    outputChannel: vscode.OutputChannel;
    onProgress?: (progress: { completed: number; total: number; currentTest?: string }) => void;
    onComplete?: (result: BackgroundTestResult) => void;
}

export interface BackgroundTestResult {
    commitHash: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    reportPath: string | null;
    timestamp: Date;
}

/**
 * Run background tests
 */
export async function runBackgroundTests(options: BackgroundTestOptions): Promise<void> {
    const { context, commitHash, isFullCycle, outputChannel, onProgress, onComplete } = options;
    
    const startTime = Date.now();
    outputChannel.appendLine(`\n🚀 Starting background test run for commit ${commitHash.substring(0, 7)}`);
    outputChannel.appendLine(`   Mode: ${isFullCycle ? 'Full Cycle' : 'Quick Test'}`);
    outputChannel.appendLine(`   Time: ${new Date().toLocaleString()}`);
    outputChannel.appendLine('');

    try {
        // Get test store and run tests
        const { TestStore } = require('../store/testStore');
        const { TestRunner } = require('../runners/testRunner');
        const { AppRunner } = require('../core/appRunner');

        // Initialize components - pass context to TestStore
        const testStore = new TestStore(context);
        const appRunner = new AppRunner();
        const testRunner = new TestRunner(appRunner, testStore);

        // Ensure application is running
        outputChannel.appendLine('📱 Checking application status...');
        const appUrl = await ensureApplicationRunning(appRunner, testStore, outputChannel);
        
        if (!appUrl) {
            throw new Error('Application is not running and could not be started');
        }

        outputChannel.appendLine(`✅ Application running at ${appUrl}`);

        // Get all tests or filter based on mode
        let tests = testStore.getAllTests();
        
        if (!isFullCycle) {
            // For quick test, only run smoke tests and high priority tests
            tests = tests.filter((t: any) => 
                t.category === 'smoke' || 
                t.priority === 'critical' || 
                t.priority === 'high'
            );
        }

        const totalTests = tests.length;
        outputChannel.appendLine(`🧪 Running ${totalTests} tests...\n`);

        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const results: any[] = [];

        // Run tests sequentially
        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            const progress = {
                completed: i,
                total: totalTests,
                currentTest: test.name
            };

            outputChannel.appendLine(`[${i + 1}/${totalTests}] Running: ${test.name}`);
            
            // Report progress
            onProgress?.(progress);

            try {
                const result = await testRunner.runTest(test, appUrl);
                results.push(result);
                
                if (result.status === 'passed') {
                    passed++;
                    outputChannel.appendLine(`   ✅ PASSED`);
                } else if (result.status === 'failed') {
                    failed++;
                    outputChannel.appendLine(`   ❌ FAILED: ${result.error || 'Unknown error'}`);
                } else {
                    skipped++;
                    outputChannel.appendLine(`   ⏭️ SKIPPED`);
                }
            } catch (error: any) {
                failed++;
                outputChannel.appendLine(`   ❌ ERROR: ${error.message}`);
                results.push({
                    testId: test.id,
                    status: 'error',
                    error: error.message
                });
            }

            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Calculate duration
        const duration = Date.now() - startTime;

        // Generate report
        outputChannel.appendLine('\n📝 Generating report...');
        const reportPath = await generateReport({
            commitHash,
            tests,
            results,
            total: totalTests,
            passed,
            failed,
            skipped,
            duration,
            timestamp: new Date()
        }, outputChannel);

        // Create result object
        const result: BackgroundTestResult = {
            commitHash,
            total: totalTests,
            passed,
            failed,
            skipped,
            duration,
            reportPath,
            timestamp: new Date()
        };

        // Save test run data
        await saveTestRun(result, results);

        outputChannel.appendLine('\n✅ Background test run complete!');
        outputChannel.appendLine(`   Duration: ${formatDuration(duration)}`);
        outputChannel.appendLine(`   Pass Rate: ${Math.round((passed / totalTests) * 100)}%`);
        if (reportPath) {
            outputChannel.appendLine(`   Report: ${reportPath}`);
        }

        // Call completion callback
        onComplete?.(result);

    } catch (error: any) {
        outputChannel.appendLine(`\n❌ Background test run failed: ${error.message}`);
        throw error;
    }
}

/**
 * Ensure application is running
 */
async function ensureApplicationRunning(
    appRunner: any, 
    testStore: any, 
    outputChannel: vscode.OutputChannel
): Promise<string | null> {
    const axios = require('axios').default;
    const portsToCheck = [3000, 5173, 8080, 4200, 5000, 8000, 4000];

    // Check if app is already running
    for (const port of portsToCheck) {
        try {
            const url = `http://localhost:${port}`;
            await axios.get(url, { timeout: 2000, validateStatus: () => true });
            return url;
        } catch (e) {
            // Continue checking
        }
    }

    // Try to start application
    outputChannel.appendLine('📱 Starting application...');
    
    const projectInfo = testStore.getProjectInfo();
    if (!projectInfo) {
        outputChannel.appendLine('❌ No project info available. Please analyze project first.');
        return null;
    }

    try {
        await appRunner.start(projectInfo);
        
        // Wait for app to be ready
        outputChannel.appendLine('⏳ Waiting for application to be ready...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verify it's running
        for (const port of portsToCheck) {
            try {
                const url = `http://localhost:${port}`;
                await axios.get(url, { timeout: 2000, validateStatus: () => true });
                return url;
            } catch (e) {
                // Continue checking
            }
        }
        
        return null;
    } catch (error: any) {
        outputChannel.appendLine(`❌ Failed to start application: ${error.message}`);
        return null;
    }
}

/**
 * Generate HTML report
 */
async function generateReport(
    data: {
        commitHash: string;
        tests: any[];
        results: any[];
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
        timestamp: Date;
    },
    outputChannel: vscode.OutputChannel
): Promise<string | null> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const reportsDir = path.join(workspacePath, '.testfox', 'reports');
        
        // Create reports directory if needed
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFileName = `test-report-${data.commitHash.substring(0, 7)}-${timestamp}.html`;
        const reportPath = path.join(reportsDir, reportFileName);

        const passRate = Math.round((data.passed / data.total) * 100);
        const statusColor = data.failed === 0 ? '#22c55e' : data.failed > data.total * 0.3 ? '#ef4444' : '#f59e0b';
        const statusText = data.failed === 0 ? 'PASSED' : data.failed > data.total * 0.3 ? 'FAILED' : 'PARTIAL';

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestFox Background Test Report</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            text-align: center;
            padding: 30px;
            background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%);
            border-radius: 15px;
            margin-bottom: 30px;
        }
        .header h1 { color: white; margin-bottom: 10px; font-size: 2.5em; }
        .header p { color: rgba(255,255,255,0.9); font-size: 1.1em; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.05);
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .stat-card .value { 
            font-size: 3em; 
            font-weight: bold; 
            color: ${statusColor};
        }
        .stat-card .label { color: #94a3b8; margin-top: 5px; font-size: 0.9em; }
        .test-list {
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            padding: 25px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .test-list h2 {
            color: #e2e8f0;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .test-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px;
            margin-bottom: 10px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border-left: 4px solid #64748b;
        }
        .test-item.passed { border-left-color: #22c55e; }
        .test-item.failed { border-left-color: #ef4444; }
        .test-item.skipped { border-left-color: #94a3b8; }
        .test-name { flex: 1; }
        .test-name h4 { color: #e2e8f0; margin-bottom: 5px; }
        .test-name p { color: #94a3b8; font-size: 0.9em; }
        .test-status {
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.85em;
        }
        .test-status.passed { background: rgba(34,197,94,0.2); color: #22c55e; }
        .test-status.failed { background: rgba(239,68,68,0.2); color: #ef4444; }
        .test-status.skipped { background: rgba(148,163,184,0.2); color: #94a3b8; }
        .footer {
            text-align: center;
            padding: 30px;
            color: #64748b;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 30px;
        }
        .commit-info {
            background: rgba(255,255,255,0.05);
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-family: monospace;
            font-size: 0.9em;
        }
        .commit-info span { color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦊 TestFox Background Test Report</h1>
            <p>Commit: ${data.commitHash.substring(0, 7)} | ${statusText} | ${formatDuration(data.duration)}</p>
            <p style="margin-top: 10px;">Generated: ${data.timestamp.toLocaleString()}</p>
        </div>

        <div class="commit-info">
            <span>Commit:</span> ${data.commitHash}<br>
            <span>Duration:</span> ${formatDuration(data.duration)}<br>
            <span>Tests:</span> ${data.total} total
        </div>

        <div class="summary">
            <div class="stat-card">
                <div class="value">${data.total}</div>
                <div class="label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="value" style="color: #22c55e;">${data.passed}</div>
                <div class="label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="value" style="color: #ef4444;">${data.failed}</div>
                <div class="label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="value" style="color: #f59e0b;">${data.skipped}</div>
                <div class="label">Skipped</div>
            </div>
            <div class="stat-card">
                <div class="value">${passRate}%</div>
                <div class="label">Pass Rate</div>
            </div>
        </div>

        <div class="test-list">
            <h2>Test Results</h2>
            ${data.tests.map((test: any, index: number) => {
                const result = data.results[index];
                const status = result?.status || 'skipped';
                const statusClass = status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'skipped';
                return `
                <div class="test-item ${statusClass}">
                    <div class="test-name">
                        <h4>${test.name}</h4>
                        <p>${test.description}</p>
                    </div>
                    <div class="test-status ${statusClass}">${status.toUpperCase()}</div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="footer">
            <p>🦊 TestFox - Automated Background Testing</p>
            <p>End-to-end testing within your IDE</p>
        </div>
    </div>
</body>
</html>`;

        fs.writeFileSync(reportPath, html);
        outputChannel.appendLine(`✅ Report generated: ${reportPath}`);
        
        return reportPath;
    } catch (error: any) {
        outputChannel.appendLine(`❌ Failed to generate report: ${error.message}`);
        return null;
    }
}

/**
 * Save test run data
 */
async function saveTestRun(
    result: BackgroundTestResult,
    testResults: any[]
): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const dataDir = path.join(workspacePath, '.testfox', 'data');

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const runData = {
            ...result,
            testResults,
            savedAt: new Date().toISOString()
        };

        const fileName = `run-${result.commitHash.substring(0, 7)}-${Date.now()}.json`;
        const filePath = path.join(dataDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(runData, null, 2));
    } catch (error) {
        console.error('Failed to save test run:', error);
    }
}

/**
 * Format duration in ms to human readable
 */
function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
}
