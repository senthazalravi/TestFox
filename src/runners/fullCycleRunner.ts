import * as vscode from 'vscode';
import { CredentialDiscovery, DiscoveredCredential, TestAccount } from '../core/credentialDiscovery';
import { SmartBrowserRunner, PageInfo, InteractionResult } from './smartBrowserRunner';
import { ProjectInfo } from '../types';
import { AppRunner } from '../core/appRunner';

export interface FullCycleResult {
    success: boolean;
    startTime: Date;
    endTime: Date;
    duration: number;
    credentialsFound: DiscoveredCredential[];
    loginAttempted: boolean;
    loginSuccessful: boolean;
    pagesVisited: number;
    formsTestedCount: number;
    buttonsClickedCount: number;
    interactions: InteractionResult[];
    pages: PageInfo[];
    errors: string[];
    screenshots: string[];
    // Browser monitoring results
    consoleTestPassed: boolean;
    consoleErrors: number;
    consoleWarnings: number;
    networkTestPassed: boolean;
    networkFailedRequests: number;
    networkSlowRequests: number;
    // Test account management
    testAccountsCreated: TestAccount[];
    testAccountsDeleted: TestAccount[];
    accountCreationAttempts: number;
    accountDeletionAttempts: number;
    testAccountsCleaned: TestAccount[];
    testAccounts: TestAccount[];
}

/**
 * Full Cycle Test Runner - Performs comprehensive automated testing
 * 
 * This runner:
 * 1. Discovers credentials in the codebase
 * 2. Starts the application
 * 3. Attempts to login
 * 4. Explores all pages
 * 5. Tests forms, buttons, and data operations
 * 6. Generates a comprehensive report
 */
export class FullCycleRunner {
    private appRunner: AppRunner;
    private browserRunner: SmartBrowserRunner;
    private credentialDiscovery: CredentialDiscovery;
    private outputChannel: vscode.OutputChannel;
    private workspacePath: string;

    constructor(appRunner: AppRunner) {
        this.appRunner = appRunner;
        this.browserRunner = new SmartBrowserRunner();
        this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.credentialDiscovery = new CredentialDiscovery(this.workspacePath);
        this.outputChannel = vscode.window.createOutputChannel('TestFox Full Cycle');
    }

    /**
     * Run full cycle testing
     */
    async run(projectInfo: ProjectInfo): Promise<FullCycleResult> {
        const startTime = new Date();
        const result: FullCycleResult = {
            success: false,
            startTime,
            endTime: startTime,
            duration: 0,
            credentialsFound: [],
            loginAttempted: false,
            loginSuccessful: false,
            pagesVisited: 0,
            formsTestedCount: 0,
            buttonsClickedCount: 0,
            interactions: [],
            pages: [],
            errors: [],
            screenshots: [],
            consoleTestPassed: true,
            consoleErrors: 0,
            consoleWarnings: 0,
            networkTestPassed: true,
            networkFailedRequests: 0,
            networkSlowRequests: 0,
            testAccountsCreated: [],
            testAccountsDeleted: [],
            accountCreationAttempts: 0,
            accountDeletionAttempts: 0,
            testAccountsCleaned: [],
            testAccounts: []
        };

        this.outputChannel.show();
        this.log('═══════════════════════════════════════════════════');
        this.log('           TESTFOX FULL CYCLE TESTING               ');
        this.log('═══════════════════════════════════════════════════');
        this.log('');

        try {
            // Step 1: Discover credentials
            this.log('🔍 Step 1: Discovering credentials in codebase...');
            result.credentialsFound = await this.credentialDiscovery.discoverCredentials();
            this.log(`   Found ${result.credentialsFound.length} potential credentials`);
            
            for (const cred of result.credentialsFound) {
                this.log(`   • ${cred.email || cred.username || 'Unknown'} (${cred.confidence} confidence) - ${cred.source}`);
            }

            // Step 2: Start the application
            this.log('');
            this.log('🚀 Step 2: Starting application...');
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'TestFox: Starting application...',
                cancellable: false
            }, async () => {
                await this.appRunner.start(projectInfo);
            });

            const appUrl = await this.appRunner.waitForReady(30000);
            if (!appUrl) {
                result.errors.push('Application failed to start or become ready');
                this.log('   ❌ Application failed to start');
                return this.finalize(result);
            }
            this.log(`   ✅ Application running at ${appUrl}`);

