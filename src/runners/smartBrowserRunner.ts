import * as vscode from 'vscode';
import { DiscoveredCredential } from '../core/credentialDiscovery';

// Playwright types - imported dynamically
type Browser = any;
type Page = any;
type BrowserContext = any;

export interface InteractionResult {
    success: boolean;
    action: string;
    element?: string;
    error?: string;
    screenshot?: string;
    timestamp: Date;
}

export interface PageInfo {
    url: string;
    title: string;
    forms: FormInfo[];
    buttons: ButtonInfo[];
    links: LinkInfo[];
    inputs: InputInfo[];
    tables: TableInfo[];
}

export interface FormInfo {
    selector: string;
    action?: string;
    method?: string;
    fields: InputInfo[];
    submitButton?: string;
}

export interface ButtonInfo {
    selector: string;
    text: string;
    type?: string;
    isSubmit: boolean;
}

export interface LinkInfo {
    selector: string;
    href: string;
    text: string;
    isNavigation: boolean;
}

export interface InputInfo {
    selector: string;
    name?: string;
    type: string;
    placeholder?: string;
    required: boolean;
    label?: string;
}

export interface TableInfo {
    selector: string;
    headers: string[];
    rowCount: number;
    hasActions: boolean;
}

/**
 * Smart browser automation that can interact with UI intelligently
 */
