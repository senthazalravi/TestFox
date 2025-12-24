import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BrowserStatus {
    chromium: boolean;
    firefox: boolean;
    webkit: boolean;
}

export interface DeviceProfile {
    name: string;
    viewport: { width: number; height: number };
    userAgent: string;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
    canAutomate: boolean;
    manualInstructions?: string;
}

/**
 * Manages extension dependencies like Playwright
 */
export class DependencyManager {
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;
    private static readonly PLAYWRIGHT_SKIP_KEY = 'testfox.skipPlaywrightInstall';

    // Device profiles for testing
    public static readonly DEVICE_PROFILES: DeviceProfile[] = [
        // Mobile Devices - Can Emulate
        { name: 'iPhone 14 Pro', viewport: { width: 393, height: 852 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', deviceScaleFactor: 3, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'iPhone 14', viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', deviceScaleFactor: 3, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'iPhone SE', viewport: { width: 375, height: 667 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)', deviceScaleFactor: 2, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'Samsung Galaxy S21', viewport: { width: 360, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B)', deviceScaleFactor: 3, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'Pixel 7', viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)', deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, canAutomate: true },
        
        // Tablets - Can Emulate
        { name: 'iPad Pro 12.9"', viewport: { width: 1024, height: 1366 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', deviceScaleFactor: 2, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'iPad Mini', viewport: { width: 768, height: 1024 }, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', deviceScaleFactor: 2, isMobile: true, hasTouch: true, canAutomate: true },
        { name: 'Galaxy Tab S8', viewport: { width: 800, height: 1280 }, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-X800)', deviceScaleFactor: 2, isMobile: true, hasTouch: true, canAutomate: true },
        
        // Desktop Browsers - Can Automate
        { name: 'Desktop Chrome', viewport: { width: 1920, height: 1080 }, userAgent: '', deviceScaleFactor: 1, isMobile: false, hasTouch: false, canAutomate: true },
        { name: 'Desktop Firefox', viewport: { width: 1920, height: 1080 }, userAgent: '', deviceScaleFactor: 1, isMobile: false, hasTouch: false, canAutomate: true },
        { name: 'Desktop Safari', viewport: { width: 1920, height: 1080 }, userAgent: '', deviceScaleFactor: 1, isMobile: false, hasTouch: false, canAutomate: true },
        { name: 'Desktop Edge', viewport: { width: 1920, height: 1080 }, userAgent: '', deviceScaleFactor: 1, isMobile: false, hasTouch: false, canAutomate: true },
        
        // Real Device Testing - Cannot Automate (Manual Only)
        { name: 'Real iPhone Device', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: true, hasTouch: true, canAutomate: false, 
          manualInstructions: 'Test on a physical iPhone device using Safari. Check touch gestures, Face ID integration, and camera access.' },
        { name: 'Real Android Device', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: true, hasTouch: true, canAutomate: false,
          manualInstructions: 'Test on a physical Android device. Check fingerprint integration, back button behavior, and app switching.' },
        { name: 'Real iPad Device', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: true, hasTouch: true, canAutomate: false,
          manualInstructions: 'Test on a physical iPad. Check split-screen multitasking, Apple Pencil support, and keyboard attachment.' },
        
        // Screen Readers - Cannot Automate (Manual Only)  
        { name: 'VoiceOver (iOS/macOS)', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: false, hasTouch: false, canAutomate: false,
          manualInstructions: 'Enable VoiceOver and navigate the entire application. Verify all elements are properly announced and actionable.' },
        { name: 'TalkBack (Android)', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: true, hasTouch: true, canAutomate: false,
          manualInstructions: 'Enable TalkBack and navigate the entire application. Verify gesture navigation and element announcements.' },
        { name: 'NVDA (Windows)', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: false, hasTouch: false, canAutomate: false,
          manualInstructions: 'Use NVDA screen reader to navigate. Check heading structure, form labels, and ARIA landmarks.' },
        { name: 'JAWS (Windows)', viewport: { width: 0, height: 0 }, userAgent: '', deviceScaleFactor: 0, isMobile: false, hasTouch: false, canAutomate: false,
          manualInstructions: 'Use JAWS screen reader for enterprise accessibility testing. Verify table navigation and complex widget handling.' },
    ];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('TestFox Dependencies');
    }

    /**
     * Check and install all required dependencies
     */
    async ensureDependencies(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('testfox');
        const autoInstall = config.get<boolean>('autoInstallDependencies', true);

        // Check if user has previously chosen to skip
        const skipInstall = this.context.globalState.get<boolean>(DependencyManager.PLAYWRIGHT_SKIP_KEY, false);
        if (skipInstall) {
            return false;
        }

        // Check Playwright browsers
        const browserStatus = await this.getBrowserStatus();
        const hasAnyBrowser = browserStatus.chromium || browserStatus.firefox || browserStatus.webkit;
        const hasAllBrowsers = browserStatus.chromium && browserStatus.firefox && browserStatus.webkit;
        
        if (!hasAnyBrowser) {
            if (autoInstall) {
                const result = await vscode.window.showWarningMessage(
                    'TestFox requires Playwright browsers for cross-browser testing. Install all browsers (Chromium, Firefox, Safari)?',
                    'Install All Browsers',
                    'Chromium Only',
                    'Later',
                    'Never Ask Again'
                );

                if (result === 'Install All Browsers') {
                    return await this.installAllBrowsers();
                } else if (result === 'Chromium Only') {
                    return await this.installBrowser('chromium');
                } else if (result === 'Never Ask Again') {
                    await this.context.globalState.update(DependencyManager.PLAYWRIGHT_SKIP_KEY, true);
                    vscode.window.showInformationMessage(
                        'TestFox: Browser tests will be skipped. Install manually with: npx playwright install'
                    );
                    return false;
                }
                return false;
            }
        } else if (!hasAllBrowsers && autoInstall) {
            // Offer to install missing browsers
            const missing: string[] = [];
            if (!browserStatus.chromium) missing.push('Chromium');
            if (!browserStatus.firefox) missing.push('Firefox');
            if (!browserStatus.webkit) missing.push('WebKit');
            
            const result = await vscode.window.showInformationMessage(
                `TestFox: Missing browsers for full cross-browser testing: ${missing.join(', ')}. Install them?`,
                'Install Missing',
                'Skip'
            );
            
            if (result === 'Install Missing') {
                if (!browserStatus.chromium) await this.installBrowser('chromium');
                if (!browserStatus.firefox) await this.installBrowser('firefox');
                if (!browserStatus.webkit) await this.installBrowser('webkit');
            }
        }

        return hasAnyBrowser;
    }

    /**
     * Check if Playwright browsers are installed by checking the cache directory
     */
    async arePlaywrightBrowsersInstalled(): Promise<boolean> {
        const status = await this.getBrowserStatus();
        return status.chromium; // At minimum, chromium should be installed
    }

    /**
     * Get detailed status of which browsers are installed
     */
    async getBrowserStatus(): Promise<BrowserStatus> {
        const browserPath = this.getPlaywrightBrowserPath();
        
        const status: BrowserStatus = {
            chromium: false,
            firefox: false,
            webkit: false
        };

        if (!browserPath) {
            return status;
        }

        try {
            const dirs = fs.readdirSync(browserPath);
            status.chromium = dirs.some(dir => dir.startsWith('chromium'));
            status.firefox = dirs.some(dir => dir.startsWith('firefox'));
            status.webkit = dirs.some(dir => dir.startsWith('webkit'));
        } catch {
            // Directory doesn't exist
        }

        return status;
    }

    /**
     * Get list of installed browsers for testing
     */
    async getInstalledBrowsers(): Promise<string[]> {
        const status = await this.getBrowserStatus();
        const browsers: string[] = [];
        
        if (status.chromium) browsers.push('chromium');
        if (status.firefox) browsers.push('firefox');
        if (status.webkit) browsers.push('webkit');
        
        return browsers;
    }

    /**
     * Get device profiles that can be automated vs manual
     */
    getAutomatableDevices(): DeviceProfile[] {
        return DependencyManager.DEVICE_PROFILES.filter(d => d.canAutomate);
    }

    getManualOnlyDevices(): DeviceProfile[] {
        return DependencyManager.DEVICE_PROFILES.filter(d => !d.canAutomate);
    }

    /**
     * Get the Playwright browser cache path based on OS
     */
    private getPlaywrightBrowserPath(): string | null {
        const homeDir = os.homedir();
        
        switch (process.platform) {
            case 'win32':
                // Windows: %USERPROFILE%\AppData\Local\ms-playwright
                return path.join(homeDir, 'AppData', 'Local', 'ms-playwright');
            case 'darwin':
                // macOS: ~/Library/Caches/ms-playwright
                return path.join(homeDir, 'Library', 'Caches', 'ms-playwright');
            case 'linux':
                // Linux: ~/.cache/ms-playwright
                return path.join(homeDir, '.cache', 'ms-playwright');
            default:
                return null;
        }
    }

    /**
     * Install Playwright browsers with progress - installs ALL browsers for cross-browser testing
     */
    async installPlaywrightBrowsers(): Promise<boolean> {
        return await this.installAllBrowsers();
    }

    /**
     * Install all Playwright browsers (Chromium, Firefox, WebKit) for comprehensive testing
     */
    async installAllBrowsers(): Promise<boolean> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox: Installing Playwright Browsers...',
            cancellable: false
        }, async (progress) => {
            try {
                this.outputChannel.show(true);
                this.outputChannel.appendLine('═'.repeat(60));
                this.outputChannel.appendLine('TestFox: Installing All Playwright Browsers for Cross-Browser Testing');
                this.outputChannel.appendLine('═'.repeat(60));
                this.outputChannel.appendLine('');

                const browsers = [
                    { name: 'Chromium', command: 'chromium' },
                    { name: 'Firefox', command: 'firefox' },
                    { name: 'WebKit (Safari)', command: 'webkit' }
                ];

                let successCount = 0;

                for (let i = 0; i < browsers.length; i++) {
                    const browser = browsers[i];
                    progress.report({ 
                        message: `Installing ${browser.name} (${i + 1}/${browsers.length})...`,
                        increment: (100 / browsers.length) 
                    });
                    
                    this.outputChannel.appendLine(`📦 Installing ${browser.name}...`);
                    
                    try {
                        await this.runCommand(`npx playwright install ${browser.command}`, this.getWorkingDirectory());
                        this.outputChannel.appendLine(`✅ ${browser.name} installed successfully!`);
                        this.outputChannel.appendLine('');
                        successCount++;
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        this.outputChannel.appendLine(`⚠️ ${browser.name} installation failed: ${errorMessage}`);
                        this.outputChannel.appendLine('');
                    }
                }

                this.outputChannel.appendLine('═'.repeat(60));
                this.outputChannel.appendLine(`Installation Complete: ${successCount}/${browsers.length} browsers installed`);
                this.outputChannel.appendLine('═'.repeat(60));
                
                if (successCount > 0) {
                    vscode.window.showInformationMessage(
                        `TestFox: ${successCount} browser(s) installed! Cross-browser testing is now available.`
                    );
                    return true;
                } else {
                    vscode.window.showErrorMessage('TestFox: Failed to install any browsers.');
                    return false;
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(`❌ Installation failed: ${errorMessage}`);
                
                vscode.window.showErrorMessage(
                    `TestFox: Browser installation failed. ${errorMessage}`
                );
                
                return false;
            }
        });
    }

    /**
     * Install a specific browser
     */
    async installBrowser(browserName: 'chromium' | 'firefox' | 'webkit'): Promise<boolean> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `TestFox: Installing ${browserName}...`,
            cancellable: false
        }, async () => {
            try {
                this.outputChannel.show(true);
                this.outputChannel.appendLine(`Installing ${browserName}...`);
                await this.runCommand(`npx playwright install ${browserName}`, this.getWorkingDirectory());
                this.outputChannel.appendLine(`✅ ${browserName} installed!`);
                return true;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(`❌ Failed to install ${browserName}: ${errorMessage}`);
                return false;
            }
        });
    }

    /**
     * Get working directory - prefer workspace, fallback to temp
     */
    private getWorkingDirectory(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return os.tmpdir();
    }

    /**
     * Run a shell command
     */
    private runCommand(command: string, cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd.exe' : '/bin/sh';
            const shellFlag = isWindows ? '/c' : '-c';

            this.outputChannel.appendLine(`> ${command}`);
            this.outputChannel.appendLine('');

            const proc = cp.spawn(shell, [shellFlag, command], {
                cwd,
                env: { ...process.env }
            });

            proc.stdout?.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            proc.stderr?.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with exit code ${code}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Check workspace dependencies (for user's project)
     */
    async checkWorkspaceDependencies(): Promise<{
        hasPackageJson: boolean;
        hasNodeModules: boolean;
        runCommand?: string;
    }> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return { hasPackageJson: false, hasNodeModules: false };
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const packageJsonPath = path.join(workspacePath, 'package.json');
        const nodeModulesPath = path.join(workspacePath, 'node_modules');

        const hasPackageJson = fs.existsSync(packageJsonPath);
        const hasNodeModules = fs.existsSync(nodeModulesPath);

        let runCommand: string | undefined;
        if (hasPackageJson) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const scripts = packageJson.scripts || {};
                
                if (scripts.dev) {
                    runCommand = 'npm run dev';
                } else if (scripts.start) {
                    runCommand = 'npm run start';
                } else if (scripts.serve) {
                    runCommand = 'npm run serve';
                }
            } catch {
                // Ignore parse errors
            }
        }

        return { hasPackageJson, hasNodeModules, runCommand };
    }

    /**
     * Install workspace dependencies
     */
    async installWorkspaceDependencies(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return false;
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TestFox: Installing project dependencies...',
            cancellable: false
        }, async () => {
            try {
                await this.runCommand('npm install', workspaceFolders[0].uri.fsPath);
                return true;
            } catch {
                return false;
            }
        });
    }

    /**
     * Reset the "Never ask again" setting
     */
    async resetSkipSetting(): Promise<void> {
        await this.context.globalState.update(DependencyManager.PLAYWRIGHT_SKIP_KEY, false);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
