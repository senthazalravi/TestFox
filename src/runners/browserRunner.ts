import * as vscode from 'vscode';

// Type definitions for Playwright (loaded dynamically)
interface PlaywrightPage {
    goto(url: string, options?: any): Promise<any>;
    click(selector: string, options?: any): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    type(selector: string, text: string): Promise<void>;
    screenshot(options?: any): Promise<Buffer>;
    evaluate(fn: any, ...args: any[]): Promise<any>;
    close(): Promise<void>;
    on(event: string, handler: any): void;
    waitForLoadState(state?: string): Promise<void>;
    locator(selector: string): any;
}

interface PlaywrightBrowser {
    newPage(): Promise<PlaywrightPage>;
    close(): Promise<void>;
}

/**
 * Browser automation runner using Playwright
 */
export class BrowserRunner {
    private browser: PlaywrightBrowser | null = null;
    private page: PlaywrightPage | null = null;
    private consoleErrors: string[] = [];
    private playwright: any = null;

    async initialize(): Promise<void> {
        try {
            // Dynamically import playwright
            this.playwright = await import('playwright');
            
            const config = vscode.workspace.getConfiguration('testfox');
            const headless = config.get<boolean>('browserHeadless', true);

            this.browser = await this.playwright.chromium.launch({
                headless
            });

            this.page = await this.browser!.newPage();

            // Listen for console errors
            this.page.on('console', (msg: any) => {
                if (msg.type() === 'error') {
                    this.consoleErrors.push(msg.text());
                }
            });

            // Listen for page errors
            this.page.on('pageerror', (error: Error) => {
                this.consoleErrors.push(error.message);
            });

        } catch (error) {
            console.error('Failed to initialize Playwright:', error);
            throw new Error(
                'Playwright not available. Run: npm install playwright && npx playwright install chromium'
            );
        }
    }

    async navigate(url: string): Promise<void> {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        this.consoleErrors = [];
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }

    async click(selector: string): Promise<void> {
        if (!this.page) return;

        try {
            await this.page.click(selector, { timeout: 5000 });
        } catch (error) {
            // Try alternative selectors
            try {
                await this.page.locator(selector).click({ timeout: 5000 });
            } catch {
                throw new Error(`Could not click element: ${selector}`);
            }
        }
    }

    async type(selector: string, text: string): Promise<void> {
        if (!this.page) return;

        try {
            await this.page.fill(selector, text);
        } catch {
            try {
                await this.page.type(selector, text);
            } catch {
                throw new Error(`Could not type in element: ${selector}`);
            }
        }
    }

    async submit(): Promise<void> {
        if (!this.page) return;

        try {
            // Try to find and click a submit button
            await this.page.click('button[type="submit"], input[type="submit"], button:has-text("Submit")');
        } catch {
            // Try pressing Enter on the form
            try {
                await this.page.evaluate(`
                    (function() {
                        var form = document.querySelector('form');
                        if (form) {
                            form.submit();
                        }
                    })()
                `);
            } catch {
                // Ignore - no form to submit
            }
        }
    }

    async screenshot(): Promise<string | null> {
        if (!this.page) return null;

        try {
            const buffer = await this.page.screenshot({ type: 'png' });
            return buffer.toString('base64');
        } catch {
            return null;
        }
    }

    getConsoleErrors(): string[] {
        return [...this.consoleErrors];
    }

    async checkForAlert(): Promise<boolean> {
        if (!this.page) return false;

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 2000);
            
            this.page!.on('dialog', async (dialog: any) => {
                clearTimeout(timeout);
                await dialog.dismiss();
                resolve(true);
            });
        });
    }

    async getPerformanceMetrics(url: string): Promise<{
        loadTime: number;
        ttfb: number;
        fcp: number;
        lcp: number;
        domContentLoaded: number;
    }> {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        const startTime = Date.now();
        await this.page.goto(url, { waitUntil: 'networkidle' });
        const loadTime = Date.now() - startTime;

        // Get performance metrics from the page
        // Note: These are evaluated in the browser context
        const metrics = await this.page.evaluate(`
            (function() {
                const entries = performance.getEntriesByType('navigation');
                const perf = entries[0];
                const paint = performance.getEntriesByType('paint');
                const fcp = paint.find(function(p) { return p.name === 'first-contentful-paint'; });
                
                return {
                    ttfb: perf ? perf.responseStart : 0,
                    domContentLoaded: perf ? perf.domContentLoadedEventEnd : 0,
                    fcp: fcp ? fcp.startTime : 0
                };
            })()
        `);

        return {
            loadTime,
            ttfb: Math.round(metrics.ttfb || 0),
            fcp: Math.round(metrics.fcp || 0),
            lcp: Math.round(metrics.fcp || 0), // Simplified - would need PerformanceObserver for actual LCP
            domContentLoaded: Math.round(metrics.domContentLoaded || 0)
        };
    }

    async evaluateScript(script: string): Promise<any> {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }

        return this.page.evaluate(script);
    }

    async waitForSelector(selector: string, timeout = 5000): Promise<boolean> {
        if (!this.page) return false;

        try {
            await this.page.locator(selector).waitFor({ timeout });
            return true;
        } catch {
            return false;
        }
    }

    async getTextContent(selector: string): Promise<string | null> {
        if (!this.page) return null;

        try {
            // Evaluate in browser context using string template
            const script = `
                (function() {
                    const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                    return el ? el.textContent : null;
                })()
            `;
            return await this.page.evaluate(script);
        } catch {
            return null;
        }
    }

    async checkElementExists(selector: string, timeout = 3000): Promise<boolean> {
        if (!this.page) return false;
        try {
            const element = await this.page.locator(selector).first();
            await element.waitFor({ state: 'attached', timeout });
            return await element.isVisible();
        } catch {
            return false;
        }
    }

    async close(): Promise<void> {
        if (this.page) {
            try {
                await this.page.close();
            } catch {
                // Ignore close errors
            }
            this.page = null;
        }

        if (this.browser) {
            try {
                await this.browser.close();
            } catch {
                // Ignore close errors
            }
            this.browser = null;
        }
    }
}