export class SmartBrowserRunner {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private baseUrl: string = '';
    private isLoggedIn: boolean = false;
    private interactionLog: InteractionResult[] = [];
    private visitedPages: Set<string> = new Set();
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('TestFox Browser');
    }

    /**
     * Initialize browser
     */
    async initialize(baseUrl: string): Promise<boolean> {
        this.baseUrl = baseUrl;
        this.log(`Initializing browser for ${baseUrl}`);

        try {
            const playwright = require('playwright');
            const config = vscode.workspace.getConfiguration('testfox');
            const headless = config.get<boolean>('browserHeadless', true);

            this.browser = await playwright.chromium.launch({ 
                headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'TestFox/1.0 Automated Testing'
            });
            this.page = await this.context.newPage();

            // Set up console logging
            this.page.on('console', (msg: any) => {
                if (msg.type() === 'error') {
                    this.log(`[Console Error] ${msg.text()}`);
                }
            });

            this.log('Browser initialized successfully');
            return true;
        } catch (error: any) {
            this.log(`Failed to initialize browser: ${error.message}`);
            return false;
        }
    }

    /**
     * Navigate to base URL
     */
    async navigateToHome(): Promise<boolean> {
        if (!this.page) return false;

        try {
            await this.page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
            this.visitedPages.add(this.page.url());
            this.logInteraction('navigate', 'home', true);
            return true;
        } catch (error: any) {
            this.logInteraction('navigate', 'home', false, error.message);
            return false;
        }
    }

    /**
     * Navigate to a specific URL
     */
    async navigateTo(url: string): Promise<boolean> {
        if (!this.page) return false;

        try {
            const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
            await this.page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 15000 });
            this.logInteraction('navigate', url, true);
            return true;
        } catch (error: any) {
            this.logInteraction('navigate', url, false, error.message);
            return false;
        }
    }

    /**
     * Attempt to login with discovered credentials
     */
    async attemptLogin(credential: DiscoveredCredential): Promise<boolean> {
        if (!this.page || !credential.email || !credential.password) {
            return false;
        }

        this.log(`Attempting login with ${credential.email}`);

        try {
            // First, find the login page
            const loginFound = await this.findAndNavigateToLogin();
            if (!loginFound) {
                this.log('Could not find login page');
                return false;
            }

            // Wait for page to load
            await this.page.waitForLoadState('networkidle');

            // Find email/username input
            const emailSelectors = [
                'input[type="email"]',
                'input[name="email"]',
                'input[name="username"]',
                'input[id="email"]',
                'input[id="username"]',
                'input[placeholder*="email" i]',
                'input[placeholder*="username" i]'
            ];

            let emailInput = null;
            for (const selector of emailSelectors) {
                emailInput = await this.page.$(selector);
                if (emailInput) break;
            }

            if (!emailInput) {
                this.log('Could not find email/username input');
                return false;
            }

            // Find password input
            const passwordSelectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[id="password"]'
            ];

            let passwordInput = null;
            for (const selector of passwordSelectors) {
                passwordInput = await this.page.$(selector);
                if (passwordInput) break;
            }

            if (!passwordInput) {
                this.log('Could not find password input');
                return false;
            }

            // Fill in credentials
            await emailInput.fill(credential.email);
            await passwordInput.fill(credential.password);
            this.log('Filled in credentials');

            // Find and click submit button
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Login")',
                'button:has-text("Sign in")',
                'button:has-text("Log in")',
                'button:has-text("Submit")'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                submitButton = await this.page.$(selector);
                if (submitButton) break;
            }

            if (submitButton) {
                await submitButton.click();
                this.log('Clicked submit button');
            } else {
                // Try pressing Enter
                await passwordInput.press('Enter');
                this.log('Pressed Enter to submit');
            }

            // Wait for navigation
            await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

            // Check if login was successful
            const currentUrl = this.page.url();
            const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');
            
            // Look for error messages
            const errorSelectors = [
                '.error',
                '.alert-danger',
                '.alert-error',
                '[role="alert"]',
                '.text-red',
                '.text-danger'
            ];

            let hasError = false;
            for (const selector of errorSelectors) {
                const errorEl = await this.page.$(selector);
                if (errorEl) {
                    const errorText = await errorEl.textContent();
                    if (errorText && errorText.toLowerCase().includes('invalid')) {
                        hasError = true;
                        this.log(`Login error: ${errorText}`);
                        break;
                    }
                }
            }

            if (!isLoginPage && !hasError) {
                this.isLoggedIn = true;
                this.logInteraction('login', credential.email, true);
                this.log('Login successful!');
                return true;
            }

            this.logInteraction('login', credential.email, false, 'Login failed');
            return false;

        } catch (error: any) {
            this.logInteraction('login', credential.email, false, error.message);
            return false;
        }
    }

    /**
     * Attempt to register/create a new account
     */
    async attemptRegistration(credential: DiscoveredCredential): Promise<boolean> {
        if (!this.page || !credential.email || !credential.password) {
            return false;
        }

        this.log(`Attempting to register: ${credential.email}`);

        try {
            // Find registration page
            const registerFound = await this.findAndNavigateToRegister();
            if (!registerFound) {
                this.log('Could not find registration page');
                return false;
            }

            await this.page.waitForLoadState('networkidle');

            // Find all input fields on the registration form
            const inputs = await this.page.$$('input:not([type="hidden"]):not([type="submit"])');
            
            for (const input of inputs) {
                const type = await input.getAttribute('type') || 'text';
                const name = (await input.getAttribute('name') || '').toLowerCase();
                const placeholder = (await input.getAttribute('placeholder') || '').toLowerCase();
                const id = (await input.getAttribute('id') || '').toLowerCase();
                
                const identifier = name || placeholder || id;
                
                try {
                    if (type === 'email' || identifier.includes('email')) {
                        await input.fill(credential.email);
                    } else if (type === 'password') {
                        await input.fill(credential.password);
                    } else if (identifier.includes('name') && identifier.includes('first')) {
                        await input.fill('Test');
                    } else if (identifier.includes('name') && identifier.includes('last')) {
                        await input.fill('Fox');
                    } else if (identifier.includes('name') && !identifier.includes('user')) {
                        await input.fill('Test Fox');
                    } else if (identifier.includes('username') || identifier.includes('user')) {
                        await input.fill(credential.email.split('@')[0]);
                    } else if (identifier.includes('phone') || identifier.includes('tel')) {
                        await input.fill('1234567890');
                    } else if (identifier.includes('confirm') && type === 'password') {
                        await input.fill(credential.password);
                    }
                } catch {
                    // Skip fields that can't be filled
                }
            }

            // Check for checkboxes (terms, newsletter, etc.)
            const checkboxes = await this.page.$$('input[type="checkbox"]');
            for (const checkbox of checkboxes) {
                const name = (await checkbox.getAttribute('name') || '').toLowerCase();
                const id = (await checkbox.getAttribute('id') || '').toLowerCase();
                const identifier = name || id;
                
                // Check terms/agree checkboxes, skip newsletter
                if (identifier.includes('terms') || identifier.includes('agree') || identifier.includes('accept')) {
                    await checkbox.check().catch(() => {});
                }
            }

            // Find and click submit/register button
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Register")',
                'button:has-text("Sign up")',
                'button:has-text("Create account")',
                'button:has-text("Create Account")',
                'button:has-text("Submit")',
                'button:has-text("Join")'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                submitButton = await this.page.$(selector);
                if (submitButton) break;
            }

            if (submitButton) {
                await submitButton.click();
                this.log('Clicked register button');
            }

            await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

            // Check if registration was successful
            const currentUrl = this.page.url();
            const isRegisterPage = currentUrl.includes('register') || currentUrl.includes('signup');
            
            // Look for success indicators
            const successSelectors = [
                '.success',
                '.alert-success',
                ':has-text("Welcome")',
                ':has-text("Account created")',
                ':has-text("Registration successful")'
            ];

            for (const selector of successSelectors) {
                const successEl = await this.page.$(selector);
                if (successEl) {
                    this.isLoggedIn = true;
                    this.logInteraction('register', credential.email, true);
                    this.log('Registration successful!');
                    return true;
                }
            }

            // If we navigated away from register page, likely successful
            if (!isRegisterPage) {
                this.isLoggedIn = true;
                this.logInteraction('register', credential.email, true);
                this.log('Registration likely successful - navigated away');
                return true;
            }

            this.logInteraction('register', credential.email, false, 'Registration may have failed');
            return false;

        } catch (error: any) {
            this.logInteraction('register', credential.email, false, error.message);
            return false;
        }
    }

    /**
     * Find and navigate to registration page
     */
    private async findAndNavigateToRegister(): Promise<boolean> {
        if (!this.page) return false;

        const currentUrl = this.page.url();
        if (currentUrl.includes('register') || currentUrl.includes('signup')) {
            return true;
        }

        // Try common registration URLs
        const registerPaths = ['/register', '/signup', '/sign-up', '/auth/register', '/auth/signup', '/user/register', '/account/create'];
        
        for (const path of registerPaths) {
            try {
                const response = await this.page.goto(`${this.baseUrl}${path}`, { 
                    waitUntil: 'networkidle',
                    timeout: 5000 
                });
                if (response && response.ok()) {
                    return true;
                }
            } catch {
                // Try next path
            }
        }

        // Try to find register link on current page
        const registerLinkSelectors = [
            'a[href*="register"]',
            'a[href*="signup"]',
            'a[href*="sign-up"]',
            'a:has-text("Register")',
            'a:has-text("Sign up")',
            'a:has-text("Create account")',
            'button:has-text("Register")',
            'button:has-text("Sign up")'
        ];

        for (const selector of registerLinkSelectors) {
            const link = await this.page.$(selector);
            if (link) {
                await link.click();
                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                return true;
            }
        }

        return false;
    }

    /**
     * Click ALL interactive elements on the current page
     */
    async clickAllElements(): Promise<InteractionResult[]> {
        const results: InteractionResult[] = [];
        if (!this.page) return results;

        this.log('Clicking all interactive elements...');

        try {
            // Get all clickable elements
            const clickableSelectors = [
                'button:not([disabled])',
                'a[href]:not([href^="mailto:"]):not([href^="tel:"])',
                '[role="button"]',
                '[onclick]',
                'label[for]',
                '.clickable',
                '[tabindex="0"]',
                'summary',
                'details',
                '.btn',
                '.button',
                '[class*="btn"]',
                '[class*="button"]',
                'nav a',
                'menu a',
                '.menu-item',
                '.nav-item',
                '.tab',
                '[role="tab"]',
                '.card:not(.disabled)',
                '[data-toggle]',
                '[data-action]'
            ];

            const clickedElements = new Set<string>();
            const startUrl = this.page.url();

            for (const selector of clickableSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    
                    for (const element of elements) {
                        // Get unique identifier for this element
                        const text = (await element.textContent() || '').trim().substring(0, 30);
                        const href = await element.getAttribute('href') || '';
                        const id = await element.getAttribute('id') || '';
                        const elementId = `${selector}:${text}:${href}:${id}`;
                        
                        // Skip if already clicked
                        if (clickedElements.has(elementId)) continue;
                        clickedElements.add(elementId);

                        // Skip dangerous actions
                        const textLower = text.toLowerCase();
                        if (textLower.includes('delete') || 
                            textLower.includes('remove') ||
                            textLower.includes('logout') ||
                            textLower.includes('sign out') ||
                            textLower.includes('log out')) {
                            this.log(`⚠️ Skipping dangerous action: ${text}`);
                            continue;
                        }

                        // Skip external links
                        if (href && (href.startsWith('http') && !href.includes(this.baseUrl))) {
                            continue;
                        }

                        try {
                            // Check if element is visible
                            const isVisible = await element.isVisible();
                            if (!isVisible) continue;

                            // Get bounding box
                            const box = await element.boundingBox();
                            if (!box || box.width === 0 || box.height === 0) continue;

                            // Click the element
                            await element.click({ timeout: 3000 }).catch(() => {});
                            
                            // Wait briefly for any response
                            await this.page.waitForTimeout(500);
                            
                            results.push({
                                success: true,
                                action: 'click',
                                element: text || href || selector,
                                timestamp: new Date()
                            });
                            
                            this.log(`✓ Clicked: ${text || href || selector}`);

                            // If navigation occurred, go back
                            const currentUrl = this.page.url();
                            if (currentUrl !== startUrl) {
                                // Take a screenshot of the new page
                                await this.takeScreenshot(`page-${Date.now()}`);
                                
                                // Discover elements on new page
                                await this.discoverPageElements();
                                
                                // Go back to continue testing
                                await this.page.goBack().catch(() => {
                                    this.page.goto(startUrl);
                                });
                                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                            }

                            // Handle modals/dialogs that might have opened
                            await this.handleModalIfPresent();

                        } catch (clickError: any) {
                            results.push({
                                success: false,
                                action: 'click',
                                element: text || selector,
                                error: clickError.message,
                                timestamp: new Date()
                            });
                        }
                    }
                } catch {
                    // Continue with next selector
                }
            }

            this.log(`Clicked ${results.filter(r => r.success).length} elements`);

        } catch (error: any) {
            this.log(`Error clicking elements: ${error.message}`);
        }

        return results;
    }

    /**
     * Handle modal/dialog if one is present
     */
    private async handleModalIfPresent(): Promise<void> {
        if (!this.page) return;

        try {
            // Common modal close selectors
            const closeSelectors = [
                '[aria-label="Close"]',
                '.modal .close',
                '.modal-close',
                'button.close',
                '[data-dismiss="modal"]',
                '.dialog-close',
                'button:has-text("Close")',
                'button:has-text("Cancel")',
                'button:has-text("OK")',
                'button:has-text("Got it")',
                'button:has-text("Dismiss")'
            ];

            for (const selector of closeSelectors) {
                const closeBtn = await this.page.$(selector);
                if (closeBtn && await closeBtn.isVisible()) {
                    await closeBtn.click().catch(() => {});
                    await this.page.waitForTimeout(300);
                    this.log('Closed modal/dialog');
                    break;
                }
            }

            // Press Escape as fallback
            await this.page.keyboard.press('Escape').catch(() => {});
        } catch {
            // Ignore modal handling errors
        }
    }

    /**
     * Interact with all form inputs on the page
     */
    async interactWithAllInputs(): Promise<InteractionResult[]> {
        const results: InteractionResult[] = [];
        if (!this.page) return results;

        this.log('Interacting with all form inputs...');

        try {
            // Find all interactive inputs
            const inputs = await this.page.$$('input:not([type="hidden"]):not([type="submit"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');

            for (const input of inputs) {
                const type = await input.getAttribute('type') || 'text';
                const name = await input.getAttribute('name') || '';
                const placeholder = await input.getAttribute('placeholder') || '';
                const tagName = await input.evaluate((el: HTMLElement) => el.tagName.toLowerCase());

                try {
                    if (tagName === 'select') {
                        // Select a random option
                        const options = await input.$$('option');
                        if (options.length > 1) {
                            const randomIndex = Math.floor(Math.random() * (options.length - 1)) + 1;
                            await input.selectOption({ index: randomIndex });
                            results.push({ success: true, action: 'select', element: name, timestamp: new Date() });
                            this.log(`✓ Selected option in: ${name}`);
                        }
                    } else if (type === 'checkbox' || type === 'radio') {
                        // Toggle checkbox/radio
                        const isChecked = await input.isChecked();
                        if (!isChecked) {
                            await input.check().catch(() => {});
                        }
                        results.push({ success: true, action: 'check', element: name, timestamp: new Date() });
                        this.log(`✓ Checked: ${name}`);
                    } else if (type === 'range') {
                        // Move slider
                        await input.fill('50');
                        results.push({ success: true, action: 'slide', element: name, timestamp: new Date() });
                    } else if (type === 'file') {
                        // Skip file inputs - can't safely test
                        continue;
                    } else {
                        // Fill with test data
                        const testValue = this.generateTestData({ 
                            selector: '', 
                            name, 
                            type, 
                            placeholder, 
                            required: false 
                        });
                        await input.fill(testValue);
                        results.push({ success: true, action: 'fill', element: name, timestamp: new Date() });
                        this.log(`✓ Filled: ${name} = ${testValue.substring(0, 20)}`);
                    }
                } catch (error: any) {
                    results.push({ success: false, action: 'interact', element: name, error: error.message, timestamp: new Date() });
                }
            }

        } catch (error: any) {
            this.log(`Error interacting with inputs: ${error.message}`);
        }

        return results;
    }

    /**
     * Find and navigate to login page
     */
    private async findAndNavigateToLogin(): Promise<boolean> {
        if (!this.page) return false;

        // Check if already on login page
        const currentUrl = this.page.url();
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
            return true;
        }

        // Try common login URLs
        const loginPaths = ['/login', '/signin', '/auth/login', '/auth/signin', '/user/login', '/account/login'];
        
        for (const path of loginPaths) {
            try {
                const response = await this.page.goto(`${this.baseUrl}${path}`, { 
                    waitUntil: 'networkidle',
                    timeout: 5000 
                });
                if (response && response.ok()) {
                    return true;
                }
            } catch {
                // Try next path
            }
        }

        // Try to find login link on current page
        const loginLinkSelectors = [
            'a[href*="login"]',
            'a[href*="signin"]',
            'a:has-text("Login")',
            'a:has-text("Sign in")',
            'a:has-text("Log in")',
            'button:has-text("Login")',
            'button:has-text("Sign in")'
        ];

        for (const selector of loginLinkSelectors) {
            const link = await this.page.$(selector);
            if (link) {
                await link.click();
                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                return true;
            }
        }

        return false;
    }

    /**
     * Discover all elements on current page
     */
    async discoverPageElements(): Promise<PageInfo | null> {
        if (!this.page) return null;

        const pageInfo: PageInfo = {
            url: this.page.url(),
            title: await this.page.title(),
            forms: [],
            buttons: [],
            links: [],
            inputs: [],
            tables: []
        };

        try {
            // Discover forms
            const forms = await this.page.$$('form');
            for (const form of forms) {
                const formInfo = await this.analyzeForm(form);
                if (formInfo) pageInfo.forms.push(formInfo);
            }

            // Discover buttons
            const buttons = await this.page.$$('button, input[type="button"], input[type="submit"], [role="button"]');
            for (const button of buttons) {
                const text = await button.textContent() || '';
                const type = await button.getAttribute('type') || '';
                pageInfo.buttons.push({
                    selector: await this.getSelector(button),
                    text: text.trim(),
                    type,
                    isSubmit: type === 'submit'
                });
            }

            // Discover links
            const links = await this.page.$$('a[href]');
            for (const link of links) {
                const href = await link.getAttribute('href') || '';
                const text = await link.textContent() || '';
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    pageInfo.links.push({
                        selector: await this.getSelector(link),
                        href,
                        text: text.trim(),
                        isNavigation: href.startsWith('/') || href.startsWith(this.baseUrl)
                    });
                }
            }

            // Discover standalone inputs
            const inputs = await this.page.$$('input:not([type="hidden"]), textarea, select');
            for (const input of inputs) {
                const inputInfo = await this.analyzeInput(input);
                if (inputInfo) pageInfo.inputs.push(inputInfo);
            }

            // Discover tables
            const tables = await this.page.$$('table');
            for (const table of tables) {
                const tableInfo = await this.analyzeTable(table);
                if (tableInfo) pageInfo.tables.push(tableInfo);
            }

            this.log(`Discovered: ${pageInfo.forms.length} forms, ${pageInfo.buttons.length} buttons, ${pageInfo.links.length} links`);
            return pageInfo;

        } catch (error: any) {
            this.log(`Error discovering elements: ${error.message}`);
            return pageInfo;
        }
    }

    /**
     * Navigate to all discovered links and test each page
     */
    async exploreAllPages(maxPages: number = 20): Promise<PageInfo[]> {
        const pages: PageInfo[] = [];
        const toVisit: string[] = [this.baseUrl];

        while (toVisit.length > 0 && pages.length < maxPages) {
            const url = toVisit.shift()!;
            
            if (this.visitedPages.has(url)) continue;
            this.visitedPages.add(url);

            try {
                await this.page?.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
                const pageInfo = await this.discoverPageElements();
                
                if (pageInfo) {
                    pages.push(pageInfo);
                    
                    // Add new links to visit
                    for (const link of pageInfo.links) {
                        if (link.isNavigation && !this.visitedPages.has(link.href)) {
                            const fullUrl = link.href.startsWith('/') 
                                ? `${this.baseUrl}${link.href}`
                                : link.href;
                            if (fullUrl.startsWith(this.baseUrl)) {
                                toVisit.push(fullUrl);
                            }
                        }
                    }
                }
            } catch (error) {
                this.log(`Error visiting ${url}`);
            }
        }

        return pages;
    }

    /**
     * Test a form by filling and submitting it
     */
    async testForm(form: FormInfo, testData?: Record<string, string>): Promise<InteractionResult> {
        if (!this.page) {
            return { success: false, action: 'testForm', error: 'No page', timestamp: new Date() };
        }

        try {
            // Fill in form fields
            for (const field of form.fields) {
                let value = testData?.[field.name || ''];
                
                if (!value) {
                    // Generate test data based on field type
                    value = this.generateTestData(field);
                }

                if (value) {
                    const input = await this.page.$(field.selector);
                    if (input) {
                        await input.fill(value);
                    }
                }
            }

            // Submit form
            if (form.submitButton) {
                const submitBtn = await this.page.$(form.submitButton);
                if (submitBtn) {
                    await submitBtn.click();
                }
            } else {
                // Try to find submit button within form
                const formEl = await this.page.$(form.selector);
                if (formEl) {
                    const submit = await formEl.$('button[type="submit"], input[type="submit"]');
                    if (submit) {
                        await submit.click();
                    }
                }
            }

            await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

            this.logInteraction('submitForm', form.selector, true);
            return { success: true, action: 'submitForm', element: form.selector, timestamp: new Date() };

        } catch (error: any) {
            this.logInteraction('submitForm', form.selector, false, error.message);
            return { success: false, action: 'submitForm', element: form.selector, error: error.message, timestamp: new Date() };
        }
    }

    /**
     * Click a button and observe results
     */
    async clickButton(button: ButtonInfo): Promise<InteractionResult> {
        if (!this.page) {
            return { success: false, action: 'clickButton', error: 'No page', timestamp: new Date() };
        }

        try {
            const btn = await this.page.$(button.selector);
            if (btn) {
                await btn.click();
                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                
                this.logInteraction('click', button.text, true);
                return { success: true, action: 'click', element: button.text, timestamp: new Date() };
            }
            return { success: false, action: 'click', element: button.text, error: 'Button not found', timestamp: new Date() };
        } catch (error: any) {
            this.logInteraction('click', button.text, false, error.message);
            return { success: false, action: 'click', element: button.text, error: error.message, timestamp: new Date() };
        }
    }

    /**
     * Perform CRUD operations on data tables
     */
    async testCrudOperations(table: TableInfo): Promise<InteractionResult[]> {
        const results: InteractionResult[] = [];
        if (!this.page) return results;

        try {
            // Look for Add/Create button
            const addButtons = await this.page.$$('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), a:has-text("Add"), a:has-text("Create")');
            
            for (const addBtn of addButtons) {
                try {
                    await addBtn.click();
                    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                    
                    // Look for a form that appeared
                    const pageInfo = await this.discoverPageElements();
                    if (pageInfo && pageInfo.forms.length > 0) {
                        const formResult = await this.testForm(pageInfo.forms[0]);
                        results.push(formResult);
                    }
                    
                    // Go back
                    await this.page.goBack().catch(() => {});
                } catch {
                    // Continue
                }
            }

            // Look for Edit buttons in table rows
            const editButtons = await this.page.$$('button:has-text("Edit"), a:has-text("Edit"), [aria-label="Edit"]');
            if (editButtons.length > 0) {
                try {
                    await editButtons[0].click();
                    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                    results.push({ success: true, action: 'edit', element: 'row', timestamp: new Date() });
                    await this.page.goBack().catch(() => {});
                } catch {
                    results.push({ success: false, action: 'edit', error: 'Failed', timestamp: new Date() });
                }
            }

            // Look for Delete buttons
            const deleteButtons = await this.page.$$('button:has-text("Delete"), [aria-label="Delete"]');
            if (deleteButtons.length > 0) {
                results.push({ success: true, action: 'delete', element: 'found', timestamp: new Date() });
                // Don't actually delete - just verify the button exists
            }

        } catch (error: any) {
            results.push({ success: false, action: 'crud', error: error.message, timestamp: new Date() });
        }

        return results;
    }

    private async analyzeForm(formElement: any): Promise<FormInfo | null> {
        try {
            const action = await formElement.getAttribute('action') || '';
            const method = await formElement.getAttribute('method') || 'GET';
            const selector = await this.getSelector(formElement);

            const inputs = await formElement.$$('input:not([type="hidden"]), textarea, select');
            const fields: InputInfo[] = [];

            for (const input of inputs) {
                const inputInfo = await this.analyzeInput(input);
                if (inputInfo) fields.push(inputInfo);
            }

            const submitBtn = await formElement.$('button[type="submit"], input[type="submit"]');
            const submitSelector = submitBtn ? await this.getSelector(submitBtn) : undefined;

            return {
                selector,
                action,
                method,
                fields,
                submitButton: submitSelector
            };
        } catch {
            return null;
        }
    }

    private async analyzeInput(inputElement: any): Promise<InputInfo | null> {
        try {
            const type = await inputElement.getAttribute('type') || 'text';
            const name = await inputElement.getAttribute('name') || '';
            const placeholder = await inputElement.getAttribute('placeholder') || '';
            const required = await inputElement.getAttribute('required') !== null;
            const id = await inputElement.getAttribute('id') || '';
            
            // Try to find associated label
            let label = '';
            if (id) {
                const page = inputElement.page();
                const labelEl = await page.$(`label[for="${id}"]`);
                if (labelEl) {
                    label = await labelEl.textContent() || '';
                }
            }

            return {
                selector: await this.getSelector(inputElement),
                name,
                type,
                placeholder,
                required,
                label: label.trim()
            };
        } catch {
            return null;
        }
    }

    private async analyzeTable(tableElement: any): Promise<TableInfo | null> {
        try {
            const headers: string[] = [];
            const ths = await tableElement.$$('th');
            for (const th of ths) {
                headers.push((await th.textContent() || '').trim());
            }

            const rows = await tableElement.$$('tbody tr');
            const hasActions = await tableElement.$('button, a:has-text("Edit"), a:has-text("Delete")') !== null;

            return {
                selector: await this.getSelector(tableElement),
                headers,
                rowCount: rows.length,
                hasActions
            };
        } catch {
            return null;
        }
    }

    private async getSelector(element: any): Promise<string> {
        try {
            const id = await element.getAttribute('id');
            if (id) return `#${id}`;

            const name = await element.getAttribute('name');
            const tagName = await element.evaluate((el: HTMLElement) => el.tagName.toLowerCase());
            
            if (name) return `${tagName}[name="${name}"]`;

            const className = await element.getAttribute('class');
            if (className) {
                const firstClass = className.split(' ')[0];
                if (firstClass) return `${tagName}.${firstClass}`;
            }

            return tagName;
        } catch {
            return 'unknown';
        }
    }

    private generateTestData(field: InputInfo): string {
        const type = field.type.toLowerCase();
        const name = (field.name || field.label || '').toLowerCase();

        if (type === 'email' || name.includes('email')) {
            return 'testfox@example.com';
        }
        if (type === 'password' || name.includes('password')) {
            return 'TestFox123!';
        }
        if (type === 'tel' || name.includes('phone')) {
            return '1234567890';
        }
        if (type === 'number') {
            return '42';
        }
        if (type === 'url') {
            return 'https://example.com';
        }
        if (name.includes('name')) {
            return 'Test Fox';
        }
        if (name.includes('address')) {
            return '123 Test Street';
        }
        if (name.includes('city')) {
            return 'Test City';
        }
        if (name.includes('zip') || name.includes('postal')) {
            return '12345';
        }
        if (type === 'date') {
            return new Date().toISOString().split('T')[0];
        }

        return 'Test Value';
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    private logInteraction(action: string, element: string, success: boolean, error?: string): void {
        this.interactionLog.push({
            success,
            action,
            element,
            error,
            timestamp: new Date()
        });
        
        const status = success ? '✓' : '✗';
        this.log(`${status} ${action}: ${element}${error ? ` (${error})` : ''}`);
    }

    /**
     * Get all interaction results
     */
    getInteractionLog(): InteractionResult[] {
        return this.interactionLog;
    }

    /**
     * Show output channel
     */
    showOutput(): void {
        this.outputChannel.show();
    }

    /**
     * Take screenshot
     */
    async takeScreenshot(name: string): Promise<string | null> {
        if (!this.page) return null;
        
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) return null;

            const screenshotDir = `${workspaceFolders[0].uri.fsPath}/.testfox/screenshots`;
            const fs = require('fs');
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }

            const filename = `${screenshotDir}/${name}-${Date.now()}.png`;
            await this.page.screenshot({ path: filename, fullPage: true });
            return filename;
        } catch {
            return null;
        }
    }

    /**
     * Close browser
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.context = null;
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.close();
        this.outputChannel.dispose();
    }
}

