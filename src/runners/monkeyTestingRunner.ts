import * as vscode from 'vscode';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Monkey Testing Runner - Performs random clicks on the application
 * Tracks clicked areas and click counts for reporting
 */
export class MonkeyTestingRunner {
    private outputChannel: vscode.OutputChannel;
    private clickStats: Map<string, { count: number; elementType: string; text: string }> = new Map();
    private totalClicks: number = 0;
    private screenshots: string[] = [];
    private errors: string[] = [];

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestFox Monkey Testing');
    }

    /**
     * Run monkey testing on the application
     * @param appUrl The URL of the application to test
     * @param clickCount Number of random clicks to perform (default: 100)
     * @param duration Duration in seconds (default: 60)
     */
    async runMonkeyTesting(appUrl: string, clickCount: number = 100, duration: number = 60): Promise<MonkeyTestResult> {
        this.outputChannel.appendLine(`🐒 Starting Monkey Testing against ${appUrl}`);
        this.outputChannel.appendLine(`Configuration: ${clickCount} clicks or ${duration} seconds`);

        // Reset stats
        this.clickStats.clear();
        this.totalClicks = 0;
        this.screenshots = [];
        this.errors = [];

        let browser: Browser | undefined;
        let context: BrowserContext | undefined;
        let page: Page | undefined;

        try {
            // Launch browser
            browser = await chromium.launch({ headless: false });
            context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                recordVideo: {
                    dir: path.join(this.getWorkspacePath(), '.testfox', 'monkey-videos'),
                    size: { width: 1280, height: 720 }
                }
            });
            page = await context.newPage();

            // Navigate to app
            await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
            this.outputChannel.appendLine('✅ Application loaded');

            // Take initial screenshot
            const initialScreenshot = await this.takeScreenshot(page, 'monkey-start');
            this.screenshots.push(initialScreenshot);

            // Perform random clicks
            const startTime = Date.now();
            const maxDuration = duration * 1000;

            for (let i = 0; i < clickCount; i++) {
                // Check if duration exceeded
                if (Date.now() - startTime > maxDuration) {
                    this.outputChannel.appendLine(`⏱️ Duration limit (${duration}s) reached`);
                    break;
                }

                try {
                    await this.performRandomClick(page);
                    this.totalClicks++;

                    // Take screenshot every 10 clicks
                    if (i % 10 === 0 && i > 0) {
                        const screenshot = await this.takeScreenshot(page, `monkey-${i}`);
                        this.screenshots.push(screenshot);
                    }

                    // Small delay between clicks
                    await this.randomDelay(100, 500);
                } catch (error: any) {
                    this.errors.push(`Click ${i + 1}: ${error.message}`);
                    this.outputChannel.appendLine(`⚠️ Error on click ${i + 1}: ${error.message}`);
                }
            }

            // Take final screenshot
            const finalScreenshot = await this.takeScreenshot(page, 'monkey-end');
            this.screenshots.push(finalScreenshot);

            this.outputChannel.appendLine(`\n🎉 Monkey Testing Complete!`);
            this.outputChannel.appendLine(`Total Clicks: ${this.totalClicks}`);
            this.outputChannel.appendLine(`Unique Elements Clicked: ${this.clickStats.size}`);
            this.outputChannel.appendLine(`Errors: ${this.errors.length}`);

            // Print click statistics
            this.outputChannel.appendLine(`\n📊 Click Statistics:`);
            const sortedStats = Array.from(this.clickStats.entries())
                .sort((a, b) => b[1].count - a[1].count);

            for (const [selector, stats] of sortedStats.slice(0, 20)) {
                this.outputChannel.appendLine(`  ${stats.count}x - ${stats.elementType}${stats.text ? ` (${stats.text})` : ''}`);
            }

            return this.generateResult();

        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Monkey Testing Failed: ${error.message}`);
            this.errors.push(`Fatal error: ${error.message}`);
            return this.generateResult();
        } finally {
            if (page) await page.close();
            if (context) await context.close();
            if (browser) await browser.close();
        }
    }

    /**
     * Perform a random click on the page
     */
    private async performRandomClick(page: Page): Promise<void> {
        // Get all clickable elements
        const clickableElements = await page.$$('button, a, input, [role="button"], [clickable], .btn, [onclick]');

        if (clickableElements.length === 0) {
            // If no clickable elements, try clicking anywhere
            const box = await page.viewportSize();
            if (box) {
                const x = Math.floor(Math.random() * box.width);
                const y = Math.floor(Math.random() * box.height);
                await page.mouse.click(x, y);
            }
            return;
        }

        // Select random element
        const randomIndex = Math.floor(Math.random() * clickableElements.length);
        const element = clickableElements[randomIndex];

        try {
            // Get element info
            const elementInfo = await element.evaluate((el) => {
                const tagName = el.tagName.toLowerCase();
                const text = el.textContent?.substring(0, 30) || '';
                const id = el.id || '';
                const className = el.className || '';
                return { tagName, text, id, className };
            });

            // Create selector key
            const selector = this.createSelectorKey(elementInfo);

            // Update stats
            const existing = this.clickStats.get(selector);
            if (existing) {
                existing.count++;
            } else {
                this.clickStats.set(selector, {
                    count: 1,
                    elementType: elementInfo.tagName,
                    text: elementInfo.text
                });
            }

            // Scroll element into view and click
            await element.scrollIntoViewIfNeeded();
            await element.click({ timeout: 5000 });

            this.outputChannel.appendLine(`🖱️  Clicked: ${selector}`);

        } catch (error: any) {
            // Element might have disappeared, that's ok for monkey testing
            this.outputChannel.appendLine(`⚠️  Click failed (element may have moved): ${error.message}`);
        }
    }

    /**
     * Create a unique selector key for an element
     */
    private createSelectorKey(info: { tagName: string; text: string; id: string; className: string }): string {
        if (info.id) {
            return `#${info.id}`;
        }
        if (info.text) {
            return `${info.tagName}[text="${info.text.substring(0, 20)}"]`;
        }
        if (info.className) {
            return `${info.tagName}.${info.className.split(' ')[0]}`;
        }
        return info.tagName;
    }

    /**
     * Take a screenshot
     */
    private async takeScreenshot(page: Page, name: string): Promise<string> {
        const screenshotDir = path.join(this.getWorkspacePath(), '.testfox', 'monkey-screenshots');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${name}-${timestamp}.png`;
        const filepath = path.join(screenshotDir, filename);

        await page.screenshot({ path: filepath, fullPage: false });
        return filepath;
    }

    /**
     * Random delay between actions
     */
    private async randomDelay(min: number, max: number): Promise<void> {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Generate test result
     */
    private generateResult(): MonkeyTestResult {
        return {
            totalClicks: this.totalClicks,
            uniqueElements: this.clickStats.size,
            clickStats: new Map(this.clickStats),
            screenshots: [...this.screenshots],
            errors: [...this.errors],
            success: this.totalClicks > 0 && this.errors.length < this.totalClicks * 0.5,
            timestamp: new Date()
        };
    }

    /**
     * Get workspace path
     */
    private getWorkspacePath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return process.cwd();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}

/**
 * Monkey Test Result
 */
export interface MonkeyTestResult {
    totalClicks: number;
    uniqueElements: number;
    clickStats: Map<string, { count: number; elementType: string; text: string }>;
    screenshots: string[];
    errors: string[];
    success: boolean;
    timestamp: Date;
}
