import { v4 as uuidv4 } from 'uuid';
import { TestStore } from '../store/testStore';
import {
    TestCase,
    TestStep,
    TestCategory,
    AutomationLevel,
    TestPriority,
    IstqbTechnique,
    AnalysisResult,
    RouteInfo,
    FormInfo,
    EndpointInfo,
    AuthFlowInfo,
    SecurityTestType
} from '../types';
import { SecurityPatterns } from '../utils/securityPatterns';

/**
 * Manages test generation across all categories
 */
export class TestGeneratorManager {
    private analysisResult: AnalysisResult | null;

    constructor(private testStore: TestStore) {
        this.analysisResult = testStore.getAnalysisResult();
    }

    async generateSmokeTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Generate smoke tests for critical routes
        for (const route of this.analysisResult.routes.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Smoke: ${route.method} ${route.path} is accessible`,
                description: `Verify that ${route.path} responds with a valid status code`,
                category: 'smoke',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Navigate to or call ${route.path}`, expected: 'Page/endpoint loads' },
                    { order: 2, action: 'Check response status', expected: 'Status is 2xx or valid redirect' }
                ],
                expectedResult: 'Route is accessible and responds correctly',
                targetElement: { type: 'route', path: route.path, method: route.method }
            }));
        }

        // Generate smoke tests for main pages/components
        const pages = this.analysisResult.components.filter(c => c.type === 'page');
        for (const page of pages.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Smoke: ${page.name} page renders`,
                description: `Verify that ${page.name} page loads without errors`,
                category: 'smoke',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Navigate to ${page.name} page`, expected: 'Page renders' },
                    { order: 2, action: 'Check for console errors', expected: 'No critical errors' }
                ],
                expectedResult: 'Page renders successfully without errors',
                targetElement: { type: 'component', selector: page.name }
            }));
        }

        // API smoke tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Smoke: API ${endpoint.method} ${endpoint.path}`,
                description: `Verify API endpoint ${endpoint.path} is available`,
                category: 'smoke',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Call ${endpoint.method} ${endpoint.path}`, expected: 'API responds' },
                    { order: 2, action: 'Validate response format', expected: 'Valid JSON response' }
                ],
                expectedResult: 'API endpoint responds with valid data',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        this.testStore.addTests(tests);
    }

    async generateFunctionalTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Form validation tests
        for (const form of this.analysisResult.forms) {
            // Valid submission test
            tests.push(this.createTest({
                name: `Functional: ${form.name} accepts valid input`,
                description: `Submit ${form.name} with valid data and verify success`,
                category: 'functional',
                subcategory: 'form_validation',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form is displayed' },
                    { order: 2, action: 'Fill in valid data for all fields', expected: 'Data is entered' },
                    { order: 3, action: 'Submit form', expected: 'Form submits successfully' },
                    { order: 4, action: 'Verify success response', expected: 'Success message/redirect' }
                ],
                expectedResult: 'Form submission succeeds with valid data',
                targetElement: { type: 'form', selector: form.name }
            }));

            // Required field tests
            const requiredFields = form.fields.filter(f => f.required);
            for (const field of requiredFields) {
                tests.push(this.createTest({
                    name: `Functional: ${form.name} - ${field.name} required validation`,
                    description: `Verify ${field.name} field shows error when empty`,
                    category: 'functional',
                    subcategory: 'required_fields',
                    automationLevel: 'full',
                    priority: 'medium',
                    istqbTechnique: 'equivalence_partitioning',
                    steps: [
                        { order: 1, action: 'Navigate to form', expected: 'Form is displayed' },
                        { order: 2, action: `Leave ${field.name} empty`, expected: 'Field is empty' },
                        { order: 3, action: 'Submit form', expected: 'Validation error shown' }
                    ],
                    expectedResult: `Error message displayed for empty ${field.name}`,
                    targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                }));
            }
        }

        // Authentication flow tests
        for (const authFlow of this.analysisResult.authFlows) {
            if (authFlow.type === 'login') {
                tests.push(this.createTest({
                    name: 'Functional: Login with valid credentials',
                    description: 'Verify successful login with correct credentials',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'partial',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Enter valid credentials', expected: 'Credentials entered' },
                        { order: 3, action: 'Click login button', expected: 'Login request sent' },
                        { order: 4, action: 'Verify redirect/success', expected: 'User logged in' }
                    ],
                    expectedResult: 'User successfully logged in and redirected',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));

                tests.push(this.createTest({
                    name: 'Functional: Login with invalid credentials',
                    description: 'Verify appropriate error for invalid credentials',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Enter invalid credentials', expected: 'Credentials entered' },
                        { order: 3, action: 'Click login button', expected: 'Login request sent' },
                        { order: 4, action: 'Verify error message', expected: 'Error displayed' }
                    ],
                    expectedResult: 'Error message displayed for invalid credentials',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));
            }

            if (authFlow.type === 'register') {
                tests.push(this.createTest({
                    name: 'Functional: User registration',
                    description: 'Verify new user can register successfully',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'partial',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Navigate to registration page', expected: 'Registration form displayed' },
                        { order: 2, action: 'Fill in valid user details', expected: 'Details entered' },
                        { order: 3, action: 'Submit registration', expected: 'Registration processed' },
                        { order: 4, action: 'Verify account creation', expected: 'Account created' }
                    ],
                    expectedResult: 'New user account created successfully',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));
            }
        }

        // Navigation tests
        for (const route of this.analysisResult.routes.filter(r => r.method === 'GET').slice(0, 15)) {
            tests.push(this.createTest({
                name: `Functional: Navigate to ${route.path}`,
                description: `Verify navigation to ${route.path} works correctly`,
                category: 'functional',
                subcategory: 'navigation',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Navigate to ${route.path}`, expected: 'Page loads' },
                    { order: 2, action: 'Verify page content', expected: 'Expected content visible' },
                    { order: 3, action: 'Check URL', expected: 'URL matches expected' }
                ],
                expectedResult: 'Navigation successful, correct page displayed',
                targetElement: { type: 'route', path: route.path }
            }));
        }

        this.testStore.addTests(tests);
    }

    async generateApiTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        for (const endpoint of this.analysisResult.endpoints) {
            // Success case
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Success`,
                description: `Verify ${endpoint.method} ${endpoint.path} returns expected data`,
                category: 'api',
                subcategory: 'success_cases',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${endpoint.method} request to ${endpoint.path}`, expected: 'Request sent' },
                    { order: 2, action: 'Verify status code', expected: '2xx status code' },
                    { order: 3, action: 'Validate response schema', expected: 'Valid response structure' }
                ],
                expectedResult: 'API returns correct data with valid schema',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Error handling
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Invalid Input`,
                description: `Verify ${endpoint.path} handles invalid input gracefully`,
                category: 'api',
                subcategory: 'error_handling',
                automationLevel: 'full',
                priority: 'medium',
                istqbTechnique: 'error_guessing',
                steps: [
                    { order: 1, action: 'Send request with invalid data', expected: 'Request sent' },
                    { order: 2, action: 'Verify error status code', expected: '4xx status code' },
                    { order: 3, action: 'Check error message', expected: 'Descriptive error message' }
                ],
                expectedResult: 'API returns appropriate error response',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Authentication tests for protected endpoints
            if (endpoint.authentication) {
                tests.push(this.createTest({
                    name: `API: ${endpoint.method} ${endpoint.path} - Unauthorized Access`,
                    description: `Verify ${endpoint.path} rejects unauthenticated requests`,
                    category: 'api',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: 'Send request without auth token', expected: 'Request sent' },
                        { order: 2, action: 'Verify 401 status', expected: '401 Unauthorized' }
                    ],
                    expectedResult: 'Unauthenticated request rejected with 401',
                    targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
                }));
            }
        }

        // Rate limiting tests
        const rateLimitedEndpoints = this.analysisResult.endpoints.filter(e => e.rateLimit);
        for (const endpoint of rateLimitedEndpoints) {
            tests.push(this.createTest({
                name: `API: ${endpoint.path} - Rate Limiting`,
                description: `Verify rate limiting is enforced on ${endpoint.path}`,
                category: 'api',
                subcategory: 'rate_limiting',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Send multiple rapid requests', expected: 'Requests sent' },
                    { order: 2, action: 'Verify rate limit triggered', expected: '429 Too Many Requests' }
                ],
                expectedResult: 'Rate limiting prevents excessive requests',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        this.testStore.addTests(tests);
    }

    async generateSecurityTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // SQL Injection tests
        for (const query of this.analysisResult.databaseQueries.filter(q => !q.parameterized)) {
            tests.push(this.createTest({
                name: `Security: SQL Injection - ${query.file}:${query.line}`,
                description: 'Test for SQL injection vulnerability in database query',
                category: 'security',
                subcategory: 'sql_injection',
                securityType: 'sql_injection',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A03:2021'],
                steps: [
                    { order: 1, action: 'Identify input point', expected: 'Input field found' },
                    { order: 2, action: 'Inject SQL payload: \' OR 1=1 --', expected: 'Payload sent' },
                    { order: 3, action: 'Check for SQL error or data leak', expected: 'No SQL error exposed' },
                    { order: 4, action: 'Test with various payloads', expected: 'All blocked' }
                ],
                expectedResult: 'SQL injection attempts are blocked or sanitized'
            }));
        }

        // XSS tests for forms
        for (const form of this.analysisResult.forms) {
            tests.push(this.createTest({
                name: `Security: XSS - ${form.name}`,
                description: 'Test for Cross-Site Scripting vulnerability',
                category: 'security',
                subcategory: 'xss',
                securityType: 'xss',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A03:2021'],
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                    { order: 2, action: 'Enter XSS payload: <script>alert("XSS")</script>', expected: 'Payload entered' },
                    { order: 3, action: 'Submit and observe output', expected: 'Script not executed' },
                    { order: 4, action: 'Check HTML encoding', expected: 'Output is encoded' }
                ],
                expectedResult: 'XSS payloads are sanitized or encoded',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Auth bypass tests
        for (const authFlow of this.analysisResult.authFlows.filter(a => a.type === 'login')) {
            tests.push(this.createTest({
                name: 'Security: Authentication Bypass',
                description: 'Test for authentication bypass vulnerabilities',
                category: 'security',
                subcategory: 'auth_bypass',
                securityType: 'auth_bypass',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A07:2021'],
                steps: [
                    { order: 1, action: 'Attempt to access protected route without auth', expected: 'Access denied' },
                    { order: 2, action: 'Try with manipulated session/token', expected: 'Access denied' },
                    { order: 3, action: 'Test JWT none algorithm attack', expected: 'Attack blocked' }
                ],
                expectedResult: 'All bypass attempts are blocked',
                targetElement: { type: 'route', path: authFlow.endpoint }
            }));
        }

        // CSRF tests
        for (const form of this.analysisResult.forms.filter(f => f.method === 'POST')) {
            tests.push(this.createTest({
                name: `Security: CSRF - ${form.name}`,
                description: 'Test for Cross-Site Request Forgery protection',
                category: 'security',
                subcategory: 'csrf',
                securityType: 'csrf',
                automationLevel: 'full',
                priority: 'high',
                tags: ['OWASP'],
                steps: [
                    { order: 1, action: 'Check for CSRF token in form', expected: 'Token present' },
                    { order: 2, action: 'Submit without CSRF token', expected: 'Request rejected' },
                    { order: 3, action: 'Submit with invalid CSRF token', expected: 'Request rejected' }
                ],
                expectedResult: 'CSRF protection is properly implemented',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Security headers test
        tests.push(this.createTest({
            name: 'Security: HTTP Security Headers',
            description: 'Verify security headers are properly set',
            category: 'security',
            subcategory: 'security_headers',
            securityType: 'security_headers',
            automationLevel: 'full',
            priority: 'high',
            tags: ['OWASP'],
            steps: [
                { order: 1, action: 'Send request to application', expected: 'Response received' },
                { order: 2, action: 'Check X-Content-Type-Options', expected: 'nosniff' },
                { order: 3, action: 'Check X-Frame-Options', expected: 'DENY or SAMEORIGIN' },
                { order: 4, action: 'Check Content-Security-Policy', expected: 'CSP header present' },
                { order: 5, action: 'Check Strict-Transport-Security', expected: 'HSTS header present' }
            ],
            expectedResult: 'All security headers properly configured'
        }));

        // Sensitive data exposure tests
        for (const endpoint of this.analysisResult.endpoints) {
            tests.push(this.createTest({
                name: `Security: Sensitive Data - ${endpoint.path}`,
                description: 'Check for sensitive data exposure in API response',
                category: 'security',
                subcategory: 'sensitive_data',
                securityType: 'sensitive_data',
                automationLevel: 'full',
                priority: 'high',
                tags: ['OWASP', 'A02:2021'],
                steps: [
                    { order: 1, action: `Call ${endpoint.path}`, expected: 'Response received' },
                    { order: 2, action: 'Check for password in response', expected: 'No passwords exposed' },
                    { order: 3, action: 'Check for tokens/secrets', expected: 'No secrets exposed' },
                    { order: 4, action: 'Verify PII handling', expected: 'PII properly protected' }
                ],
                expectedResult: 'No sensitive data exposed in response',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        this.testStore.addTests(tests);
    }

    async generatePerformanceTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Page load performance
        for (const route of this.analysisResult.routes.filter(r => r.method === 'GET').slice(0, 10)) {
            tests.push(this.createTest({
                name: `Performance: Page Load - ${route.path}`,
                description: `Measure load time for ${route.path}`,
                category: 'performance',
                subcategory: 'page_load',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Navigate to ${route.path}`, expected: 'Page loads' },
                    { order: 2, action: 'Measure Time to First Byte', expected: '<200ms' },
                    { order: 3, action: 'Measure First Contentful Paint', expected: '<1.5s' },
                    { order: 4, action: 'Measure Largest Contentful Paint', expected: '<2.5s' }
                ],
                expectedResult: 'Page meets performance thresholds',
                targetElement: { type: 'route', path: route.path },
                timeout: 30000
            }));
        }

        // API response time
        for (const endpoint of this.analysisResult.endpoints.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Performance: API Response - ${endpoint.method} ${endpoint.path}`,
                description: `Measure response time for ${endpoint.path}`,
                category: 'performance',
                subcategory: 'api_response',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Call ${endpoint.method} ${endpoint.path}`, expected: 'Request sent' },
                    { order: 2, action: 'Measure response time', expected: '<500ms' },
                    { order: 3, action: 'Verify response size', expected: 'Reasonable size' }
                ],
                expectedResult: 'API responds within acceptable time',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method },
                timeout: 10000
            }));
        }

        // Memory usage test
        tests.push(this.createTest({
            name: 'Performance: Memory Usage',
            description: 'Monitor application memory usage under normal operation',
            category: 'performance',
            subcategory: 'memory',
            automationLevel: 'partial',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Record initial memory usage', expected: 'Baseline recorded' },
                { order: 2, action: 'Perform typical user actions', expected: 'Actions completed' },
                { order: 3, action: 'Check for memory leaks', expected: 'No significant leaks' },
                { order: 4, action: 'Compare final vs initial memory', expected: 'Within acceptable range' }
            ],
            expectedResult: 'No memory leaks detected'
        }));

        this.testStore.addTests(tests);
    }

    async generateEdgeCaseTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Boundary value tests for form fields
        for (const form of this.analysisResult.forms) {
            for (const field of form.fields) {
                if (field.minLength !== undefined || field.maxLength !== undefined) {
                    tests.push(this.createTest({
                        name: `Edge Case: ${form.name} - ${field.name} boundary values`,
                        description: `Test ${field.name} with boundary values`,
                        category: 'edge_cases',
                        subcategory: 'boundary_value',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter min length value (${field.minLength})`, expected: 'Accepted' },
                            { order: 2, action: `Enter min length - 1 (${(field.minLength || 0) - 1})`, expected: 'Rejected' },
                            { order: 3, action: `Enter max length value (${field.maxLength})`, expected: 'Accepted' },
                            { order: 4, action: `Enter max length + 1 (${(field.maxLength || 0) + 1})`, expected: 'Rejected' }
                        ],
                        expectedResult: 'Boundary values handled correctly',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }

                if (field.min !== undefined || field.max !== undefined) {
                    tests.push(this.createTest({
                        name: `Edge Case: ${form.name} - ${field.name} numeric boundaries`,
                        description: `Test ${field.name} with numeric boundary values`,
                        category: 'edge_cases',
                        subcategory: 'boundary_value',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter min value (${field.min})`, expected: 'Accepted' },
                            { order: 2, action: `Enter min - 1 (${(field.min || 0) - 1})`, expected: 'Rejected' },
                            { order: 3, action: `Enter max value (${field.max})`, expected: 'Accepted' },
                            { order: 4, action: `Enter max + 1 (${(field.max || 0) + 1})`, expected: 'Rejected' }
                        ],
                        expectedResult: 'Numeric boundaries enforced correctly',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }
            }
        }

        // Empty/null input tests
        for (const form of this.analysisResult.forms) {
            tests.push(this.createTest({
                name: `Edge Case: ${form.name} - Empty submission`,
                description: `Submit ${form.name} with all fields empty`,
                category: 'edge_cases',
                subcategory: 'empty_input',
                automationLevel: 'full',
                priority: 'medium',
                istqbTechnique: 'equivalence_partitioning',
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                    { order: 2, action: 'Leave all fields empty', expected: 'Fields empty' },
                    { order: 3, action: 'Submit form', expected: 'Appropriate validation' }
                ],
                expectedResult: 'Form handles empty submission gracefully',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Special characters test
        for (const form of this.analysisResult.forms) {
            tests.push(this.createTest({
                name: `Edge Case: ${form.name} - Special characters`,
                description: `Test ${form.name} with special characters input`,
                category: 'edge_cases',
                subcategory: 'special_chars',
                automationLevel: 'full',
                priority: 'medium',
                istqbTechnique: 'error_guessing',
                steps: [
                    { order: 1, action: 'Enter unicode characters: 日本語', expected: 'Handled correctly' },
                    { order: 2, action: 'Enter emoji: 🦊🔥', expected: 'Handled correctly' },
                    { order: 3, action: 'Enter special chars: <>&"\'', expected: 'Escaped properly' },
                    { order: 4, action: 'Enter null byte: \\x00', expected: 'Handled safely' }
                ],
                expectedResult: 'Special characters handled without errors',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Large input tests
        tests.push(this.createTest({
            name: 'Edge Case: Large Input Handling',
            description: 'Test application with extremely large inputs',
            category: 'edge_cases',
            subcategory: 'large_input',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Enter very long string (10,000+ chars)', expected: 'Handled gracefully' },
                { order: 2, action: 'Upload large file (if applicable)', expected: 'Proper size validation' },
                { order: 3, action: 'Send large request payload', expected: 'Request limited or handled' }
            ],
            expectedResult: 'Large inputs are handled without crashing'
        }));

        // Concurrent operations test
        tests.push(this.createTest({
            name: 'Edge Case: Concurrent Operations',
            description: 'Test handling of concurrent/duplicate submissions',
            category: 'edge_cases',
            subcategory: 'concurrency',
            automationLevel: 'partial',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Submit same form twice rapidly', expected: 'Duplicate prevented' },
                { order: 2, action: 'Click submit multiple times', expected: 'Single submission' },
                { order: 3, action: 'Concurrent API calls with same data', expected: 'Handled correctly' }
            ],
            expectedResult: 'Concurrent operations handled safely'
        }));

        this.testStore.addTests(tests);
    }

    async generateMonkeyTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Random click tests
        for (const page of this.analysisResult.components.filter(c => c.type === 'page').slice(0, 5)) {
            tests.push(this.createTest({
                name: `Monkey: Random interactions - ${page.name}`,
                description: `Perform random clicks and inputs on ${page.name}`,
                category: 'monkey',
                automationLevel: 'full',
                priority: 'low',
                istqbTechnique: 'exploratory',
                steps: [
                    { order: 1, action: `Navigate to ${page.name}`, expected: 'Page loads' },
                    { order: 2, action: 'Click random elements (50 times)', expected: 'No crashes' },
                    { order: 3, action: 'Enter random text in inputs', expected: 'No crashes' },
                    { order: 4, action: 'Rapid navigation/refresh', expected: 'App remains stable' }
                ],
                expectedResult: 'Application remains stable under random inputs',
                targetElement: { type: 'component', selector: page.name }
            }));
        }

        // Random API bombardment
        tests.push(this.createTest({
            name: 'Monkey: Random API Calls',
            description: 'Send random/malformed requests to API endpoints',
            category: 'monkey',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Send requests with random methods', expected: 'Proper error handling' },
                { order: 2, action: 'Send malformed JSON', expected: 'Parse error handled' },
                { order: 3, action: 'Send unexpected content types', expected: 'Rejected gracefully' },
                { order: 4, action: 'Random query parameters', expected: 'Ignored or validated' }
            ],
            expectedResult: 'API handles random inputs gracefully'
        }));

        this.testStore.addTests(tests);
    }

    async generateFeatureTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Feature tests are typically manual, based on business logic
        tests.push(this.createTest({
            name: 'Feature: Core Business Workflow',
            description: 'Verify the primary business workflow functions correctly',
            category: 'feature',
            automationLevel: 'manual',
            priority: 'critical',
            istqbTechnique: 'use_case',
            steps: [
                { order: 1, action: 'Complete primary user journey', expected: 'Workflow completes' },
                { order: 2, action: 'Verify all steps function correctly', expected: 'All steps pass' },
                { order: 3, action: 'Check data persistence', expected: 'Data saved correctly' }
            ],
            expectedResult: 'Business workflow functions as designed'
        }));

        // Component-based feature tests
        for (const component of this.analysisResult.components.filter(c => c.type === 'page').slice(0, 10)) {
            tests.push(this.createTest({
                name: `Feature: ${component.name} - User Experience`,
                description: `Verify ${component.name} provides good user experience`,
                category: 'feature',
                automationLevel: 'manual',
                priority: 'medium',
                istqbTechnique: 'use_case',
                steps: [
                    { order: 1, action: `Navigate to ${component.name}`, expected: 'Page loads quickly' },
                    { order: 2, action: 'Verify layout and design', expected: 'Looks correct' },
                    { order: 3, action: 'Check responsive behavior', expected: 'Works on all sizes' },
                    { order: 4, action: 'Test accessibility', expected: 'Accessible' }
                ],
                expectedResult: 'Component provides good user experience',
                targetElement: { type: 'component', selector: component.name }
            }));
        }

        this.testStore.addTests(tests);
    }

    async generateLoadTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Load tests for critical endpoints
        for (const endpoint of this.analysisResult.endpoints.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Load: ${endpoint.method} ${endpoint.path}`,
                description: `Test ${endpoint.path} under concurrent user load`,
                category: 'load',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Simulate 10 concurrent users', expected: 'All requests handled' },
                    { order: 2, action: 'Measure average response time', expected: '<1s average' },
                    { order: 3, action: 'Check error rate', expected: '<1% error rate' },
                    { order: 4, action: 'Verify no data corruption', expected: 'Data integrity maintained' }
                ],
                expectedResult: 'Endpoint handles load within acceptable parameters',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Stress test
        tests.push(this.createTest({
            name: 'Load: Stress Test',
            description: 'Test application behavior under extreme load',
            category: 'load',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Gradually increase concurrent users', expected: 'Performance degrades gracefully' },
                { order: 2, action: 'Identify breaking point', expected: 'Documented' },
                { order: 3, action: 'Check recovery after load reduction', expected: 'App recovers' }
            ],
            expectedResult: 'Application handles stress gracefully'
        }));

        this.testStore.addTests(tests);
    }

    /**
     * Generate negative tests - Invalid inputs, error paths, failure scenarios
     */
    async generateNegativeTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Invalid input tests for forms
        for (const form of this.analysisResult.forms) {
            for (const field of form.fields) {
                // Invalid format test
                tests.push(this.createTest({
                    name: `Negative: ${form.name} - Invalid ${field.name} format`,
                    description: `Verify ${field.name} rejects invalid format`,
                    category: 'negative',
                    subcategory: 'invalid_format',
                    automationLevel: 'full',
                    priority: 'high',
                    istqbTechnique: 'equivalence_partitioning',
                    steps: [
                        { order: 1, action: `Navigate to ${form.name}`, expected: 'Form displayed' },
                        { order: 2, action: `Enter invalid format in ${field.name}`, expected: 'Invalid data entered' },
                        { order: 3, action: 'Attempt submission', expected: 'Validation error shown' }
                    ],
                    expectedResult: 'Invalid format is rejected with clear error message',
                    targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                }));
            }

            // Empty form submission
            tests.push(this.createTest({
                name: `Negative: ${form.name} - All fields empty`,
                description: 'Submit form with all required fields empty',
                category: 'negative',
                subcategory: 'empty_input',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                    { order: 2, action: 'Leave all fields empty', expected: 'Fields are blank' },
                    { order: 3, action: 'Submit form', expected: 'Validation prevents submission' }
                ],
                expectedResult: 'Form shows validation errors for required fields',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Invalid authentication tests
        for (const authFlow of this.analysisResult.authFlows.filter(a => a.type === 'login')) {
            tests.push(this.createTest({
                name: 'Negative: Login with wrong password',
                description: 'Attempt login with incorrect password',
                category: 'negative',
                subcategory: 'authentication',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Navigate to login', expected: 'Login form displayed' },
                    { order: 2, action: 'Enter valid username', expected: 'Username entered' },
                    { order: 3, action: 'Enter incorrect password', expected: 'Wrong password entered' },
                    { order: 4, action: 'Submit login', expected: 'Login fails' }
                ],
                expectedResult: 'Login fails with generic error message (no info leak)',
                targetElement: { type: 'route', path: authFlow.endpoint }
            }));

            tests.push(this.createTest({
                name: 'Negative: Login with non-existent user',
                description: 'Attempt login with unregistered email',
                category: 'negative',
                subcategory: 'authentication',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Navigate to login', expected: 'Login form displayed' },
                    { order: 2, action: 'Enter non-existent email', expected: 'Email entered' },
                    { order: 3, action: 'Enter any password', expected: 'Password entered' },
                    { order: 4, action: 'Submit login', expected: 'Login fails' }
                ],
                expectedResult: 'Same error as wrong password (prevents user enumeration)',
                targetElement: { type: 'route', path: authFlow.endpoint }
            }));
        }

        // API error handling tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Negative: ${endpoint.method} ${endpoint.path} - Malformed JSON`,
                description: 'Send malformed JSON to endpoint',
                category: 'negative',
                subcategory: 'api_errors',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Send request with malformed JSON', expected: 'Request sent' },
                    { order: 2, action: 'Verify 400 response', expected: '400 Bad Request' },
                    { order: 3, action: 'Check error message', expected: 'Descriptive error' }
                ],
                expectedResult: 'API returns 400 with helpful error message',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate boundary tests - BVA (Boundary Value Analysis)
     */
    async generateBoundaryTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        for (const form of this.analysisResult.forms) {
            for (const field of form.fields) {
                if (field.minLength !== undefined || field.maxLength !== undefined) {
                    const min = field.minLength || 0;
                    const max = field.maxLength || 255;

                    tests.push(this.createTest({
                        name: `Boundary: ${form.name} - ${field.name} at minimum length`,
                        description: `Test ${field.name} with exactly ${min} characters`,
                        category: 'boundary',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter exactly ${min} characters`, expected: 'Accepted' }
                        ],
                        expectedResult: 'Minimum length input is accepted',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));

                    tests.push(this.createTest({
                        name: `Boundary: ${form.name} - ${field.name} below minimum`,
                        description: `Test ${field.name} with ${min - 1} characters`,
                        category: 'boundary',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter ${min - 1} characters`, expected: 'Rejected' }
                        ],
                        expectedResult: 'Below minimum is rejected',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));

                    tests.push(this.createTest({
                        name: `Boundary: ${form.name} - ${field.name} at maximum length`,
                        description: `Test ${field.name} with exactly ${max} characters`,
                        category: 'boundary',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter exactly ${max} characters`, expected: 'Accepted' }
                        ],
                        expectedResult: 'Maximum length input is accepted',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));

                    tests.push(this.createTest({
                        name: `Boundary: ${form.name} - ${field.name} above maximum`,
                        description: `Test ${field.name} with ${max + 1} characters`,
                        category: 'boundary',
                        automationLevel: 'full',
                        priority: 'medium',
                        istqbTechnique: 'boundary_value_analysis',
                        steps: [
                            { order: 1, action: `Enter ${max + 1} characters`, expected: 'Rejected or truncated' }
                        ],
                        expectedResult: 'Above maximum is rejected or truncated',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }
            }
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate accessibility tests - WCAG 2.1 compliance
     */
    async generateAccessibilityTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Global accessibility tests
        tests.push(this.createTest({
            name: 'Accessibility: Keyboard Navigation',
            description: 'Verify all interactive elements are keyboard accessible',
            category: 'accessibility',
            automationLevel: 'partial',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate using Tab key only', expected: 'All elements reachable' },
                { order: 2, action: 'Check focus indicators', expected: 'Clear focus visible' },
                { order: 3, action: 'Test Enter/Space activation', expected: 'Elements activate' },
                { order: 4, action: 'Test Escape to close modals', expected: 'Modals close' }
            ],
            expectedResult: 'Full keyboard accessibility'
        }));

        tests.push(this.createTest({
            name: 'Accessibility: Screen Reader Compatibility',
            description: 'Verify content is accessible via screen readers',
            category: 'accessibility',
            automationLevel: 'manual',
            priority: 'high',
            steps: [
                { order: 1, action: 'Enable screen reader (NVDA/VoiceOver)', expected: 'Reader active' },
                { order: 2, action: 'Navigate through page', expected: 'Content announced' },
                { order: 3, action: 'Check form labels', expected: 'Labels read correctly' },
                { order: 4, action: 'Verify image alt text', expected: 'Images described' }
            ],
            expectedResult: 'Screen reader can navigate and understand content'
        }));

        tests.push(this.createTest({
            name: 'Accessibility: Color Contrast',
            description: 'Verify text meets WCAG AA contrast requirements',
            category: 'accessibility',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Check normal text contrast (4.5:1)', expected: 'Meets requirement' },
                { order: 2, action: 'Check large text contrast (3:1)', expected: 'Meets requirement' },
                { order: 3, action: 'Check UI components (3:1)', expected: 'Meets requirement' }
            ],
            expectedResult: 'All text meets WCAG AA contrast requirements'
        }));

        tests.push(this.createTest({
            name: 'Accessibility: ARIA Labels',
            description: 'Verify interactive elements have proper ARIA labels',
            category: 'accessibility',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Check buttons have accessible names', expected: 'Names present' },
                { order: 2, action: 'Check form inputs have labels', expected: 'Labels linked' },
                { order: 3, action: 'Verify landmarks are used', expected: 'Landmarks present' }
            ],
            expectedResult: 'All elements have proper ARIA implementation'
        }));

        // Form-specific accessibility
        for (const form of this.analysisResult.forms.slice(0, 3)) {
            tests.push(this.createTest({
                name: `Accessibility: ${form.name} - Form Labels`,
                description: `Verify ${form.name} has proper form accessibility`,
                category: 'accessibility',
                subcategory: 'forms',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: 'Check all inputs have labels', expected: 'Labels present' },
                    { order: 2, action: 'Verify error messages are announced', expected: 'Errors accessible' },
                    { order: 3, action: 'Test form with keyboard only', expected: 'Fully usable' }
                ],
                expectedResult: 'Form is fully accessible',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate sanity tests - Quick validation after changes
     */
    async generateSanityTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Quick smoke for most critical paths
        tests.push(this.createTest({
            name: 'Sanity: Application Starts',
            description: 'Verify application starts without errors',
            category: 'sanity',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Start application', expected: 'App starts' },
                { order: 2, action: 'Check for console errors', expected: 'No critical errors' },
                { order: 3, action: 'Verify home page loads', expected: 'Home page visible' }
            ],
            expectedResult: 'Application starts successfully'
        }));

        tests.push(this.createTest({
            name: 'Sanity: Core Navigation Works',
            description: 'Verify main navigation functions',
            category: 'sanity',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Click main navigation links', expected: 'Pages load' },
                { order: 2, action: 'Use browser back/forward', expected: 'Navigation works' }
            ],
            expectedResult: 'Navigation is functional'
        }));

        // Auth sanity if present
        if (this.analysisResult.authFlows.length > 0) {
            tests.push(this.createTest({
                name: 'Sanity: Authentication Works',
                description: 'Verify login/logout functionality',
                category: 'sanity',
                automationLevel: 'partial',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Login with test credentials', expected: 'Login succeeds' },
                    { order: 2, action: 'Verify session is created', expected: 'Session active' },
                    { order: 3, action: 'Logout', expected: 'Logout succeeds' }
                ],
                expectedResult: 'Authentication cycle works'
            }));
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate regression tests - Verify existing features
     */
    async generateRegressionTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Create regression tests based on existing routes and endpoints
        for (const route of this.analysisResult.routes.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Regression: ${route.method} ${route.path}`,
                description: `Verify ${route.path} still works as expected`,
                category: 'regression',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate/call ${route.path}`, expected: 'Route responds' },
                    { order: 2, action: 'Verify response matches expected', expected: 'Correct response' },
                    { order: 3, action: 'Check for regressions', expected: 'No changes from baseline' }
                ],
                expectedResult: 'Route behaves as documented',
                targetElement: { type: 'route', path: route.path, method: route.method }
            }));
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate integration tests - Component interactions
     */
    async generateIntegrationTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        // Database integration tests
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Integration: Database Connection',
                description: 'Verify database connection and basic operations',
                category: 'integration',
                subcategory: 'database',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Establish database connection', expected: 'Connected' },
                    { order: 2, action: 'Perform read operation', expected: 'Data retrieved' },
                    { order: 3, action: 'Perform write operation', expected: 'Data saved' },
                    { order: 4, action: 'Verify transaction rollback', expected: 'Rollback works' }
                ],
                expectedResult: 'Database integration is functional'
            }));
        }

        // External API integration
        if (this.analysisResult.externalApis.length > 0) {
            for (const api of this.analysisResult.externalApis.slice(0, 3)) {
                tests.push(this.createTest({
                    name: `Integration: External API - ${api.url}`,
                    description: `Verify integration with ${api.url}`,
                    category: 'integration',
                    subcategory: 'external_api',
                    automationLevel: 'partial',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Call external API', expected: 'API responds' },
                        { order: 2, action: 'Handle success response', expected: 'Data processed' },
                        { order: 3, action: 'Handle error response', expected: 'Error handled gracefully' },
                        { order: 4, action: 'Handle timeout', expected: 'Timeout handled' }
                    ],
                    expectedResult: 'External API integration works correctly'
                }));
            }
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate usability tests - UX evaluation
     */
    async generateUsabilityTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        tests.push(this.createTest({
            name: 'Usability: First-Time User Experience',
            description: 'Evaluate experience for new users',
            category: 'usability',
            automationLevel: 'manual',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Observe new user attempting tasks', expected: 'Note difficulties' },
                { order: 2, action: 'Measure time to complete key tasks', expected: 'Document times' },
                { order: 3, action: 'Collect user feedback', expected: 'Feedback recorded' }
            ],
            expectedResult: 'Identify UX improvements'
        }));

        tests.push(this.createTest({
            name: 'Usability: Error Message Clarity',
            description: 'Verify error messages are helpful',
            category: 'usability',
            automationLevel: 'manual',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Trigger various errors', expected: 'Errors displayed' },
                { order: 2, action: 'Evaluate message clarity', expected: 'Messages understandable' },
                { order: 3, action: 'Check for recovery guidance', expected: 'Clear next steps' }
            ],
            expectedResult: 'Error messages help users recover'
        }));

        tests.push(this.createTest({
            name: 'Usability: Mobile Responsiveness',
            description: 'Verify usability on mobile devices',
            category: 'usability',
            automationLevel: 'partial',
            priority: 'high',
            steps: [
                { order: 1, action: 'Test on mobile viewport', expected: 'Layout adapts' },
                { order: 2, action: 'Check touch targets (48px min)', expected: 'Targets adequate' },
                { order: 3, action: 'Verify scrolling and gestures', expected: 'Gestures work' }
            ],
            expectedResult: 'Application is usable on mobile'
        }));

        this.testStore.addTests(tests);
    }

    /**
     * Generate acceptance tests - UAT style tests
     */
    async generateAcceptanceTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        tests.push(this.createTest({
            name: 'Acceptance: Primary User Journey',
            description: 'Complete the main business workflow',
            category: 'acceptance',
            automationLevel: 'manual',
            priority: 'critical',
            istqbTechnique: 'use_case',
            steps: [
                { order: 1, action: 'Start as typical user', expected: 'Entry point clear' },
                { order: 2, action: 'Complete primary task', expected: 'Task completable' },
                { order: 3, action: 'Verify outcome', expected: 'Correct result' },
                { order: 4, action: 'Validate business rules', expected: 'Rules enforced' }
            ],
            expectedResult: 'Primary workflow meets requirements'
        }));

        tests.push(this.createTest({
            name: 'Acceptance: Business Requirements Met',
            description: 'Verify all stated requirements are implemented',
            category: 'acceptance',
            automationLevel: 'manual',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Review requirements document', expected: 'Requirements listed' },
                { order: 2, action: 'Test each requirement', expected: 'All tested' },
                { order: 3, action: 'Document any gaps', expected: 'Gaps noted' }
            ],
            expectedResult: 'All requirements are met or gaps documented'
        }));

        this.testStore.addTests(tests);
    }

    /**
     * Generate exploratory tests - Unscripted creative testing
     */
    async generateExploratoryTests(): Promise<void> {
        if (!this.analysisResult) return;

        const tests: TestCase[] = [];

        tests.push(this.createTest({
            name: 'Exploratory: Session-Based Testing',
            description: 'Time-boxed exploratory testing session',
            category: 'exploratory',
            automationLevel: 'manual',
            priority: 'medium',
            istqbTechnique: 'exploratory',
            steps: [
                { order: 1, action: 'Set 30-minute session charter', expected: 'Focus area defined' },
                { order: 2, action: 'Explore freely within scope', expected: 'Findings documented' },
                { order: 3, action: 'Note any bugs or concerns', expected: 'Issues logged' },
                { order: 4, action: 'Write session report', expected: 'Report complete' }
            ],
            expectedResult: 'Exploratory testing completed with findings documented'
        }));

        for (const component of this.analysisResult.components.filter(c => c.type === 'page').slice(0, 3)) {
            tests.push(this.createTest({
                name: `Exploratory: ${component.name} Deep Dive`,
                description: `Explore ${component.name} for edge cases and issues`,
                category: 'exploratory',
                automationLevel: 'manual',
                priority: 'low',
                istqbTechnique: 'exploratory',
                steps: [
                    { order: 1, action: `Navigate to ${component.name}`, expected: 'Page loads' },
                    { order: 2, action: 'Try unexpected user behaviors', expected: 'Document responses' },
                    { order: 3, action: 'Test edge cases', expected: 'Issues noted' }
                ],
                expectedResult: 'Potential issues discovered and documented',
                targetElement: { type: 'component', selector: component.name }
            }));
        }

        this.testStore.addTests(tests);
    }

    /**
     * Generate compatibility tests - Cross-browser/device testing
     */
    async generateCompatibilityTests(): Promise<void> {
        const tests: TestCase[] = [];

        const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
        for (const browser of browsers) {
            tests.push(this.createTest({
                name: `Compatibility: ${browser} Browser`,
                description: `Verify functionality in ${browser}`,
                category: 'compatibility',
                subcategory: 'browsers',
                automationLevel: 'partial',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Open application in ${browser}`, expected: 'App loads' },
                    { order: 2, action: 'Check layout and styling', expected: 'Correct appearance' },
                    { order: 3, action: 'Test key functionality', expected: 'Features work' },
                    { order: 4, action: 'Check JavaScript console', expected: 'No errors' }
                ],
                expectedResult: `Application works correctly in ${browser}`
            }));
        }

        const devices = ['iPhone 14', 'Samsung Galaxy S23', 'iPad Pro', 'Desktop 1920x1080'];
        for (const device of devices) {
            tests.push(this.createTest({
                name: `Compatibility: ${device}`,
                description: `Verify responsiveness on ${device}`,
                category: 'compatibility',
                subcategory: 'devices',
                automationLevel: 'partial',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Test on ${device} viewport`, expected: 'Layout correct' },
                    { order: 2, action: 'Check touch/click interactions', expected: 'Interactions work' },
                    { order: 3, action: 'Verify content is readable', expected: 'Content visible' }
                ],
                expectedResult: `Application displays correctly on ${device}`
            }));
        }

        this.testStore.addTests(tests);
    }

    private createTest(params: {
        name: string;
        description: string;
        category: TestCategory;
        subcategory?: string;
        automationLevel: AutomationLevel;
        priority: TestPriority;
        steps: TestStep[];
        expectedResult: string;
        tags?: string[];
        targetElement?: any;
        istqbTechnique?: IstqbTechnique;
        securityType?: SecurityTestType;
        timeout?: number;
        preconditions?: string[];
    }): TestCase {
        return {
            id: uuidv4(),
            name: params.name,
            description: params.description,
            category: params.category,
            subcategory: params.subcategory,
            automationLevel: params.automationLevel,
            priority: params.priority,
            tags: params.tags || [],
            preconditions: params.preconditions,
            steps: params.steps,
            expectedResult: params.expectedResult,
            targetElement: params.targetElement,
            istqbTechnique: params.istqbTechnique,
            securityType: params.securityType,
            timeout: params.timeout
        };
    }
}

