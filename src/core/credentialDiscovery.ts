import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredCredential {
    type: 'login' | 'api_key' | 'database' | 'oauth' | 'test_user';
    username?: string;
    email?: string;
    password?: string;
    apiKey?: string;
    source: string;
    line?: number;
    confidence: 'high' | 'medium' | 'low';
}

export interface TestAccount {
    id: string;
    type: 'admin' | 'user' | 'guest' | 'moderator' | 'tester';
    email: string;
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    address?: string;
    created: boolean;
    createdAt?: Date;
    testType?: string;
}

export interface AccountCreationResult {
    success: boolean;
    account: TestAccount;
    error?: string;
    url?: string;
    screenshot?: string;
}

export interface DiscoveredEndpoint {
    url: string;
    type: 'login' | 'register' | 'api' | 'page';
    method?: string;
    source: string;
}

/**
 * Discovers credentials and endpoints from the codebase
 */
export class CredentialDiscovery {
    private workspacePath: string;
    private credentials: DiscoveredCredential[] = [];
    private endpoints: DiscoveredEndpoint[] = [];

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
    }

    /**
     * Discover all credentials in the project
     */
    async discoverCredentials(): Promise<DiscoveredCredential[]> {
        this.credentials = [];

        // Search various sources
        await this.searchEnvFiles();
        await this.searchConfigFiles();
        await this.searchSeedFiles();
        await this.searchTestFiles();
        await this.searchCodeFiles();

        return this.credentials;
    }

    /**
     * Search .env files for credentials
     */
    private async searchEnvFiles(): Promise<void> {
        const envFiles = ['.env', '.env.local', '.env.development', '.env.test', '.env.example'];
        
        for (const envFile of envFiles) {
            const filePath = path.join(this.workspacePath, envFile);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('#') || !line.includes('=')) continue;

                    const [key, ...valueParts] = line.split('=');
                    const value = valueParts.join('=').replace(/["']/g, '').trim();
                    const keyLower = key.toLowerCase();

                    // Look for test/demo credentials
                    if (keyLower.includes('test_user') || keyLower.includes('demo_user') || keyLower.includes('admin_email')) {
                        this.credentials.push({
                            type: 'test_user',
                            email: value,
                            source: envFile,
                            line: i + 1,
                            confidence: 'high'
                        });
                    }

                    if (keyLower.includes('test_password') || keyLower.includes('demo_password') || keyLower.includes('admin_password')) {
                        // Try to associate with previous email
                        const lastCred = this.credentials[this.credentials.length - 1];
                        if (lastCred && !lastCred.password) {
                            lastCred.password = value;
                        } else {
                            this.credentials.push({
                                type: 'test_user',
                                password: value,
                                source: envFile,
                                line: i + 1,
                                confidence: 'medium'
                            });
                        }
                    }

                    // Look for default credentials
                    if (keyLower.includes('default_email') || keyLower.includes('seed_email')) {
                        this.credentials.push({
                            type: 'login',
                            email: value,
                            source: envFile,
                            line: i + 1,
                            confidence: 'medium'
                        });
                    }

                    if (keyLower.includes('default_password') || keyLower.includes('seed_password')) {
                        const lastCred = this.credentials[this.credentials.length - 1];
                        if (lastCred && !lastCred.password) {
                            lastCred.password = value;
                        }
                    }
                }
            }
        }
    }

    /**
     * Search config files for credentials
     */
    private async searchConfigFiles(): Promise<void> {
        const configPatterns = [
            'config/*.json',
            'config/*.js',
            'config/*.ts',
            'src/config/*.ts',
            'app/config/*.ts'
        ];

        for (const pattern of configPatterns) {
            const files = await this.findFiles(pattern);
            for (const file of files) {
                await this.parseConfigFile(file);
            }
        }
    }

    /**
     * Search seed/fixture files for test data
     */
    private async searchSeedFiles(): Promise<void> {
        const seedPatterns = [
            '**/seed*.ts',
            '**/seed*.js',
            '**/fixtures/*.ts',
            '**/fixtures/*.js',
            '**/fixtures/*.json',
            'prisma/seed.ts',
            'prisma/seed.js',
            'db/seeds/*.ts',
            'db/seeds/*.js'
        ];

        for (const pattern of seedPatterns) {
            const files = await this.findFiles(pattern);
            for (const file of files) {
                await this.parseSeedFile(file);
            }
        }
    }

    /**
     * Search test files for test credentials
     */
    private async searchTestFiles(): Promise<void> {
        const testPatterns = [
            '**/*.test.ts',
            '**/*.test.js',
            '**/*.spec.ts',
            '**/*.spec.js',
            '**/tests/**/*.ts',
            '**/tests/**/*.js',
            '**/__tests__/**/*.ts',
            '**/__tests__/**/*.js',
            'cypress/**/*.ts',
            'cypress/**/*.js',
            'e2e/**/*.ts',
            'e2e/**/*.js',
            'playwright/**/*.ts'
        ];

        for (const pattern of testPatterns) {
            const files = await this.findFiles(pattern);
            for (const file of files) {
                await this.parseTestFile(file);
            }
        }
    }

    /**
     * Search regular code files for hardcoded credentials
     */
    private async searchCodeFiles(): Promise<void> {
        const codePatterns = [
            'src/**/*.ts',
            'src/**/*.js',
            'src/**/*.tsx',
            'src/**/*.jsx',
            'app/**/*.ts',
            'app/**/*.tsx',
            'pages/**/*.ts',
            'pages/**/*.tsx'
        ];

        for (const pattern of codePatterns) {
            const files = await this.findFiles(pattern);
            for (const file of files) {
                await this.parseCodeFile(file);
            }
        }
    }

    private async findFiles(pattern: string): Promise<string[]> {
        const files: string[] = [];
        try {
            const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
            for (const uri of uris) {
                files.push(uri.fsPath);
            }
        } catch {
            // Ignore errors
        }
        return files;
    }

    private async parseConfigFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(this.workspacePath, filePath);

            // Look for test/demo credentials in JSON
            if (filePath.endsWith('.json')) {
                try {
                    const json = JSON.parse(content);
                    this.extractFromObject(json, relativePath);
                } catch {
                    // Not valid JSON
                }
            }

            // Look for credential patterns in code
            this.extractCredentialsFromCode(content, relativePath);
        } catch {
            // Ignore read errors
        }
    }

    private async parseSeedFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(this.workspacePath, filePath);

            // Common patterns in seed files
            const patterns = [
                // email: 'test@example.com', password: 'password123'
                /email:\s*['"`]([^'"`]+)['"`].*password:\s*['"`]([^'"`]+)['"`]/gi,
                // { email: '...', password: '...' }
                /\{\s*email:\s*['"`]([^'"`]+)['"`]\s*,\s*password:\s*['"`]([^'"`]+)['"`]/gi,
                // username: '...', password: '...'
                /username:\s*['"`]([^'"`]+)['"`].*password:\s*['"`]([^'"`]+)['"`]/gi,
                // createUser({ email: '...', password: '...' })
                /createUser\s*\(\s*\{[^}]*email:\s*['"`]([^'"`]+)['"`][^}]*password:\s*['"`]([^'"`]+)['"`]/gi,
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    this.credentials.push({
                        type: 'test_user',
                        email: match[1],
                        password: match[2],
                        source: relativePath,
                        confidence: 'high'
                    });
                }
            }

            this.extractCredentialsFromCode(content, relativePath);
        } catch {
            // Ignore errors
        }
    }

    private async parseTestFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(this.workspacePath, filePath);

            // Test files often have explicit test credentials
            const patterns = [
                // const testEmail = 'test@example.com'
                /(?:const|let|var)\s+test(?:Email|User)\s*=\s*['"`]([^'"`]+)['"`]/gi,
                /(?:const|let|var)\s+test(?:Password|Pass)\s*=\s*['"`]([^'"`]+)['"`]/gi,
                // login('email', 'password')
                /login\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*\)/gi,
                // cy.get('[name="email"]').type('test@example.com')
                /\.type\s*\(\s*['"`]([^'"`]+@[^'"`]+)['"`]\s*\)/gi,
                // fill('email', 'test@example.com')
                /fill\s*\(\s*['"`][^'"`]*email[^'"`]*['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*\)/gi,
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    if (match[1] && match[1].includes('@')) {
                        this.credentials.push({
                            type: 'test_user',
                            email: match[1],
                            password: match[2] || undefined,
                            source: relativePath,
                            confidence: 'medium'
                        });
                    }
                }
            }
        } catch {
            // Ignore errors
        }
    }

    private async parseCodeFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const relativePath = path.relative(this.workspacePath, filePath);

            // Look for hardcoded demo/test credentials (low confidence as these might be examples)
            const patterns = [
                // email: 'demo@example.com' (only if contains demo/test/admin)
                /email:\s*['"`]((?:demo|test|admin)[^'"`]*@[^'"`]+)['"`]/gi,
                // defaultCredentials = { email: '...', password: '...' }
                /(?:default|demo|test)(?:Credentials|User|Login)\s*=\s*\{[^}]*email:\s*['"`]([^'"`]+)['"`][^}]*password:\s*['"`]([^'"`]+)['"`]/gi,
            ];

            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    if (match[1]) {
                        this.credentials.push({
                            type: 'login',
                            email: match[1],
                            password: match[2] || undefined,
                            source: relativePath,
                            confidence: 'low'
                        });
                    }
                }
            }
        } catch {
            // Ignore errors
        }
    }

    private extractCredentialsFromCode(content: string, source: string): void {
        // Look for common credential patterns
        const emailPasswordPattern = /['"`]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})['"`].*?['"`]([^'"`]{4,30})['"`]/g;
        
        let match;
        while ((match = emailPasswordPattern.exec(content)) !== null) {
            const email = match[1];
            const potentialPassword = match[2];
            
            // Filter out common non-password strings
            if (!potentialPassword.includes('/') && 
                !potentialPassword.includes('http') &&
                !potentialPassword.includes('.com') &&
                potentialPassword.length >= 4) {
                this.credentials.push({
                    type: 'login',
                    email: email,
                    password: potentialPassword,
                    source: source,
                    confidence: 'low'
                });
            }
        }
    }

    private extractFromObject(obj: any, source: string, prefix = ''): void {
        if (typeof obj !== 'object' || obj === null) return;

        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'string') {
                if (keyLower.includes('email') || keyLower.includes('user')) {
                    if (value.includes('@')) {
                        this.credentials.push({
                            type: 'login',
                            email: value,
                            source: source,
                            confidence: 'medium'
                        });
                    }
                }
                if (keyLower.includes('password') || keyLower.includes('pass')) {
                    const lastCred = this.credentials[this.credentials.length - 1];
                    if (lastCred && lastCred.source === source && !lastCred.password) {
                        lastCred.password = value;
                    }
                }
            } else if (typeof value === 'object') {
                this.extractFromObject(value, source, fullKey);
            }
        }
    }

    /**
     * Get the best credential for login
     */
    getBestCredential(): DiscoveredCredential | null {
        // Prioritize by confidence and completeness
        const complete = this.credentials.filter(c => c.email && c.password);
        
        if (complete.length === 0) return null;

        // Sort by confidence
        const sorted = complete.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.confidence] - order[b.confidence];
        });

        return sorted[0];
    }

    /**
     * Get all discovered credentials
     */
    getAllCredentials(): DiscoveredCredential[] {
        return this.credentials;
    }

    /**
     * Generate test accounts for different testing scenarios
     */
    generateTestAccounts(testTypes: string[] = []): TestAccount[] {
        const accounts: TestAccount[] = [];
        const timestamp = Date.now();

        // Base account types
        const accountTypes: TestAccount['type'][] = ['admin', 'user', 'guest', 'moderator', 'tester'];

        // Generate accounts for each type
        accountTypes.forEach((type, index) => {
            const account: TestAccount = {
                id: `testfox-${type}-${timestamp}-${index}`,
                type,
                email: `${type}@testfox.local`,
                username: `testfox_${type}_${index}`,
                password: `TestFox123!@${type}`,
                firstName: this.generateFirstName(),
                lastName: this.generateLastName(),
                phone: this.generatePhoneNumber(),
                address: this.generateAddress(),
                created: false,
                testType: testTypes.length > 0 ? testTypes[0] : 'general'
            };
            accounts.push(account);
        });

        // Generate additional accounts for specific test types
        testTypes.forEach(testType => {
            if (testType !== 'general') {
                const typeAccount: TestAccount = {
                    id: `testfox-${testType}-${timestamp}`,
                    type: 'tester',
                    email: `${testType}@testfox.local`,
                    username: `testfox_${testType}`,
                    password: `TestFox123!@${testType}`,
                    firstName: this.generateFirstName(),
                    lastName: this.generateLastName(),
                    phone: this.generatePhoneNumber(),
                    address: this.generateAddress(),
                    created: false,
                    testType
                };
                accounts.push(typeAccount);
            }
        });

        // Generate edge case accounts
        const edgeCases = [
            { username: 'test_user_123', email: 'test123@testfox.local', type: 'user' as const },
            { username: 'admin@test', email: 'admin@testfox.local', type: 'admin' as const },
            { username: 'guest.user', email: 'guest@testfox.local', type: 'guest' as const },
            { username: 'mod-2024', email: 'mod@testfox.local', type: 'moderator' as const }
        ];

        edgeCases.forEach((edgeCase, index) => {
            const edgeAccount: TestAccount = {
                id: `testfox-edge-${timestamp}-${index}`,
                type: edgeCase.type,
                email: edgeCase.email,
                username: edgeCase.username,
                password: `EdgeCase123!@${edgeCase.type}`,
                firstName: this.generateFirstName(),
                lastName: this.generateLastName(),
                phone: this.generatePhoneNumber(),
                address: this.generateAddress(),
                created: false,
                testType: 'edge-case'
            };
            accounts.push(edgeAccount);
        });

        return accounts;
    }

    /**
     * Create a test account on the application (if registration endpoint exists)
     */
    async createTestAccount(page: any, account: TestAccount, registerUrl?: string): Promise<AccountCreationResult> {
        const result: AccountCreationResult = {
            success: false,
            account: { ...account }
        };

        try {
            // Try to find registration page
            if (registerUrl) {
                await page.goto(registerUrl);
            } else {
                // Try common registration URLs
                const registerUrls = ['/register', '/signup', '/sign-up', '/join', '/create-account'];
                for (const url of registerUrls) {
                    try {
                        await page.goto(url, { waitUntil: 'networkidle' });
                        // Check if we have registration form elements
                        const hasForm = await page.locator('input[type="email"], input[name*="email"]').count() > 0;
                        if (hasForm) break;
                    } catch {
                        continue;
                    }
                }
            }

            // Wait for form to load
            await page.waitForTimeout(1000);

            // Fill registration form
            const formSelectors = {
                email: 'input[type="email"], input[name*="email"], input[placeholder*="email"]',
                username: 'input[name*="username"], input[name*="user"], input[placeholder*="username"]',
                password: 'input[type="password"], input[name*="password"]',
                confirmPassword: 'input[name*="confirm"], input[name*="repeat"]',
                firstName: 'input[name*="first"], input[name*="fname"]',
                lastName: 'input[name*="last"], input[name*="lname"]',
                phone: 'input[type="tel"], input[name*="phone"]',
                submit: 'button[type="submit"], input[type="submit"], button:has-text("Register"), button:has-text("Sign Up")'
            };

            // Fill email (required)
            try {
                await page.locator(formSelectors.email).first().fill(account.email);
            } catch (error) {
                result.error = 'Could not find email field';
                return result;
            }

            // Fill password (required)
            try {
                const passwordFields = page.locator(formSelectors.password);
                await passwordFields.first().fill(account.password);
                // If there's a confirm password field, fill it too
                if (await passwordFields.count() > 1) {
                    await passwordFields.nth(1).fill(account.password);
                }
            } catch (error) {
                result.error = 'Could not find password field';
                return result;
            }

            // Fill optional fields
            try {
                await page.locator(formSelectors.username).first().fill(account.username).catch(() => {});
                await page.locator(formSelectors.firstName).first().fill(account.firstName).catch(() => {});
                await page.locator(formSelectors.lastName).first().fill(account.lastName).catch(() => {});
                await page.locator(formSelectors.phone).first().fill(account.phone || '').catch(() => {});
            } catch {
                // Optional fields, ignore errors
            }

            // Submit form
            try {
                await page.locator(formSelectors.submit).first().click();
            } catch (error) {
                result.error = 'Could not find submit button';
                return result;
            }

            // Wait for navigation or success message
            await page.waitForTimeout(3000);

            // Check for success indicators
            const successIndicators = [
                'page.locator("text=success")',
                'page.locator("text=account created")',
                'page.locator("text=registration successful")',
                'page.locator("text=welcome")',
                'page.locator("text=verify your email")'
            ];

            let isSuccess = false;
            for (const indicator of successIndicators) {
                try {
                    if (await eval(indicator).count() > 0) {
                        isSuccess = true;
                        break;
                    }
                } catch {
                    continue;
                }
            }

            // Check if we're on a different page (dashboard, login, etc.)
            const currentUrl = page.url();
            if (currentUrl.includes('dashboard') || currentUrl.includes('profile') ||
                currentUrl.includes('home') || !currentUrl.includes('register')) {
                isSuccess = true;
            }

            if (isSuccess) {
                result.success = true;
                result.account.created = true;
                result.account.createdAt = new Date();
                result.url = currentUrl;

                // Take screenshot
                try {
                    result.screenshot = await page.screenshot({ fullPage: false });
                } catch {
                    // Screenshot optional
                }
            } else {
                result.error = 'Registration may have failed - no success indicators found';
            }

        } catch (error: any) {
            result.error = `Registration failed: ${error.message}`;
        }

        return result;
    }

    /**
     * Delete a test account (if account deletion is available)
     */
    async deleteTestAccount(page: any, account: TestAccount): Promise<boolean> {
        try {
            // Try to navigate to account/profile settings
            const profileUrls = ['/profile', '/account', '/settings', '/user'];
            for (const url of profileUrls) {
                try {
                    await page.goto(url);
                    await page.waitForTimeout(1000);
                    break;
                } catch {
                    continue;
                }
            }

            // Look for delete account button/link
            const deleteSelectors = [
                'button:has-text("Delete Account")',
                'button:has-text("Delete")',
                'a:has-text("Delete Account")',
                'button:has-text("Remove Account")',
                'button[class*="delete"]',
                'button[id*="delete"]'
            ];

            for (const selector of deleteSelectors) {
                try {
                    const element = page.locator(selector).first();
                    if (await element.count() > 0) {
                        await element.click();
                        await page.waitForTimeout(1000);

                        // Confirm deletion if confirmation dialog appears
                        try {
                            await page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').first().click();
                            await page.waitForTimeout(2000);
                            return true;
                        } catch {
                            // No confirmation needed
                            return true;
                        }
                    }
                } catch {
                    continue;
                }
            }

            return false; // Could not find delete option
        } catch (error) {
            console.warn(`Could not delete test account ${account.email}:`, error);
            return false;
        }
    }

    // Helper methods for generating realistic test data
    private generateFirstName(): string {
        const firstNames = [
            'John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Robert', 'Emma',
            'James', 'Maria', 'William', 'Jennifer', 'Richard', 'Linda', 'Charles', 'Susan',
            'Joseph', 'Margaret', 'Thomas', 'Dorothy', 'Christopher', 'Barbara', 'Daniel', 'Patricia'
        ];
        return firstNames[Math.floor(Math.random() * firstNames.length)];
    }

    private generateLastName(): string {
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
            'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
            'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White'
        ];
        return lastNames[Math.floor(Math.random() * lastNames.length)];
    }

    private generatePhoneNumber(): string {
        const areaCode = Math.floor(Math.random() * 900) + 100;
        const exchange = Math.floor(Math.random() * 900) + 100;
        const number = Math.floor(Math.random() * 9000) + 1000;
        return `(${areaCode}) ${exchange}-${number}`;
    }

    private generateAddress(): string {
        const streets = ['Main St', 'Oak Ave', 'Pine Rd', 'Cedar Ln', 'Maple Dr', 'Elm St'];
        const streetNumber = Math.floor(Math.random() * 9999) + 1;
        const street = streets[Math.floor(Math.random() * streets.length)];
        return `${streetNumber} ${street}`;
    }
}

