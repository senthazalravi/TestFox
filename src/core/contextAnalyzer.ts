import * as vscode from 'vscode';
import { getOpenRouterClient } from '../ai/openRouterClient';
import { TestCase } from '../types';

export interface PageContext {
    url: string;
    title: string;
    description: string;
    pageType: 'landing' | 'login' | 'dashboard' | 'form' | 'product' | 'blog' | 'static' | 'other';
    hasLogin: boolean;
    hasSignup: boolean;
    hasSearch: boolean;
    hasNavigation: boolean;
    hasForms: boolean;
    hasButtons: boolean;
    hasLinks: boolean;
    hasImages: boolean;
    hasVideos: boolean;
    interactiveElements: string[];
    mainContent: string;
    suggestedTests: string[];
}

export interface ElementInfo {
    type: 'button' | 'form' | 'link' | 'input' | 'select' | 'textarea' | 'image' | 'video' | 'table';
    selector: string;
    text?: string;
    label?: string;
    placeholder?: string;
    action?: string;
    href?: string;
    purpose?: string;
}

/**
 * Analyzes web page context to understand what's actually on the page
 * and generates contextual tests based on actual content
 */
export class ContextAnalyzer {
    private openRouter = getOpenRouterClient();

    /**
     * Analyze page content from HTML or browser
     */
    async analyzePageContent(htmlContent: string, url: string): Promise<PageContext> {
        // Extract structured information from HTML
        const elements = this.extractElements(htmlContent);
        
        // Use AI to understand context
        const context = await this.understandContextWithAI(htmlContent, url, elements);
        
        return context;
    }

    /**
     * Extract interactive elements from HTML
     */
    private extractElements(htmlContent: string): ElementInfo[] {
        const elements: ElementInfo[] = [];
        
        // Extract buttons
        const buttonRegex = /<button[^>]*>(.*?)<\/button>/gis;
        let match;
        while ((match = buttonRegex.exec(htmlContent)) !== null) {
            const buttonText = match[1].replace(/<[^>]*>/g, '').trim();
            const idMatch = match[0].match(/id=["']([^"']+)["']/i);
            const classMatch = match[0].match(/class=["']([^"']+)["']/i);
            const typeMatch = match[0].match(/type=["']([^"']+)["']/i);
            
            elements.push({
                type: 'button',
                selector: idMatch ? `#${idMatch[1]}` : classMatch ? `.${classMatch[1].split(' ')[0]}` : 'button',
                text: buttonText,
                purpose: this.inferButtonPurpose(buttonText)
            });
        }

        // Extract forms
        const formRegex = /<form[^>]*>(.*?)<\/form>/gis;
        while ((match = formRegex.exec(htmlContent)) !== null) {
            const formContent = match[1];
            const actionMatch = match[0].match(/action=["']([^"']+)["']/i);
            const methodMatch = match[0].match(/method=["']([^"']+)["']/i);
            const idMatch = match[0].match(/id=["']([^"']+)["']/i);
            
            // Extract form fields
            const inputs: ElementInfo[] = [];
            const inputRegex = /<input[^>]*>/gi;
            let inputMatch;
            while ((inputMatch = inputRegex.exec(formContent)) !== null) {
                const typeMatch = inputMatch[0].match(/type=["']([^"']+)["']/i);
                const nameMatch = inputMatch[0].match(/name=["']([^"']+)["']/i);
                const placeholderMatch = inputMatch[0].match(/placeholder=["']([^"']+)["']/i);
                
                inputs.push({
                    type: 'input',
                    selector: nameMatch ? `input[name="${nameMatch[1]}"]` : 'input',
                    label: placeholderMatch ? placeholderMatch[1] : undefined,
                    placeholder: placeholderMatch ? placeholderMatch[1] : undefined,
                    purpose: this.inferInputPurpose(typeMatch?.[1], placeholderMatch?.[1], nameMatch?.[1])
                });
            }

            elements.push({
                type: 'form',
                selector: idMatch ? `#${idMatch[1]}` : 'form',
                action: actionMatch ? actionMatch[1] : undefined,
                purpose: this.inferFormPurpose(actionMatch?.[1], formContent)
            });
        }

        // Extract links
        const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
        while ((match = linkRegex.exec(htmlContent)) !== null) {
            const href = match[1];
            const linkText = match[2].replace(/<[^>]*>/g, '').trim();
            const idMatch = match[0].match(/id=["']([^"']+)["']/i);
            
            elements.push({
                type: 'link',
                selector: idMatch ? `#${idMatch[1]}` : 'a',
                href: href,
                text: linkText,
                purpose: this.inferLinkPurpose(href, linkText)
            });
        }

        return elements;
    }

