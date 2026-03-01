import * as vscode from 'vscode';
import { chromium } from 'playwright';
import { TestCase } from '../types/index';

export interface RuntimeAppInfo {
    url: string;
    title: string;
    hasLoginForm: boolean;
    hasSignupForm: boolean;
    loginFormElements: Array<{
        type: string;
        selector: string;
        placeholder?: string;
        required?: boolean;
    }>;
    signupFormElements: Array<{
        type: string;
        selector: string;
        placeholder?: string;
        required?: boolean;
    }>;
    navigationElements: Array<{
        text: string;
        href?: string;
        selector: string;
    }>;
    formElements: Array<{
        id?: string;
        action?: string;
        method?: string;
        inputs: Array<{
            name?: string;
            type: string;
            placeholder?: string;
            required?: boolean;
        }>;
    }>;
    buttons: Array<{
        text: string;
        type?: string;
        selector: string;
    }>;
    links: Array<{
        text: string;
        href?: string;
        selector: string;
    }>;
}

/**
 * Runtime Application Analyzer - Analyzes running web applications
 * to generate tests based on actual UI elements and functionality
 */
export class RuntimeAppAnalyzer {
    private output = vscode.window.createOutputChannel('TestFox Runtime Analysis');

    /**
     * Analyze a running web application
     */
    async analyzeApplication(url: string): Promise<RuntimeAppInfo> {
        this.output.appendLine(`TestFox Runtime: Analyzing application at ${url}`);

        let browser;
        let page;

        try {
            browser = await chromium.launch({ headless: true });
            page = await browser.newPage();

            // Navigate to the application
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000); // Wait for dynamic content

            const appInfo: RuntimeAppInfo = {
                url,
                title: await page.title(),
                hasLoginForm: false,
                hasSignupForm: false,
                loginFormElements: [],
                signupFormElements: [],
                navigationElements: [],
                formElements: [],
                buttons: [],
                links: []
            };

            // Analyze login forms
            const loginFormInfo = await this.analyzeLoginForm(page);
            appInfo.hasLoginForm = loginFormInfo.hasLoginForm;
            appInfo.loginFormElements = loginFormInfo.elements;

            // Analyze signup forms
            const signupFormInfo = await this.analyzeSignupForm(page);
            appInfo.hasSignupForm = signupFormInfo.hasSignupForm;
            appInfo.signupFormElements = signupFormInfo.elements;

            // Analyze navigation elements
            appInfo.navigationElements = await this.analyzeNavigation(page);

            // Analyze all forms
            appInfo.formElements = await this.analyzeForms(page);

            // Analyze buttons
            appInfo.buttons = await this.analyzeButtons(page);

            // Analyze links
            appInfo.links = await this.analyzeLinks(page);

            this.output.appendLine(`TestFox Runtime: Analysis complete - Title: ${appInfo.title}`);
            this.output.appendLine(`TestFox Runtime: Found ${appInfo.formElements.length} forms, ${appInfo.buttons.length} buttons, ${appInfo.links.length} links`);

            return appInfo;

        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing application - ${error}`);
            throw error;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
        }
    }

    /**
     * Analyze login form specifically
     */
    private async analyzeLoginForm(page: any): Promise<{ hasLoginForm: boolean; elements: any[] }> {
        try {
            // Look for common login form patterns
            const loginSelectors = [
                'form[action*="login"]',
                'form[action*="signin"]',
                'form[action*="auth"]',
                'form:has(input[type="password"])',
                '.login-form',
                '#login-form',
                '[data-testid*="login"]'
            ];

            for (const selector of loginSelectors) {
                try {
                    const form = await page.$(selector);
                    if (form) {
                        const inputs = await form.$$('input');
                        const elements = [];

                        for (const input of inputs) {
                            const type = await input.getAttribute('type') || 'text';
                            const placeholder = await input.getAttribute('placeholder') || '';
                            const name = await input.getAttribute('name') || '';
                            const required = await input.getAttribute('required') !== null;

                            elements.push({
                                type,
                                selector: `${selector} input[name="${name}"]`,
                                placeholder,
                                required
                            });
                        }

                        if (elements.length > 0) {
                            return { hasLoginForm: true, elements };
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            // Fallback: look for password inputs anywhere on the page
            const passwordInputs = await page.$$('input[type="password"]');
            if (passwordInputs.length > 0) {
                const elements = [];
                for (let i = 0; i < passwordInputs.length; i++) {
                    const input = passwordInputs[i];
                    const placeholder = await input.getAttribute('placeholder') || '';
                    const name = await input.getAttribute('name') || '';

                    elements.push({
                        type: 'password',
                        selector: `input[type="password"]:nth-of-type(${i + 1})`,
                        placeholder,
                        required: true
                    });
                }
                return { hasLoginForm: true, elements };
            }

            return { hasLoginForm: false, elements: [] };

        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing login form - ${error}`);
            return { hasLoginForm: false, elements: [] };
        }
    }

    /**
     * Analyze signup/registration form
     */
    private async analyzeSignupForm(page: any): Promise<{ hasSignupForm: boolean; elements: any[] }> {
        try {
            const signupSelectors = [
                'form[action*="register"]',
                'form[action*="signup"]',
                'form[action*="join"]',
                '.signup-form',
                '.register-form',
                '#signup-form',
                '#register-form',
                '[data-testid*="signup"]',
                '[data-testid*="register"]'
            ];

            for (const selector of signupSelectors) {
                try {
                    const form = await page.$(selector);
                    if (form) {
                        const inputs = await form.$$('input');
                        const elements = [];

                        for (const input of inputs) {
                            const type = await input.getAttribute('type') || 'text';
                            const placeholder = await input.getAttribute('placeholder') || '';
                            const name = await input.getAttribute('name') || '';
                            const required = await input.getAttribute('required') !== null;

                            elements.push({
                                type,
                                selector: `${selector} input[name="${name}"]`,
                                placeholder,
                                required
                            });
                        }

                        if (elements.length > 0) {
                            return { hasSignupForm: true, elements };
                        }
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            return { hasSignupForm: false, elements: [] };

        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing signup form - ${error}`);
            return { hasSignupForm: false, elements: [] };
        }
    }

    /**
     * Analyze navigation elements
     */
    private async analyzeNavigation(page: any): Promise<any[]> {
        try {
            const navElements = [];

            // Find navigation links
            const navSelectors = ['nav a', '.navbar a', '.nav a', '.menu a', 'header a'];

            for (const selector of navSelectors) {
                const links = await page.$$(selector);
                for (const link of links) {
                    try {
                        const text = await link.innerText();
                        const href = await link.getAttribute('href');

                        if (text && text.trim()) {
                            navElements.push({
                                text: text.trim(),
                                href,
                                selector
                            });
                        }
                    } catch (e) {
                        // Skip this link
                    }
                }
            }

            return navElements;
        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing navigation - ${error}`);
            return [];
        }
    }

    /**
     * Analyze all forms on the page
     */
    private async analyzeForms(page: any): Promise<any[]> {
        try {
            const forms = await page.$$('form');
            const formElements = [];

            for (const form of forms) {
                try {
                    const id = await form.getAttribute('id');
                    const action = await form.getAttribute('action');
                    const method = await form.getAttribute('method') || 'GET';

                    const inputs = await form.$$('input, select, textarea');
                    const inputElements = [];

                    for (const input of inputs) {
                        const tagName = await input.evaluate(el => el.tagName.toLowerCase());
                        const type = tagName === 'input' ? (await input.getAttribute('type') || 'text') : tagName;
                        const name = await input.getAttribute('name');
                        const placeholder = await input.getAttribute('placeholder') || '';
                        const required = await input.getAttribute('required') !== null;

                        inputElements.push({
                            name,
                            type,
                            placeholder,
                            required
                        });
                    }

                    formElements.push({
                        id,
                        action,
                        method,
                        inputs: inputElements
                    });
                } catch (e) {
                    // Skip this form
                }
            }

            return formElements;
        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing forms - ${error}`);
            return [];
        }
    }

    /**
     * Analyze buttons on the page
     */
    private async analyzeButtons(page: any): Promise<any[]> {
        try {
            const buttons = await page.$$('button, input[type="submit"], input[type="button"]');
            const buttonElements = [];

            for (const button of buttons) {
                try {
                    const text = await button.innerText() || await button.getAttribute('value') || '';
                    const type = await button.getAttribute('type') || 'button';

                    if (text && text.trim()) {
                        buttonElements.push({
                            text: text.trim(),
                            type,
                            selector: `button:has-text("${text.trim()}")`
                        });
                    }
                } catch (e) {
                    // Skip this button
                }
            }

            return buttonElements;
        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing buttons - ${error}`);
            return [];
        }
    }

    /**
     * Analyze links on the page
     */
    private async analyzeLinks(page: any): Promise<any[]> {
        try {
            const links = await page.$$('a[href]');
            const linkElements = [];

            for (const link of links) {
                try {
                    const text = await link.innerText();
                    const href = await link.getAttribute('href');

                    if (text && text.trim() && href) {
                        linkElements.push({
                            text: text.trim(),
                            href,
                            selector: `a[href="${href}"]`
                        });
                    }
                } catch (e) {
                    // Skip this link
                }
            }

            return linkElements;
        } catch (error) {
            this.output.appendLine(`TestFox Runtime: Error analyzing links - ${error}`);
            return [];
        }
    }

    /**
     * Generate test cases based on runtime analysis
     */
    async generateRuntimeTests(appInfo: RuntimeAppInfo): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        // Generate login tests
        if (appInfo.hasLoginForm) {
            tests.push({
                id: `login-form-${Date.now()}`,
                name: 'Login Form Validation',
                description: 'Test login form with valid and invalid credentials',
                category: 'Functional',
                priority: 'High',
                type: 'UI/E2E',
                status: 'pending',
                steps: [
                    {
                        id: '1',
                        description: 'Navigate to application',
                        action: 'navigate',
                        selector: appInfo.url,
                        expected: 'Login form is visible'
                    },
                    {
                        id: '2',
                        description: 'Enter valid username',
                        action: 'input',
                        selector: appInfo.loginFormElements.find(e => e.type === 'email' || e.type === 'text')?.selector || 'input[type="text"]',
                        value: 'test@example.com',
                        expected: 'Username field accepts input'
                    },
                    {
                        id: '3',
                        description: 'Enter valid password',
                        action: 'input',
                        selector: 'input[type="password"]',
                        value: 'password123',
                        expected: 'Password field accepts input'
                    },
                    {
                        id: '4',
                        description: 'Click login button',
                        action: 'click',
                        selector: 'button[type="submit"], input[type="submit"]',
                        expected: 'Login attempt is made'
                    }
                ],
                tags: ['login', 'authentication', 'form']
            });

            // Invalid login test
            tests.push({
                id: `login-invalid-${Date.now()}`,
                name: 'Login Form - Invalid Credentials',
                description: 'Test login form with invalid credentials',
                category: 'Negative',
                priority: 'Medium',
                type: 'UI/E2E',
                status: 'pending',
                steps: [
                    {
                        id: '1',
                        description: 'Navigate to application',
                        action: 'navigate',
                        selector: appInfo.url,
                        expected: 'Login form is visible'
                    },
                    {
                        id: '2',
                        description: 'Enter invalid username',
                        action: 'input',
                        selector: appInfo.loginFormElements.find(e => e.type === 'email' || e.type === 'text')?.selector || 'input[type="text"]',
                        value: 'invalid@example.com',
                        expected: 'Username field accepts input'
                    },
                    {
                        id: '3',
                        description: 'Enter invalid password',
                        action: 'input',
                        selector: 'input[type="password"]',
                        value: 'wrongpassword',
                        expected: 'Password field accepts input'
                    },
                    {
                        id: '4',
                        description: 'Click login button',
                        action: 'click',
                        selector: 'button[type="submit"], input[type="submit"]',
                        expected: 'Error message is displayed'
                    }
                ],
                tags: ['login', 'authentication', 'negative', 'form']
            });
        }

        // Generate signup tests
        if (appInfo.hasSignupForm) {
            tests.push({
                id: `signup-form-${Date.now()}`,
                name: 'Signup Form Validation',
                description: 'Test signup form with valid data',
                category: 'Functional',
                priority: 'High',
                type: 'UI/E2E',
                status: 'pending',
                steps: [
                    {
                        id: '1',
                        description: 'Navigate to signup page',
                        action: 'navigate',
                        selector: appInfo.url + '/signup',
                        expected: 'Signup form is visible'
                    },
                    {
                        id: '2',
                        description: 'Enter valid email',
                        action: 'input',
                        selector: appInfo.signupFormElements.find(e => e.type === 'email')?.selector || 'input[type="email"]',
                        value: 'newuser@example.com',
                        expected: 'Email field accepts input'
                    },
                    {
                        id: '3',
                        description: 'Enter password',
                        action: 'input',
                        selector: 'input[type="password"]:nth-of-type(1)',
                        value: 'password123',
                        expected: 'Password field accepts input'
                    },
                    {
                        id: '4',
                        description: 'Confirm password',
                        action: 'input',
                        selector: 'input[type="password"]:nth-of-type(2)',
                        value: 'password123',
                        expected: 'Confirm password field accepts input'
                    },
                    {
                        id: '5',
                        description: 'Click signup button',
                        action: 'click',
                        selector: 'button[type="submit"], input[type="submit"]',
                        expected: 'Signup attempt is made'
                    }
                ],
                tags: ['signup', 'registration', 'form']
            });
        }

        // Generate navigation tests
        if (appInfo.navigationElements.length > 0) {
            tests.push({
                id: `navigation-${Date.now()}`,
                name: 'Navigation Links',
                description: 'Test all navigation links are functional',
                category: 'UI/E2E',
                priority: 'Medium',
                type: 'UI/E2E',
                status: 'pending',
                steps: appInfo.navigationElements.map((nav, index) => ({
                    id: (index + 1).toString(),
                    description: `Click navigation link: ${nav.text}`,
                    action: 'click',
                    selector: nav.selector,
                    expected: `Navigation to ${nav.href || nav.text} is successful`
                })),
                tags: ['navigation', 'links']
            });
        }

        // Generate button interaction tests
        if (appInfo.buttons.length > 0) {
            tests.push({
                id: `buttons-${Date.now()}`,
                name: 'Button Interactions',
                description: 'Test all buttons are clickable and functional',
                category: 'UI/E2E',
                priority: 'Low',
                type: 'UI/E2E',
                status: 'pending',
                steps: appInfo.buttons.map((button, index) => ({
                    id: (index + 1).toString(),
                    description: `Click button: ${button.text}`,
                    action: 'click',
                    selector: button.selector,
                    expected: `Button "${button.text}" is clickable`
                })),
                tags: ['buttons', 'interactions']
            });
        }

        this.output.appendLine(`TestFox Runtime: Generated ${tests.length} test cases from runtime analysis`);
        return tests;
    }
}
