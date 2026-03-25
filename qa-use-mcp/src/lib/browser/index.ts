import { chromium, firefox, webkit, Browser, Page } from 'playwright';

export interface BrowserConfig {
  type: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport: { width: number; height: number };
}

export interface ScreenshotConfig {
  fullPage: boolean;
  selector?: string;
}

export interface AccessibilityTestConfig {
  standards: string[];
}

export interface PerformanceAnalysisConfig {
  metrics: string[];
}

export class BrowserManager {
  private browsers: Map<string, Browser> = new Map();

  async startBrowser(config: BrowserConfig): Promise<Browser> {
    let browser: Browser;

    switch (config.type) {
      case 'chromium':
        browser = await chromium.launch({
          headless: config.headless,
        });
        break;
      case 'firefox':
        browser = await firefox.launch({
          headless: config.headless,
        });
        break;
      case 'webkit':
        browser = await webkit.launch({
          headless: config.headless,
        });
        break;
      default:
        throw new Error(`Unsupported browser type: ${config.type}`);
    }

    // Set viewport
    const context = await browser.newContext({
      viewport: config.viewport,
    });

    await context.newPage();
    this.browsers.set(config.type, browser);

    return browser;
  }

  async navigateTo(browser: Browser, url: string): Promise<void> {
    const page = await this.getPage(browser);
    await page.goto(url);
  }

  async takeScreenshot(browser: Browser, config: ScreenshotConfig): Promise<Buffer> {
    const page = await this.getPage(browser);

    if (config.selector) {
      const element = await page.$(config.selector);
      if (element) {
        return await element.screenshot();
      }
    }

    if (config.fullPage) {
      return await page.screenshot({ fullPage: true });
    }

    return await page.screenshot();
  }

  async runAccessibilityTest(browser: Browser, config: AccessibilityTestConfig): Promise<any> {
    const page = await this.getPage(browser);
    
    // Get accessibility tree
    const accessibilityTree = await page.accessibility.snapshot();
    
    // Run basic accessibility checks
    const issues = [];
    
    // Check for alt text on images
    const images = await page.$$('img');
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      if (!alt) {
        issues.push({
          type: 'missing-alt',
          element: 'img',
          severity: 'warning',
          message: 'Image missing alt text',
        });
      }
    }

    // Check for proper heading structure
    const headings = await page.$$('h1, h2, h3, h4, h5, h6');
    const previousLevels = [];
    for (const heading of headings) {
      const tagName = await heading.evaluate(el => el.tagName, heading);
      const level = parseInt(tagName.substring(1));
      if (level > previousLevels[previousLevels.length - 1] + 1) {
        issues.push({
          type: 'heading-skip',
          element: tagName,
          severity: 'warning',
          message: `Heading level skipped from h${previousLevels[previousLevels.length - 1]} to h${level}`,
        });
      }
      previousLevels.push(level);
    }

    // Check for form labels
    const inputs = await page.$$('input, select, textarea');
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const hasLabel = await page.$(`label[for="${id}"]`);
      if (!hasLabel) {
        const placeholder = await input.getAttribute('placeholder');
        if (!placeholder) {
          const inputTagName = await input.evaluate(el => el.tagName, input);
          issues.push({
            type: 'missing-label',
            element: inputTagName,
            severity: 'error',
            message: 'Form input missing label or placeholder',
          });
        }
      }
    }

    return {
      standards: config.standards,
      issues,
      score: this.calculateAccessibilityScore(issues),
    };
  }

  async analyzePerformance(browser: Browser, config: PerformanceAnalysisConfig): Promise<any> {
    const page = await this.getPage(browser);
    
    const metrics: any = {};
    
    if (config.metrics.includes('FCP')) {
      const fcp = await page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const fcp = entries.find((entry: any) => entry.name === 'first-contentful-paint');
            resolve(fcp ? fcp.startTime : 0);
          }).observe({ entryTypes: ['paint'] });
        });
      });
      metrics['FCP'] = fcp;
    }

    if (config.metrics.includes('LCP')) {
      const lcp = await page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lcp = entries.find((entry: any) => entry.name === 'largest-contentful-paint');
            resolve(lcp ? lcp.startTime : 0);
          }).observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
        });
      });
      metrics['LCP'] = lcp;
    }

    // Get basic performance metrics
    const navigation = await page.evaluate(() => {
      const navEntries = performance.getEntriesByType('navigation');
      const navigation = navEntries[0];
      if (!navigation) return null;
      
      return {
        domContentLoaded: (navigation as any).domContentLoadedEventEnd - (navigation as any).navigationStart,
        loadComplete: (navigation as any).loadEventEnd - (navigation as any).navigationStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime || 0,
      };
    });
    
    if (navigation) {
      metrics['DOM_Content_Loaded'] = navigation.domContentLoaded;
      metrics['Page_Load_Complete'] = navigation.loadComplete;
      metrics['First_Paint'] = navigation.firstPaint;
    }

    return {
      metrics,
      url: page.url(),
      timestamp: new Date().toISOString(),
    };
  }

  async close(browser: Browser): Promise<void> {
    await browser.close();
    this.browsers.delete(browser.constructor.name);
  }

  private async getPage(browser: Browser): Promise<Page> {
    const pages = browser.contexts()[0]?.pages();
    return pages[0] || await browser.newPage();
  }

  private calculateAccessibilityScore(issues: any[]): number {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    
    // Simple scoring: 100 - (errors * 10) - (warnings * 5)
    const score = Math.max(0, 100 - (errorCount * 10) - (warningCount * 5));
    
    return score;
  }
}

export function createBrowserManager(): BrowserManager {
  return new BrowserManager();
}