    /**
     * Infer button purpose from text
     */
    private inferButtonPurpose(text: string): string {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('login') || lowerText.includes('sign in')) return 'login';
        if (lowerText.includes('signup') || lowerText.includes('sign up') || lowerText.includes('register')) return 'signup';
        if (lowerText.includes('submit')) return 'submit';
        if (lowerText.includes('search')) return 'search';
        if (lowerText.includes('add to cart') || lowerText.includes('buy')) return 'purchase';
        if (lowerText.includes('add') || lowerText.includes('create')) return 'create';
        if (lowerText.includes('delete') || lowerText.includes('remove')) return 'delete';
        if (lowerText.includes('edit') || lowerText.includes('update')) return 'edit';
        return 'action';
    }

    /**
     * Infer input purpose
     */
    private inferInputPurpose(type?: string, placeholder?: string, name?: string): string {
        const searchText = `${type || ''} ${placeholder || ''} ${name || ''}`.toLowerCase();
        if (searchText.includes('email')) return 'email';
        if (searchText.includes('password')) return 'password';
        if (searchText.includes('username') || searchText.includes('user')) return 'username';
        if (searchText.includes('search')) return 'search';
        if (searchText.includes('phone')) return 'phone';
        if (searchText.includes('address')) return 'address';
        if (type === 'email') return 'email';
        if (type === 'password') return 'password';
        if (type === 'search') return 'search';
        return 'input';
    }

    /**
     * Infer form purpose
     */
    private inferFormPurpose(action?: string, content?: string): string {
        const searchText = `${action || ''} ${content || ''}`.toLowerCase();
        if (searchText.includes('login') || searchText.includes('signin')) return 'login';
        if (searchText.includes('signup') || searchText.includes('register')) return 'signup';
        if (searchText.includes('contact')) return 'contact';
        if (searchText.includes('checkout') || searchText.includes('payment')) return 'checkout';
        if (searchText.includes('search')) return 'search';
        return 'form';
    }

    /**
     * Infer link purpose
     */
    private inferLinkPurpose(href: string, text: string): string {
        const searchText = `${href} ${text}`.toLowerCase();
        if (searchText.includes('login') || searchText.includes('signin')) return 'login';
        if (searchText.includes('signup') || searchText.includes('register')) return 'signup';
        if (searchText.includes('logout') || searchText.includes('signout')) return 'logout';
        if (searchText.includes('cart') || searchText.includes('basket')) return 'cart';
        if (searchText.includes('product')) return 'product';
        if (href.startsWith('http') || href.startsWith('//')) return 'external';
        return 'navigation';
    }

    /**
     * Use AI to understand page context and suggest tests
     */
    private async understandContextWithAI(
        htmlContent: string,
        url: string,
        elements: ElementInfo[]
    ): Promise<PageContext> {
        if (!this.openRouter.isConfigured()) {
            // Fallback to rule-based analysis
            return this.analyzeContextRuleBased(htmlContent, url, elements);
        }

        try {
            // Extract text content (remove HTML tags)
            const textContent = htmlContent
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 8000); // Limit content size

            const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : 'Untitled Page';

            // Prepare element summary
            const elementSummary = {
                buttons: elements.filter(e => e.type === 'button').map(e => e.text || e.purpose).join(', '),
                forms: elements.filter(e => e.type === 'form').map(e => e.purpose || 'form').join(', '),
                links: elements.filter(e => e.type === 'link').slice(0, 10).map(e => e.text || e.href).join(', '),
                inputs: elements.filter(e => e.type === 'input').map(e => e.purpose || 'input').join(', ')
            };

            const prompt = `Analyze this web page and provide a structured analysis:

**Page URL:** ${url}
**Page Title:** ${title}

**Page Content (first 8000 chars):**
${textContent}

**Interactive Elements Found:**
- Buttons: ${elementSummary.buttons || 'None'}
- Forms: ${elementSummary.forms || 'None'}
- Links: ${elementSummary.links || 'None'}
- Input Fields: ${elementSummary.inputs || 'None'}

**Your Task:**
1. Determine the page type (landing, login, dashboard, form, product, blog, static, other)
2. Identify what functionality exists (login, signup, search, navigation, forms, etc.)
3. Suggest relevant test cases that should be generated
4. DO NOT suggest tests for features that don't exist (e.g., don't suggest login tests if there's no login button)

Return JSON in this exact format:
{
  "pageType": "landing|login|dashboard|form|product|blog|static|other",
  "description": "Brief description of what this page is",
  "hasLogin": true|false,
  "hasSignup": true|false,
  "hasSearch": true|false,
  "hasNavigation": true|false,
  "hasForms": true|false,
  "hasButtons": true|false,
  "hasLinks": true|false,
  "hasImages": true|false,
  "hasVideos": true|false,
  "interactiveElements": ["element1", "element2"],
  "mainContent": "What is the main purpose/content of this page",
  "suggestedTests": [
    "Test description 1",
    "Test description 2"
  ]
}

Return ONLY valid JSON, no markdown or explanation.`;

            const response = await this.openRouter.chat([
                { role: 'user', content: prompt }
            ], { maxTokens: 2000, temperature: 0.3 });

            // Parse AI response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    url,
                    title,
                    ...parsed,
                    suggestedTests: parsed.suggestedTests || []
                };
            }
        } catch (error) {
            console.error('TestFox: AI context analysis failed, using rule-based:', error);
        }

        // Fallback to rule-based analysis
        return this.analyzeContextRuleBased(htmlContent, url, elements);
    }

    /**
     * Rule-based context analysis (fallback when AI is not available)
     */
    private analyzeContextRuleBased(
        htmlContent: string,
        url: string,
        elements: ElementInfo[]
    ): PageContext {
        const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Untitled Page';

        const buttons = elements.filter(e => e.type === 'button');
        const forms = elements.filter(e => e.type === 'form');
        const links = elements.filter(e => e.type === 'link');
        const inputs = elements.filter(e => e.type === 'input');

        const hasLogin = buttons.some(b => b.purpose === 'login') || 
                        forms.some(f => f.purpose === 'login') ||
                        links.some(l => l.purpose === 'login');
        
        const hasSignup = buttons.some(b => b.purpose === 'signup') || 
                          forms.some(f => f.purpose === 'signup') ||
                          links.some(l => l.purpose === 'signup');

        const hasSearch = buttons.some(b => b.purpose === 'search') ||
                         inputs.some(i => i.purpose === 'search');

        // Determine page type
        let pageType: PageContext['pageType'] = 'other';
        if (hasLogin && !hasSignup) pageType = 'login';
        else if (hasSignup) pageType = 'form';
        else if (forms.length > 0) pageType = 'form';
        else if (htmlContent.toLowerCase().includes('product') || htmlContent.toLowerCase().includes('shop')) pageType = 'product';
        else if (htmlContent.toLowerCase().includes('blog') || htmlContent.toLowerCase().includes('post')) pageType = 'blog';
        else if (buttons.length === 0 && forms.length === 0 && links.length < 5) pageType = 'static';
        else if (url.includes('dashboard') || htmlContent.toLowerCase().includes('dashboard')) pageType = 'dashboard';
        else if (url === '/' || url.endsWith('/index.html') || url.endsWith('/')) pageType = 'landing';

        // Generate suggested tests based on what exists
        const suggestedTests: string[] = [];
        
        if (hasLogin) {
            suggestedTests.push('Verify login form is displayed');
            suggestedTests.push('Test login with valid credentials');
            suggestedTests.push('Test login with invalid credentials');
        }
        
        if (hasSignup) {
            suggestedTests.push('Verify signup form is displayed');
            suggestedTests.push('Test signup form validation');
        }
        
        if (hasSearch) {
            suggestedTests.push('Verify search functionality');
            suggestedTests.push('Test search with valid query');
        }
        
        if (forms.length > 0) {
            suggestedTests.push('Verify all forms are accessible');
            suggestedTests.push('Test form field validation');
        }
        
        if (buttons.length > 0) {
            suggestedTests.push('Verify all buttons are clickable');
            suggestedTests.push('Test button interactions');
        }
        
        if (links.length > 0) {
            suggestedTests.push('Verify all links are accessible');
            suggestedTests.push('Test navigation links');
        }

        if (pageType === 'static') {
            suggestedTests.push('Verify page loads correctly');
            suggestedTests.push('Verify page content is displayed');
        }

        return {
            url,
            title,
            description: `A ${pageType} page`,
            pageType,
            hasLogin,
            hasSignup,
            hasSearch,
            hasNavigation: links.length > 0,
            hasForms: forms.length > 0,
            hasButtons: buttons.length > 0,
            hasLinks: links.length > 0,
            hasImages: htmlContent.includes('<img'),
            hasVideos: htmlContent.includes('<video'),
            interactiveElements: elements.map(e => `${e.type}: ${e.text || e.purpose || e.selector}`),
            mainContent: title,
            suggestedTests
        };
    }

    /**
     * Generate contextual tests based on page analysis
     */
    async generateContextualTests(context: PageContext): Promise<TestCase[]> {
        const tests: TestCase[] = [];

        // Generate tests based on what actually exists
        if (context.hasLogin) {
            tests.push(...this.generateLoginTests(context));
        }

        if (context.hasSignup) {
            tests.push(...this.generateSignupTests(context));
        }

        if (context.hasSearch) {
            tests.push(...this.generateSearchTests(context));
        }

        if (context.hasForms) {
            tests.push(...this.generateFormTests(context));
        }

        if (context.hasButtons) {
            tests.push(...this.generateButtonTests(context));
        }

        if (context.hasLinks) {
            tests.push(...this.generateLinkTests(context));
        }

        if (context.pageType === 'static') {
            tests.push(...this.generateStaticPageTests(context));
        }

        // Always add basic page load test
        tests.push({
            id: `context-${Date.now()}-load`,
            name: `Verify ${context.title} page loads correctly`,
            category: 'smoke',
            priority: 'high',
            description: `Verify that the ${context.title} page loads without errors`,
            steps: [
                `Navigate to ${context.url}`,
                'Wait for page to load',
                'Verify page title is displayed',
                'Check for console errors'
            ],
            expectedResult: 'Page loads successfully without errors',
            automationLevel: 'full',
            targetElement: { path: context.url }
        });

        return tests;
    }

    private generateLoginTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-login-display`,
                name: 'Verify login form is displayed',
                category: 'functional',
                priority: 'high',
                description: 'Verify that login form elements are visible and accessible',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate login form',
                    'Verify email/username field is visible',
                    'Verify password field is visible',
                    'Verify login button is visible'
                ],
                expectedResult: 'All login form elements are displayed correctly',
                automationLevel: 'full',
                targetElement: { path: context.url }
            },
            {
                id: `context-${Date.now()}-login-invalid`,
                name: 'Test login with invalid credentials',
                category: 'functional',
                priority: 'high',
                description: 'Verify that login form rejects invalid credentials',
                steps: [
                    `Navigate to ${context.url}`,
                    'Enter invalid email/username',
                    'Enter invalid password',
                    'Click login button',
                    'Verify error message is displayed'
                ],
                expectedResult: 'Error message is shown for invalid credentials',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateSignupTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-signup-display`,
                name: 'Verify signup form is displayed',
                category: 'functional',
                priority: 'high',
                description: 'Verify that signup form elements are visible',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate signup form',
                    'Verify all required fields are visible',
                    'Verify signup button is visible'
                ],
                expectedResult: 'All signup form elements are displayed correctly',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateSearchTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-search`,
                name: 'Test search functionality',
                category: 'functional',
                priority: 'medium',
                description: 'Verify search functionality works correctly',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate search input field',
                    'Enter search query',
                    'Click search button or press Enter',
                    'Verify search results are displayed'
                ],
                expectedResult: 'Search returns relevant results',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateFormTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-form-validation`,
                name: 'Test form field validation',
                category: 'functional',
                priority: 'medium',
                description: 'Verify form validation works correctly',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate form',
                    'Submit form without filling required fields',
                    'Verify validation errors are displayed',
                    'Fill form with valid data',
                    'Submit form',
                    'Verify form submits successfully'
                ],
                expectedResult: 'Form validation works correctly',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateButtonTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-buttons-clickable`,
                name: 'Verify all buttons are clickable',
                category: 'ui',
                priority: 'medium',
                description: 'Verify that all interactive buttons respond to clicks',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate all buttons on page',
                    'Click each button',
                    'Verify buttons respond to clicks'
                ],
                expectedResult: 'All buttons are clickable and functional',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateLinkTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-links-accessible`,
                name: 'Verify all links are accessible',
                category: 'ui',
                priority: 'medium',
                description: 'Verify that all links on the page are accessible',
                steps: [
                    `Navigate to ${context.url}`,
                    'Locate all links on page',
                    'Verify links have valid href attributes',
                    'Click each link',
                    'Verify links navigate correctly'
                ],
                expectedResult: 'All links are accessible and functional',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }

    private generateStaticPageTests(context: PageContext): TestCase[] {
        return [
            {
                id: `context-${Date.now()}-static-content`,
                name: 'Verify static page content is displayed',
                category: 'ui',
                priority: 'low',
                description: 'Verify that static page content is displayed correctly',
                steps: [
                    `Navigate to ${context.url}`,
                    'Verify page title is displayed',
                    'Verify main content is visible',
                    'Check for broken images',
                    'Verify page layout is correct'
                ],
                expectedResult: 'Static content is displayed correctly',
                automationLevel: 'full',
                targetElement: { path: context.url }
            }
        ];
    }
}