            // Step 3: Initialize browser
            this.log('');
            this.log('🌐 Step 3: Initializing browser...');
            const browserInit = await this.browserRunner.initialize(appUrl);
            if (!browserInit) {
                result.errors.push('Failed to initialize browser');
                this.log('   ❌ Failed to initialize browser');
                return this.finalize(result);
            }
            this.log('   ✅ Browser initialized');

            // Step 3.5: Initialize test accounts
            this.log('');
            this.log('👤 Step 3.5: Initializing test accounts...');
            this.browserRunner.initializeTestAccounts(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', [
                'functional', 'ui', 'security', 'performance', 'accessibility'
            ]);

            // Step 3.6: Create test accounts
            this.log('');
            this.log('📝 Step 3.6: Creating test accounts...');
            const createdAccounts = await this.browserRunner.createTestAccounts();
            result.testAccountsCreated = createdAccounts;
            result.accountCreationAttempts = this.browserRunner.getTestAccounts().length;
            this.log(`   ✅ Created ${createdAccounts.length}/${result.accountCreationAttempts} test accounts`);

            // Log created accounts
            for (const account of createdAccounts) {
                this.log(`   • ${account.type}: ${account.email} (${account.testType || 'general'})`);
            }

            // Step 4: Navigate to home
            await this.browserRunner.navigateToHome();
            
            // Take initial screenshot
            const homeScreenshot = await this.browserRunner.takeScreenshot('home');
            if (homeScreenshot) result.screenshots.push(homeScreenshot);

            // Step 5: Attempt login or registration
            this.log('');
            this.log('🔐 Step 4: Attempting login...');
            let bestCredential = this.credentialDiscovery.getBestCredential();
            
            // If no credentials found, create test credentials
            if (!bestCredential) {
                bestCredential = {
                    type: 'test_user',
                    email: `testfox_${Date.now()}@example.com`,
                    password: 'TestFox123!',
                    source: 'generated',
                    confidence: 'high'
                };
                this.log(`   No credentials found - using generated: ${bestCredential.email}`);
            }
            
            result.loginAttempted = true;
            this.log(`   Trying login: ${bestCredential.email}`);
            result.loginSuccessful = await this.browserRunner.attemptLogin(bestCredential);
            
            if (result.loginSuccessful) {
                this.log('   ✅ Login successful!');
                const loginScreenshot = await this.browserRunner.takeScreenshot('post-login');
                if (loginScreenshot) result.screenshots.push(loginScreenshot);
            } else {
                this.log('   ⚠️ Login failed - trying alternative credentials...');
                
                // Try other discovered credentials
                for (const cred of result.credentialsFound.slice(0, 3)) {
                    if (cred === bestCredential) continue;
                    this.log(`   Trying alternative: ${cred.email}`);
                    result.loginSuccessful = await this.browserRunner.attemptLogin(cred);
                    if (result.loginSuccessful) {
                        this.log('   ✅ Login successful with alternative credentials!');
                        break;
                    }
                }
                
                // If still not logged in, try to create an account
                if (!result.loginSuccessful) {
                    this.log('');
                    this.log('📝 Step 4b: Login failed - Attempting to create account...');
                    
                    const newUserCredential = {
                        type: 'test_user' as const,
                        email: `testfox_${Date.now()}@example.com`,
                        password: 'TestFox123!',
                        source: 'generated',
                        confidence: 'high' as const
                    };
                    
                    this.log(`   Creating account: ${newUserCredential.email}`);
                    const registered = await this.browserRunner.attemptRegistration(newUserCredential);
                    
                    if (registered) {
                        this.log('   ✅ Account created successfully!');
                        result.loginSuccessful = true;
                        const regScreenshot = await this.browserRunner.takeScreenshot('post-registration');
                        if (regScreenshot) result.screenshots.push(regScreenshot);
                    } else {
                        this.log('   ⚠️ Could not create account - continuing without authentication');
                    }
                }
            }

            // Step 6: Explore all pages
            this.log('');
            this.log('🗺️ Step 5: Exploring all pages...');
            result.pages = await this.browserRunner.exploreAllPages(20);
            result.pagesVisited = result.pages.length;
            this.log(`   ✅ Discovered ${result.pagesVisited} pages`);

            for (const page of result.pages) {
                this.log(`   • ${page.url} - ${page.forms.length} forms, ${page.buttons.length} buttons`);
            }

            // Step 7: Test forms on each page
            this.log('');
            this.log('📝 Step 6: Testing forms...');
            
            for (const page of result.pages) {
                if (page.forms.length === 0) continue;

                this.log(`   Testing forms on ${page.url}...`);
                
                for (const form of page.forms) {
                    // Skip login forms if already logged in
                    if (result.loginSuccessful && 
                        (form.action?.includes('login') || form.action?.includes('signin'))) {
                        continue;
                    }

                    try {
                        const formResult = await this.browserRunner.testForm(form);
                        result.interactions.push(formResult);
                        result.formsTestedCount++;
                        
                        if (formResult.success) {
                            this.log(`     ✅ Form submitted: ${form.selector}`);
                        } else {
                            this.log(`     ⚠️ Form test: ${formResult.error || 'Unknown issue'}`);
                        }
                    } catch (error: any) {
                        result.errors.push(`Form test error: ${error.message}`);
                    }
                }
            }

            // Step 8: Click ALL buttons and interactive elements
            this.log('');
            this.log('🖱️ Step 7: Clicking ALL interactive elements...');
            
            for (const page of result.pages) {
                this.log(`   Testing page: ${page.url}`);
                
                // Navigate to this page first
                try {
                    await this.browserRunner.navigateTo(page.url);
                    
                    // Click ALL elements on this page
                    const clickResults = await this.browserRunner.clickAllElements();
                    result.interactions.push(...clickResults);
                    result.buttonsClickedCount += clickResults.filter(r => r.success).length;
                    
                    // Also interact with all inputs
                    const inputResults = await this.browserRunner.interactWithAllInputs();
                    result.interactions.push(...inputResults);
                    
                    // Take screenshot of this page
                    const pageScreenshot = await this.browserRunner.takeScreenshot(`page-${result.pagesVisited}`);
                    if (pageScreenshot) result.screenshots.push(pageScreenshot);
                    
                } catch (navError: any) {
                    this.log(`   ⚠️ Could not fully test ${page.url}: ${navError.message}`);
                }
            }

            // Also click buttons from page discovery (backup approach)
            this.log('');
            this.log('🔘 Step 7b: Testing discovered buttons...');
            
            for (const page of result.pages) {
                // Test ALL buttons, not just 5
                const safeButtons = page.buttons.filter(btn => {
                    const textLower = btn.text.toLowerCase();
                    return !textLower.includes('delete') && 
                           !textLower.includes('remove') &&
                           !textLower.includes('logout') &&
                           !textLower.includes('sign out');
                });

                for (const button of safeButtons) { // Test ALL safe buttons
                    try {
                        const buttonResult = await this.browserRunner.clickButton(button);
                        result.interactions.push(buttonResult);
                        result.buttonsClickedCount++;
                        
                        if (buttonResult.success) {
                            this.log(`     ✅ Clicked: ${button.text || button.selector}`);
                        }
                    } catch (error: any) {
                        result.errors.push(`Button click error: ${error.message}`);
                    }
                }
            }

            // Step 9: Test CRUD operations on tables
            this.log('');
            this.log('🗃️ Step 8: Testing data operations...');
            
            for (const page of result.pages) {
                for (const table of page.tables) {
                    if (table.hasActions) {
                        this.log(`   Testing CRUD on table (${table.rowCount} rows)...`);
                        const crudResults = await this.browserRunner.testCrudOperations(table);
                        result.interactions.push(...crudResults);
                    }
                }
            }

            // Run browser console log tests
            this.log('');
            this.log('🖥️ Step 9: Running Console Log Tests...');
            const consoleTestResult = this.browserRunner.runConsoleLogTests();
            result.consoleTestPassed = consoleTestResult.passed;
            result.consoleErrors = consoleTestResult.errors.length;
            result.consoleWarnings = consoleTestResult.warnings.length;
            
            if (consoleTestResult.passed) {
                this.log('   ✅ Console log tests passed');
            } else {
                this.log('   ❌ Console log tests failed');
                for (const issue of consoleTestResult.issues.slice(0, 5)) {
                    this.log(`      ${issue}`);
                }
            }

            // Run browser network log tests
            this.log('');
            this.log('🌐 Step 10: Running Network Log Tests...');
            const networkTestResult = this.browserRunner.runNetworkLogTests();
            result.networkTestPassed = networkTestResult.passed;
            result.networkFailedRequests = networkTestResult.failedRequests.length;
            result.networkSlowRequests = networkTestResult.slowRequests.length;
            
            if (networkTestResult.passed) {
                this.log('   ✅ Network log tests passed');
            } else {
                this.log('   ❌ Network log tests failed');
                for (const issue of networkTestResult.issues.slice(0, 5)) {
                    this.log(`      ${issue}`);
                }
            }

            // Step 11: Clean up test accounts (Final)
            this.log('');
            this.log('🧹 Step 11: Cleaning up test accounts...');
            const cleanedAccounts = await this.browserRunner.cleanupTestAccounts();
            result.testAccountsCleaned = cleanedAccounts;
            result.testAccountsDeleted = cleanedAccounts; // Sync with legacy field
            result.testAccounts = this.browserRunner.getTestAccounts();
            result.accountDeletionAttempts = result.testAccountsCreated.length;
            this.log(`   ✅ Cleaned up ${cleanedAccounts.length}/${result.accountDeletionAttempts} test accounts`);

            // Take final screenshot
            const finalScreenshot = await this.browserRunner.takeScreenshot('final');
            if (finalScreenshot) result.screenshots.push(finalScreenshot);

            result.success = true;

            this.log('');
            this.log('═══════════════════════════════════════════════════');
            this.log('           FULL CYCLE TESTING COMPLETE              ');
            this.log('═══════════════════════════════════════════════════');

        } catch (error: any) {
            result.errors.push(`Full cycle error: ${error.message}`);
            this.log(`❌ Error: ${error.message}`);
        } finally {
            // Cleanup
            await this.browserRunner.close();
            await this.appRunner.stop();
        }

        return this.finalize(result);
    }

    private finalize(result: FullCycleResult): FullCycleResult {
        result.endTime = new Date();
        result.duration = result.endTime.getTime() - result.startTime.getTime();
        result.interactions = this.browserRunner.getInteractionLog();

        // Summary
        this.log('');
        this.log('📊 Summary:');
        this.log(`   • Duration: ${Math.round(result.duration / 1000)}s`);
        this.log(`   • Credentials found: ${result.credentialsFound.length}`);
        this.log(`   • Test accounts created: ${result.testAccountsCreated.length}/${result.accountCreationAttempts}`);
        this.log(`   • Test accounts cleaned: ${result.testAccountsDeleted.length}/${result.accountDeletionAttempts}`);
        this.log(`   • Login: ${result.loginSuccessful ? '✅ Success' : (result.loginAttempted ? '❌ Failed' : '⚠️ Not attempted')}`);
        this.log(`   • Pages visited: ${result.pagesVisited}`);
        this.log(`   • Forms tested: ${result.formsTestedCount}`);
        this.log(`   • Buttons clicked: ${result.buttonsClickedCount}`);
        this.log(`   • Total interactions: ${result.interactions.length}`);
        this.log('');
        this.log('🖥️ Console Logs:');
        this.log(`   • Status: ${result.consoleTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
        this.log(`   • Errors: ${result.consoleErrors}`);
        this.log(`   • Warnings: ${result.consoleWarnings}`);
        this.log('');
        this.log('🌐 Network Logs:');
        this.log(`   • Status: ${result.networkTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
        this.log(`   • Failed requests: ${result.networkFailedRequests}`);
        this.log(`   • Slow requests: ${result.networkSlowRequests}`);
        this.log('');
        this.log(`   • Screenshots: ${result.screenshots.length}`);
        this.log(`   • Errors: ${result.errors.length}`);
        this.log('');

        // Show created test accounts
        if (result.testAccounts && result.testAccounts.length > 0) {
            this.log('👤 Created Test Accounts:');
            for (const account of result.testAccounts) {
                this.log(`   • ${account.email} (${account.type}) - ${account.created ? '✅ Created' : '❌ Failed'}`);
            }
            this.log('');
        }

        if (result.errors.length > 0) {
            this.log('⚠️ Errors encountered:');
            for (const error of result.errors) {
                this.log(`   • ${error}`);
            }
        }

        return result;
    }

    private log(message: string): void {
        this.outputChannel.appendLine(message);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.browserRunner.dispose();
        this.outputChannel.dispose();
    }
}

