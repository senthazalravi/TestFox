import { v4 as uuidv4 } from 'uuid';
import { TestStore } from '../store/testStore';
import { TestCoverageTracker } from '../core/testCoverageTracker';
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
    private coverageTracker: TestCoverageTracker | null = null;
    private incrementalMode: boolean = false;

    constructor(
        private testStore: TestStore,
        coverageTracker?: TestCoverageTracker,
        incrementalMode: boolean = false
    ) {
        this.analysisResult = testStore.getAnalysisResult();
        this.coverageTracker = coverageTracker || null;
        this.incrementalMode = incrementalMode;
        // Ensure analysis result has all required properties
        this.ensureValidAnalysisResult();
    }

    private ensureValidAnalysisResult(): void {
        if (!this.analysisResult) {
            this.analysisResult = {
                routes: [],
                forms: [],
                endpoints: [],
                authFlows: [],
                databaseQueries: [],
                externalApis: [],
                components: []
            };
            return;
        }

        if (!this.analysisResult.routes || !Array.isArray(this.analysisResult.routes)) {
            this.analysisResult.routes = [];
        }
        if (!this.analysisResult.forms || !Array.isArray(this.analysisResult.forms)) {
            this.analysisResult.forms = [];
        }
        if (!this.analysisResult.endpoints || !Array.isArray(this.analysisResult.endpoints)) {
            this.analysisResult.endpoints = [];
        }
        if (!this.analysisResult.authFlows || !Array.isArray(this.analysisResult.authFlows)) {
            this.analysisResult.authFlows = [];
        }
        if (!this.analysisResult.databaseQueries || !Array.isArray(this.analysisResult.databaseQueries)) {
            this.analysisResult.databaseQueries = [];
        }
        if (!this.analysisResult.externalApis || !Array.isArray(this.analysisResult.externalApis)) {
            this.analysisResult.externalApis = [];
        }
        if (!this.analysisResult.components || !Array.isArray(this.analysisResult.components)) {
            this.analysisResult.components = [];
        }
    }

    async generateSmokeTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Get routes to test (filter by coverage if in incremental mode)
        let routesToTest = this.analysisResult.routes.slice(0, 25);
        if (this.incrementalMode && this.coverageTracker) {
            const newOrChanged = this.coverageTracker.getNewOrChangedItems(this.analysisResult);
            routesToTest = [...newOrChanged.newRoutes, ...newOrChanged.changedRoutes].slice(0, 25);
        }

        // Generate smoke tests for critical routes - Basic Accessibility
        for (const route of routesToTest) {
            // Skip if already tested (in incremental mode)
            if (this.incrementalMode && this.coverageTracker && 
                this.coverageTracker.isRouteTested(route.method, route.path, 'smoke')) {
                continue;
            }

            const test = this.createTest({
                name: `Smoke: ${route.method} ${route.path} is accessible`,
                description: `Verify that ${route.path} responds with a valid status code`,
                category: 'smoke',
                subcategory: 'basic_accessibility',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Navigate to or call ${route.path}`, expected: 'Page/endpoint loads' },
                    { order: 2, action: 'Check response status', expected: 'Status is 2xx or valid redirect' }
                ],
                expectedResult: 'Route is accessible and responds correctly',
                targetElement: { type: 'route', path: route.path, method: route.method, file: route.file }
            });

            // Check for duplicate before adding
            if (!this.coverageTracker || !this.coverageTracker.isDuplicate(test)) {
                tests.push(test);
            }

            // Add HTTP method specific smoke tests
            if (route.method === 'GET') {
                tests.push(this.createTest({
                    name: `Smoke: GET ${route.path} returns data`,
                    description: `Verify GET ${route.path} returns expected data structure`,
                    category: 'smoke',
                    subcategory: 'data_validation',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: `Send GET request to ${route.path}`, expected: 'Request sent' },
                        { order: 2, action: 'Verify response body is not empty', expected: 'Data returned' },
                        { order: 3, action: 'Validate content-type header', expected: 'Correct content-type' }
                    ],
                    expectedResult: 'GET request returns valid data',
                    targetElement: { type: 'route', path: route.path, method: route.method }
                }));
            }

            if (route.method === 'POST') {
                tests.push(this.createTest({
                    name: `Smoke: POST ${route.path} accepts data`,
                    description: `Verify POST ${route.path} accepts and processes data`,
                    category: 'smoke',
                    subcategory: 'data_acceptance',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: `Send POST request to ${route.path} with valid payload`, expected: 'Request accepted' },
                        { order: 2, action: 'Verify response status', expected: '201 or 200 status' },
                        { order: 3, action: 'Check response contains created/updated data', expected: 'Data processed' }
                    ],
                    expectedResult: 'POST request processes data correctly',
                    targetElement: { type: 'route', path: route.path, method: route.method }
                }));
            }
        }

        // Generate smoke tests for main pages/components
        const pages = this.analysisResult.components.filter(c => c.type === 'page');
        for (const page of pages.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Smoke: ${page.name} page renders`,
                description: `Verify that ${page.name} page loads without errors`,
                category: 'smoke',
                subcategory: 'page_rendering',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Navigate to ${page.name} page`, expected: 'Page renders' },
                    { order: 2, action: 'Check for console errors', expected: 'No critical errors' },
                    { order: 3, action: 'Verify page title is correct', expected: 'Title displayed' }
                ],
                expectedResult: 'Page renders successfully without errors',
                targetElement: { type: 'component', selector: page.name }
            }));

            // Add visual smoke test
            tests.push(this.createTest({
                name: `Smoke: ${page.name} visual elements present`,
                description: `Verify ${page.name} has key visual elements`,
                category: 'smoke',
                subcategory: 'visual_elements',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${page.name}`, expected: 'Page loaded' },
                    { order: 2, action: 'Check header/logo is visible', expected: 'Header present' },
                    { order: 3, action: 'Verify main content area exists', expected: 'Content visible' },
                    { order: 4, action: 'Check footer is present', expected: 'Footer displayed' }
                ],
                expectedResult: 'All key visual elements are present',
                targetElement: { type: 'component', selector: page.name }
            }));
        }

        // API smoke tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 15)) {
            tests.push(this.createTest({
                name: `Smoke: API ${endpoint.method} ${endpoint.path}`,
                description: `Verify API endpoint ${endpoint.path} is available`,
                category: 'smoke',
                subcategory: 'api_availability',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: `Call ${endpoint.method} ${endpoint.path}`, expected: 'API responds' },
                    { order: 2, action: 'Validate response format', expected: 'Valid JSON response' },
                    { order: 3, action: 'Check response time < 5s', expected: 'Fast response' }
                ],
                expectedResult: 'API endpoint responds with valid data',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Add API health check
            tests.push(this.createTest({
                name: `Smoke: API ${endpoint.path} health check`,
                description: `Verify ${endpoint.path} is healthy and responsive`,
                category: 'smoke',
                subcategory: 'health_check',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Ping ${endpoint.path}`, expected: 'Server responds' },
                    { order: 2, action: 'Check CORS headers if applicable', expected: 'Headers present' },
                    { order: 3, action: 'Verify no server errors', expected: '5xx errors absent' }
                ],
                expectedResult: 'API is healthy and accessible',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Database connection smoke tests
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Smoke: Database Connection',
                description: 'Verify database is accessible',
                category: 'smoke',
                subcategory: 'database_connectivity',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Attempt database connection', expected: 'Connection established' },
                    { order: 2, action: 'Execute simple SELECT query', expected: 'Query returns results' },
                    { order: 3, action: 'Verify connection pool is active', expected: 'Pool responsive' }
                ],
                expectedResult: 'Database is accessible and responsive'
            }));
        }

        // External API dependencies smoke tests
        for (const externalApi of this.analysisResult.externalApis.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Smoke: External API ${externalApi.name} available`,
                description: `Verify external API ${externalApi.name} is accessible`,
                category: 'smoke',
                subcategory: 'external_dependencies',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Ping ${externalApi.name} endpoint`, expected: 'API responds' },
                    { order: 2, action: 'Check authentication token validity', expected: 'Token valid' },
                    { order: 3, action: 'Verify rate limits not exceeded', expected: 'Within limits' }
                ],
                expectedResult: 'External API is available and functional'
            }));
        }

        // Form smoke tests
        for (const form of this.analysisResult.forms.slice(0, 8)) {
            tests.push(this.createTest({
                name: `Smoke: ${form.name} form loads`,
                description: `Verify ${form.name} form renders correctly`,
                category: 'smoke',
                subcategory: 'form_rendering',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${form.name}`, expected: 'Form displayed' },
                    { order: 2, action: 'Check all form fields present', expected: 'Fields visible' },
                    { order: 3, action: 'Verify submit button exists', expected: 'Button present' }
                ],
                expectedResult: 'Form renders with all required elements',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Authentication smoke tests
        if (this.analysisResult.authFlows.length > 0) {
            tests.push(this.createTest({
                name: 'Smoke: Authentication System',
                description: 'Verify authentication system is operational',
                category: 'smoke',
                subcategory: 'auth_system',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Navigate to login page', expected: 'Login form loads' },
                    { order: 2, action: 'Check auth provider status', expected: 'Auth service up' },
                    { order: 3, action: 'Verify session management works', expected: 'Sessions functional' }
                ],
                expectedResult: 'Authentication system is operational'
            }));
        }

        // Critical business path smoke tests
        tests.push(this.createTest({
            name: 'Smoke: Home Page Load',
            description: 'Verify application home page loads successfully',
            category: 'smoke',
            subcategory: 'critical_path',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Navigate to home page', expected: 'Page loads' },
                { order: 2, action: 'Verify main navigation is visible', expected: 'Navigation rendered' },
                { order: 3, action: 'Check no JavaScript errors', expected: 'No console errors' }
            ],
            expectedResult: 'Home page loads without errors'
        }));

        tests.push(this.createTest({
            name: 'Smoke: Application Bootstrap',
            description: 'Verify application initializes correctly',
            category: 'smoke',
            subcategory: 'initialization',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Clear cache and reload', expected: 'App starts fresh' },
                { order: 2, action: 'Verify all scripts load', expected: 'No 404 errors' },
                { order: 3, action: 'Check global state initialization', expected: 'State valid' }
            ],
            expectedResult: 'Application bootstraps successfully'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateFunctionalTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Form validation tests - comprehensive
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

            // Field type validation tests
            for (const field of form.fields) {
                if (field.type === 'email') {
                    tests.push(this.createTest({
                        name: `Functional: ${form.name} - ${field.name} email validation`,
                        description: `Verify ${field.name} validates email format`,
                        category: 'functional',
                        subcategory: 'email_validation',
                        automationLevel: 'full',
                        priority: 'medium',
                        steps: [
                            { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                            { order: 2, action: `Enter invalid email in ${field.name}`, expected: 'Invalid email entered' },
                            { order: 3, action: 'Submit form', expected: 'Validation error shown' },
                            { order: 4, action: `Enter valid email in ${field.name}`, expected: 'Valid email accepted' }
                        ],
                        expectedResult: 'Email validation works correctly',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }

                if (field.type === 'number' || field.type === 'tel') {
                    tests.push(this.createTest({
                        name: `Functional: ${form.name} - ${field.name} numeric validation`,
                        description: `Verify ${field.name} validates numeric input`,
                        category: 'functional',
                        subcategory: 'numeric_validation',
                        automationLevel: 'full',
                        priority: 'medium',
                        steps: [
                            { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                            { order: 2, action: `Enter non-numeric text in ${field.name}`, expected: 'Text rejected or sanitized' },
                            { order: 3, action: `Enter valid number in ${field.name}`, expected: 'Number accepted' }
                        ],
                        expectedResult: 'Numeric validation works correctly',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }

                if (field.type === 'date' || field.type === 'datetime-local') {
                    tests.push(this.createTest({
                        name: `Functional: ${form.name} - ${field.name} date validation`,
                        description: `Verify ${field.name} validates date input`,
                        category: 'functional',
                        subcategory: 'date_validation',
                        automationLevel: 'full',
                        priority: 'medium',
                        steps: [
                            { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                            { order: 2, action: `Enter invalid date in ${field.name}`, expected: 'Invalid date rejected' },
                            { order: 3, action: `Enter valid date in ${field.name}`, expected: 'Valid date accepted' }
                        ],
                        expectedResult: 'Date validation works correctly',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }

                if (field.type === 'password') {
                    tests.push(this.createTest({
                        name: `Functional: ${form.name} - ${field.name} password strength`,
                        description: `Verify ${field.name} enforces password requirements`,
                        category: 'functional',
                        subcategory: 'password_validation',
                        automationLevel: 'full',
                        priority: 'high',
                        steps: [
                            { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                            { order: 2, action: `Enter weak password in ${field.name}`, expected: 'Weak password rejected' },
                            { order: 3, action: `Enter strong password in ${field.name}`, expected: 'Strong password accepted' }
                        ],
                        expectedResult: 'Password strength validation works',
                        targetElement: { type: 'element', selector: `[name="${field.name}"]` }
                    }));
                }
            }

            // Form reset/cancel functionality
            tests.push(this.createTest({
                name: `Functional: ${form.name} reset functionality`,
                description: `Verify ${form.name} can be reset`,
                category: 'functional',
                subcategory: 'form_reset',
                automationLevel: 'full',
                priority: 'low',
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                    { order: 2, action: 'Fill in all fields', expected: 'Fields populated' },
                    { order: 3, action: 'Click reset button', expected: 'Form cleared' },
                    { order: 4, action: 'Verify all fields are empty/default', expected: 'Form reset' }
                ],
                expectedResult: 'Form reset works correctly',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Authentication flow tests - comprehensive
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

                tests.push(this.createTest({
                    name: 'Functional: Login form validation',
                    description: 'Verify login form validates required fields',
                    category: 'functional',
                    subcategory: 'form_validation',
                    automationLevel: 'full',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Submit empty form', expected: 'Validation errors shown' },
                        { order: 3, action: 'Enter only username', expected: 'Password error shown' },
                        { order: 4, action: 'Enter only password', expected: 'Username error shown' }
                    ],
                    expectedResult: 'Login form validates all required fields',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));

                tests.push(this.createTest({
                    name: 'Functional: Remember me functionality',
                    description: 'Verify remember me checkbox works',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'partial',
                    priority: 'medium',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Enter valid credentials', expected: 'Credentials entered' },
                        { order: 3, action: 'Check remember me', expected: 'Checkbox checked' },
                        { order: 4, action: 'Login and verify persistence', expected: 'Session persists' }
                    ],
                    expectedResult: 'Remember me functionality works',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));

                tests.push(this.createTest({
                    name: 'Functional: Forgot password flow',
                    description: 'Verify forgot password functionality',
                    category: 'functional',
                    subcategory: 'password_recovery',
                    automationLevel: 'partial',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Click forgot password', expected: 'Password reset page shown' },
                        { order: 3, action: 'Enter email address', expected: 'Email entered' },
                        { order: 4, action: 'Submit request', expected: 'Reset email sent' }
                    ],
                    expectedResult: 'Forgot password flow works',
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

                tests.push(this.createTest({
                    name: 'Functional: Registration email validation',
                    description: 'Verify email is validated during registration',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Navigate to registration page', expected: 'Registration form displayed' },
                        { order: 2, action: 'Enter invalid email', expected: 'Email rejected' },
                        { order: 3, action: 'Enter existing email', expected: 'Duplicate error shown' },
                        { order: 4, action: 'Enter valid unique email', expected: 'Email accepted' }
                    ],
                    expectedResult: 'Registration validates email correctly',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));

                tests.push(this.createTest({
                    name: 'Functional: Password confirmation',
                    description: 'Verify password confirmation field',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Navigate to registration page', expected: 'Registration form displayed' },
                        { order: 2, action: 'Enter password', expected: 'Password entered' },
                        { order: 3, action: 'Enter mismatched confirmation', expected: 'Mismatch error shown' },
                        { order: 4, action: 'Enter matching confirmation', expected: 'Passwords match' }
                    ],
                    expectedResult: 'Password confirmation validation works',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));
            }

            if (authFlow.type === 'logout') {
                tests.push(this.createTest({
                    name: 'Functional: Logout functionality',
                    description: 'Verify user can logout successfully',
                    category: 'functional',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: 'Login to application', expected: 'User logged in' },
                        { order: 2, action: 'Click logout button', expected: 'Logout initiated' },
                        { order: 3, action: 'Verify redirect to login/home', expected: 'Logged out' },
                        { order: 4, action: 'Verify session cleared', expected: 'Session removed' }
                    ],
                    expectedResult: 'Logout works correctly',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));
            }
        }

        // Navigation tests - comprehensive
        for (const route of this.analysisResult.routes.filter(r => r.method === 'GET').slice(0, 20)) {
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
                    { order: 3, action: 'Check URL', expected: 'URL matches expected' },
                    { order: 4, action: 'Verify page title', expected: 'Title correct' }
                ],
                expectedResult: 'Navigation successful, correct page displayed',
                targetElement: { type: 'route', path: route.path }
            }));

            // Browser back/forward navigation
            tests.push(this.createTest({
                name: `Functional: Browser navigation for ${route.path}`,
                description: `Verify back/forward buttons work for ${route.path}`,
                category: 'functional',
                subcategory: 'browser_navigation',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Navigate to ${route.path}`, expected: 'Page loaded' },
                    { order: 2, action: 'Navigate to different page', expected: 'New page loaded' },
                    { order: 3, action: 'Click browser back', expected: 'Returns to previous page' },
                    { order: 4, action: 'Click browser forward', expected: 'Returns to new page' }
                ],
                expectedResult: 'Browser navigation works correctly',
                targetElement: { type: 'route', path: route.path }
            }));
        }

        // Search functionality tests
        tests.push(this.createTest({
            name: 'Functional: Search with valid query',
            description: 'Verify search returns relevant results',
            category: 'functional',
            subcategory: 'search',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate to search page', expected: 'Search page displayed' },
                { order: 2, action: 'Enter valid search term', expected: 'Search term entered' },
                { order: 3, action: 'Submit search', expected: 'Results displayed' },
                { order: 4, action: 'Verify results relevance', expected: 'Relevant results shown' }
            ],
            expectedResult: 'Search returns relevant results'
        }));

        tests.push(this.createTest({
            name: 'Functional: Search with no results',
            description: 'Verify search handles no results gracefully',
            category: 'functional',
            subcategory: 'search',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Navigate to search page', expected: 'Search page displayed' },
                { order: 2, action: 'Enter non-existent search term', expected: 'Search term entered' },
                { order: 3, action: 'Submit search', expected: 'No results message shown' },
                { order: 4, action: 'Verify helpful message displayed', expected: 'User guidance provided' }
            ],
            expectedResult: 'No results handled gracefully'
        }));

        // Data manipulation tests
        tests.push(this.createTest({
            name: 'Functional: Create new record',
            description: 'Verify new records can be created',
            category: 'functional',
            subcategory: 'crud_create',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Navigate to create page', expected: 'Create form displayed' },
                { order: 2, action: 'Fill in required fields', expected: 'Fields populated' },
                { order: 3, action: 'Submit form', expected: 'Record created' },
                { order: 4, action: 'Verify record exists', expected: 'Record visible in list' }
            ],
            expectedResult: 'New record created successfully'
        }));

        tests.push(this.createTest({
            name: 'Functional: Read record details',
            description: 'Verify record details can be viewed',
            category: 'functional',
            subcategory: 'crud_read',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate to records list', expected: 'List displayed' },
                { order: 2, action: 'Click on record', expected: 'Details page shown' },
                { order: 3, action: 'Verify all fields displayed', expected: 'All data visible' },
                { order: 4, action: 'Verify related data loaded', expected: 'Related data shown' }
            ],
            expectedResult: 'Record details displayed correctly'
        }));

        tests.push(this.createTest({
            name: 'Functional: Update existing record',
            description: 'Verify records can be updated',
            category: 'functional',
            subcategory: 'crud_update',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Navigate to edit page', expected: 'Edit form displayed' },
                { order: 2, action: 'Modify field values', expected: 'Fields updated' },
                { order: 3, action: 'Submit changes', expected: 'Changes saved' },
                { order: 4, action: 'Verify changes persisted', expected: 'Data updated' }
            ],
            expectedResult: 'Record updated successfully'
        }));

        tests.push(this.createTest({
            name: 'Functional: Delete record',
            description: 'Verify records can be deleted',
            category: 'functional',
            subcategory: 'crud_delete',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate to record', expected: 'Record displayed' },
                { order: 2, action: 'Click delete button', expected: 'Confirmation dialog shown' },
                { order: 3, action: 'Confirm deletion', expected: 'Record deleted' },
                { order: 4, action: 'Verify record removed', expected: 'Record not in list' }
            ],
            expectedResult: 'Record deleted successfully'
        }));

        // Sorting and filtering tests
        tests.push(this.createTest({
            name: 'Functional: Sort records by column',
            description: 'Verify sorting functionality works',
            category: 'functional',
            subcategory: 'sorting',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Navigate to data grid', expected: 'Grid displayed' },
                { order: 2, action: 'Click column header to sort', expected: 'Data sorted' },
                { order: 3, action: 'Click again to reverse sort', expected: 'Sort order reversed' },
                { order: 4, action: 'Verify correct sort order', expected: 'Data in correct order' }
            ],
            expectedResult: 'Sorting works correctly'
        }));

        tests.push(this.createTest({
            name: 'Functional: Filter records',
            description: 'Verify filtering functionality works',
            category: 'functional',
            subcategory: 'filtering',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Navigate to data grid', expected: 'Grid displayed' },
                { order: 2, action: 'Apply filter criteria', expected: 'Filter applied' },
                { order: 3, action: 'Verify filtered results', expected: 'Only matching records shown' },
                { order: 4, action: 'Clear filter', expected: 'All records displayed' }
            ],
            expectedResult: 'Filtering works correctly'
        }));

        // Pagination tests
        tests.push(this.createTest({
            name: 'Functional: Pagination navigation',
            description: 'Verify pagination works correctly',
            category: 'functional',
            subcategory: 'pagination',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Navigate to paginated list', expected: 'List displayed' },
                { order: 2, action: 'Click next page', expected: 'Next page shown' },
                { order: 3, action: 'Click previous page', expected: 'Previous page shown' },
                { order: 4, action: 'Click specific page number', expected: 'Selected page shown' }
            ],
            expectedResult: 'Pagination works correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    /**
     * Add tests with coverage tracking and duplicate detection
     */
    private addTestsWithCoverage(tests: TestCase[]): void {
        if (this.coverageTracker) {
            const result = this.testStore.addTests(tests, this.coverageTracker);
            if (result.skipped > 0) {
                console.log(`TestGenerator: Skipped ${result.skipped} duplicate tests, added ${result.added} new tests`);
            }
        } else {
            // No coverage tracker, add tests directly
            const result = this.testStore.addTests(tests);
            if (result.skipped > 0) {
                console.log(`TestGenerator: Skipped ${result.skipped} duplicate tests, added ${result.added} new tests`);
            }
        }
    }

    async generateApiTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

            // Missing required fields
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Missing Fields`,
                description: `Verify ${endpoint.path} validates required fields`,
                category: 'api',
                subcategory: 'validation',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${endpoint.method} with missing fields`, expected: 'Request sent' },
                    { order: 2, action: 'Verify validation error', expected: '422 or 400 status' },
                    { order: 3, action: 'Check field-specific errors', expected: 'Missing fields identified' }
                ],
                expectedResult: 'Missing required fields are rejected',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Wrong HTTP method
            tests.push(this.createTest({
                name: `API: ${endpoint.path} - Wrong Method`,
                description: `Verify ${endpoint.path} rejects wrong HTTP methods`,
                category: 'api',
                subcategory: 'method_validation',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Send wrong method to ${endpoint.path}`, expected: 'Request sent' },
                    { order: 2, action: 'Verify 405 status', expected: 'Method Not Allowed' },
                    { order: 3, action: 'Check allowed methods header', expected: 'Allow header present' }
                ],
                expectedResult: 'Wrong HTTP method returns 405',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Content-Type validation
            tests.push(this.createTest({
                name: `API: ${endpoint.path} - Content-Type Validation`,
                description: `Verify ${endpoint.path} validates Content-Type`,
                category: 'api',
                subcategory: 'content_type',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Send with invalid Content-Type', expected: 'Request sent' },
                    { order: 2, action: 'Verify 415 or error', expected: 'Unsupported Media Type' },
                    { order: 3, action: 'Send with valid Content-Type', expected: 'Request accepted' }
                ],
                expectedResult: 'Content-Type is validated correctly',
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

                // Invalid token
                tests.push(this.createTest({
                    name: `API: ${endpoint.method} ${endpoint.path} - Invalid Token`,
                    description: `Verify ${endpoint.path} rejects invalid tokens`,
                    category: 'api',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Send request with invalid token', expected: 'Request sent' },
                        { order: 2, action: 'Verify 401 or 403 status', expected: 'Token rejected' },
                        { order: 3, action: 'Check error message', expected: 'Invalid token message' }
                    ],
                    expectedResult: 'Invalid token is rejected',
                    targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
                }));

                // Expired token
                tests.push(this.createTest({
                    name: `API: ${endpoint.method} ${endpoint.path} - Expired Token`,
                    description: `Verify ${endpoint.path} rejects expired tokens`,
                    category: 'api',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'high',
                    steps: [
                        { order: 1, action: 'Send request with expired token', expected: 'Request sent' },
                        { order: 2, action: 'Verify 401 status', expected: 'Token expired' },
                        { order: 3, action: 'Check for refresh token option', expected: 'Refresh available' }
                    ],
                    expectedResult: 'Expired token is rejected',
                    targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
                }));
            }

            // Response format validation
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Response Format`,
                description: `Verify ${endpoint.path} returns correct response format`,
                category: 'api',
                subcategory: 'response_format',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${endpoint.method} request`, expected: 'Request sent' },
                    { order: 2, action: 'Verify Content-Type header', expected: 'Correct Content-Type' },
                    { order: 3, action: 'Validate JSON structure', expected: 'Valid JSON' },
                    { order: 4, action: 'Check required fields in response', expected: 'All fields present' }
                ],
                expectedResult: 'Response format is correct',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Query parameter validation
            if (endpoint.method === 'GET') {
                tests.push(this.createTest({
                    name: `API: GET ${endpoint.path} - Query Parameters`,
                    description: `Verify ${endpoint.path} handles query parameters`,
                    category: 'api',
                    subcategory: 'query_params',
                    automationLevel: 'full',
                    priority: 'medium',
                    steps: [
                        { order: 1, action: 'Send with valid query params', expected: 'Filtered results' },
                        { order: 2, action: 'Send with invalid query params', expected: 'Params ignored or error' },
                        { order: 3, action: 'Send with special characters', expected: 'Handled correctly' }
                    ],
                    expectedResult: 'Query parameters work correctly',
                    targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
                }));
            }

            // Pagination support
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Pagination`,
                description: `Verify ${endpoint.path} supports pagination`,
                category: 'api',
                subcategory: 'pagination',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Request with page parameter', expected: 'Paginated results' },
                    { order: 2, action: 'Request with limit parameter', expected: 'Correct page size' },
                    { order: 3, action: 'Verify pagination metadata', expected: 'Total count present' }
                ],
                expectedResult: 'Pagination works correctly',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Sorting support
            tests.push(this.createTest({
                name: `API: ${endpoint.method} ${endpoint.path} - Sorting`,
                description: `Verify ${endpoint.path} supports sorting`,
                category: 'api',
                subcategory: 'sorting',
                automationLevel: 'full',
                priority: 'low',
                steps: [
                    { order: 1, action: 'Request with sort parameter', expected: 'Sorted results' },
                    { order: 2, action: 'Test ascending sort', expected: 'Asc order' },
                    { order: 3, action: 'Test descending sort', expected: 'Desc order' }
                ],
                expectedResult: 'Sorting works correctly',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
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
                    { order: 2, action: 'Verify rate limit triggered', expected: '429 Too Many Requests' },
                    { order: 3, action: 'Check Retry-After header', expected: 'Header present' }
                ],
                expectedResult: 'Rate limiting prevents excessive requests',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            tests.push(this.createTest({
                name: `API: ${endpoint.path} - Rate Limit Headers`,
                description: `Verify rate limit headers are present`,
                category: 'api',
                subcategory: 'rate_limit_headers',
                automationLevel: 'full',
                priority: 'low',
                steps: [
                    { order: 1, action: 'Send request', expected: 'Response received' },
                    { order: 2, action: 'Check X-RateLimit-Limit', expected: 'Limit header present' },
                    { order: 3, action: 'Check X-RateLimit-Remaining', expected: 'Remaining header present' }
                ],
                expectedResult: 'Rate limit headers are present',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // CORS tests
        tests.push(this.createTest({
            name: 'API: CORS Headers',
            description: 'Verify CORS headers are properly configured',
            category: 'api',
            subcategory: 'cors',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Send preflight OPTIONS request', expected: '200 response' },
                { order: 2, action: 'Check Access-Control-Allow-Origin', expected: 'Origin header present' },
                { order: 3, action: 'Check Access-Control-Allow-Methods', expected: 'Methods listed' },
                { order: 4, action: 'Test cross-origin request', expected: 'CORS handled' }
            ],
            expectedResult: 'CORS is properly configured'
        }));

        // API versioning test
        tests.push(this.createTest({
            name: 'API: Versioning',
            description: 'Verify API versioning works correctly',
            category: 'api',
            subcategory: 'versioning',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Request with version header', expected: 'Version recognized' },
                { order: 2, action: 'Request with URL version', expected: 'Version recognized' },
                { order: 3, action: 'Request without version', expected: 'Default version used' }
            ],
            expectedResult: 'API versioning works correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateSecurityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

            // Stored XSS tests
            tests.push(this.createTest({
                name: `Security: Stored XSS - ${form.name}`,
                description: 'Test for stored Cross-Site Scripting vulnerability',
                category: 'security',
                subcategory: 'stored_xss',
                securityType: 'xss',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A03:2021'],
                steps: [
                    { order: 1, action: 'Navigate to form', expected: 'Form displayed' },
                    { order: 2, action: 'Enter stored XSS payload: <img src=x onerror=alert(1)>', expected: 'Payload entered' },
                    { order: 3, action: 'Submit form', expected: 'Data saved' },
                    { order: 4, action: 'Navigate to view page', expected: 'Data displayed' },
                    { order: 5, action: 'Verify script not executed', expected: 'No alert shown' }
                ],
                expectedResult: 'Stored XSS payloads are sanitized',
                targetElement: { type: 'form', selector: form.name }
            }));

            // DOM-based XSS tests
            tests.push(this.createTest({
                name: `Security: DOM XSS - ${form.name}`,
                description: 'Test for DOM-based Cross-Site Scripting vulnerability',
                category: 'security',
                subcategory: 'dom_xss',
                securityType: 'xss',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A03:2021'],
                steps: [
                    { order: 1, action: 'Navigate to page with URL parameters', expected: 'Page loaded' },
                    { order: 2, action: 'Add XSS payload to URL hash: #<script>alert(1)</script>', expected: 'URL modified' },
                    { order: 3, action: 'Verify script not executed', expected: 'No alert shown' },
                    { order: 4, action: 'Check DOM manipulation', expected: 'Safe rendering' }
                ],
                expectedResult: 'DOM XSS payloads are handled safely',
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

            // Brute force protection
            tests.push(this.createTest({
                name: 'Security: Brute Force Protection',
                description: 'Test for brute force attack protection',
                category: 'security',
                subcategory: 'brute_force',
                securityType: 'auth_bypass',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A07:2021'],
                steps: [
                    { order: 1, action: 'Attempt multiple failed logins', expected: 'Failed attempts logged' },
                    { order: 2, action: 'Check for account lockout', expected: 'Account locked or delayed' },
                    { order: 3, action: 'Verify rate limiting', expected: 'Requests throttled' },
                    { order: 4, action: 'Check CAPTCHA requirement', expected: 'CAPTCHA shown after threshold' }
                ],
                expectedResult: 'Brute force attacks are mitigated',
                targetElement: { type: 'route', path: authFlow.endpoint }
            }));

            // Session fixation tests
            tests.push(this.createTest({
                name: 'Security: Session Fixation',
                description: 'Test for session fixation vulnerability',
                category: 'security',
                subcategory: 'session_fixation',
                securityType: 'auth_bypass',
                automationLevel: 'full',
                priority: 'high',
                tags: ['OWASP'],
                steps: [
                    { order: 1, action: 'Get session ID before login', expected: 'Session ID obtained' },
                    { order: 2, action: 'Login with session ID', expected: 'Login successful' },
                    { order: 3, action: 'Verify session ID changed', expected: 'New session ID assigned' },
                    { order: 4, action: 'Test old session ID invalid', expected: 'Old ID rejected' }
                ],
                expectedResult: 'Session ID regenerated after login',
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

            // CSRF with different origins
            tests.push(this.createTest({
                name: `Security: CSRF Origin Check - ${form.name}`,
                description: 'Test CSRF protection with different origins',
                category: 'security',
                subcategory: 'csrf_origin',
                securityType: 'csrf',
                automationLevel: 'full',
                priority: 'high',
                tags: ['OWASP'],
                steps: [
                    { order: 1, action: 'Send request with different Origin header', expected: 'Origin checked' },
                    { order: 2, action: 'Send request with different Referer', expected: 'Referer validated' },
                    { order: 3, action: 'Submit from unauthorized domain', expected: 'Request rejected' }
                ],
                expectedResult: 'Cross-origin requests are blocked',
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

        // Additional security headers
        tests.push(this.createTest({
            name: 'Security: Additional Security Headers',
            description: 'Verify additional security headers',
            category: 'security',
            subcategory: 'security_headers_extended',
            securityType: 'security_headers',
            automationLevel: 'full',
            priority: 'medium',
            tags: ['OWASP'],
            steps: [
                { order: 1, action: 'Send request to application', expected: 'Response received' },
                { order: 2, action: 'Check X-XSS-Protection', expected: 'XSS filter enabled' },
                { order: 3, action: 'Check Referrer-Policy', expected: 'Policy set' },
                { order: 4, action: 'Check Permissions-Policy', expected: 'Policy set' },
                { order: 5, action: 'Check Cross-Origin-Resource-Policy', expected: 'CORP set' }
            ],
            expectedResult: 'Extended security headers configured'
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

        // Information disclosure tests
        tests.push(this.createTest({
            name: 'Security: Information Disclosure',
            description: 'Test for information disclosure in error messages',
            category: 'security',
            subcategory: 'information_disclosure',
            securityType: 'sensitive_data',
            automationLevel: 'full',
            priority: 'high',
            tags: ['OWASP'],
            steps: [
                { order: 1, action: 'Trigger application error', expected: 'Error occurs' },
                { order: 2, action: 'Check error message content', expected: 'No stack traces exposed' },
                { order: 3, action: 'Verify no system info leaked', expected: 'No server info exposed' },
                { order: 4, action: 'Check for version numbers', expected: 'Versions hidden' }
            ],
            expectedResult: 'Error messages do not leak sensitive information'
        }));

        // Insecure deserialization tests
        tests.push(this.createTest({
            name: 'Security: Insecure Deserialization',
            description: 'Test for insecure deserialization vulnerabilities',
            category: 'security',
            subcategory: 'deserialization',
            securityType: 'injection',
            automationLevel: 'full',
            priority: 'critical',
            tags: ['OWASP', 'A08:2021'],
            steps: [
                { order: 1, action: 'Send malicious serialized object', expected: 'Payload sent' },
                { order: 2, action: 'Check for RCE indicators', expected: 'No RCE possible' },
                { order: 3, action: 'Test with various payloads', expected: 'All blocked' },
                { order: 4, action: 'Verify input validation', expected: 'Input sanitized' }
            ],
            expectedResult: 'Deserialization attacks are prevented'
        }));

        // XML External Entity (XXE) tests
        tests.push(this.createTest({
            name: 'Security: XXE Prevention',
            description: 'Test for XML External Entity vulnerabilities',
            category: 'security',
            subcategory: 'xxe',
            securityType: 'injection',
            automationLevel: 'full',
            priority: 'critical',
            tags: ['OWASP', 'A05:2021'],
            steps: [
                { order: 1, action: 'Send XML with external entity', expected: 'XML sent' },
                { order: 2, action: 'Check for file disclosure', expected: 'No file access' },
                { order: 3, action: 'Test SSRF via XXE', expected: 'No SSRF possible' },
                { order: 4, action: 'Verify entity expansion limits', expected: 'Limits enforced' }
            ],
            expectedResult: 'XXE attacks are prevented'
        }));

        // Server-Side Request Forgery (SSRF) tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Security: SSRF - ${endpoint.path}`,
                description: 'Test for Server-Side Request Forgery',
                category: 'security',
                subcategory: 'ssrf',
                securityType: 'injection',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A10:2021'],
                steps: [
                    { order: 1, action: 'Send request with internal URL', expected: 'Request sent' },
                    { order: 2, action: 'Check for internal resource access', expected: 'No internal access' },
                    { order: 3, action: 'Test with localhost variants', expected: 'Blocked' },
                    { order: 4, action: 'Verify URL whitelist', expected: 'Whitelist enforced' }
                ],
                expectedResult: 'SSRF attacks are prevented',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Command injection tests
        for (const form of this.analysisResult.forms) {
            tests.push(this.createTest({
                name: `Security: Command Injection - ${form.name}`,
                description: 'Test for command injection vulnerabilities',
                category: 'security',
                subcategory: 'command_injection',
                securityType: 'injection',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A03:2021'],
                steps: [
                    { order: 1, action: 'Enter command injection payload: ; cat /etc/passwd', expected: 'Payload sent' },
                    { order: 2, action: 'Check for command execution', expected: 'No command execution' },
                    { order: 3, action: 'Test with various shell operators', expected: 'All blocked' },
                    { order: 4, action: 'Verify input sanitization', expected: 'Input sanitized' }
                ],
                expectedResult: 'Command injection attempts are blocked',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Path traversal tests
        for (const route of this.analysisResult.routes.filter(r => r.method === 'GET').slice(0, 10)) {
            tests.push(this.createTest({
                name: `Security: Path Traversal - ${route.path}`,
                description: 'Test for path traversal vulnerabilities',
                category: 'security',
                subcategory: 'path_traversal',
                securityType: 'injection',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A01:2021'],
                steps: [
                    { order: 1, action: 'Send request with ../ in path', expected: 'Request sent' },
                    { order: 2, action: 'Check for directory traversal', expected: 'No file access' },
                    { order: 3, action: 'Test with encoded traversal', expected: 'Blocked' },
                    { order: 4, action: 'Verify path normalization', expected: 'Path sanitized' }
                ],
                expectedResult: 'Path traversal attacks are prevented',
                targetElement: { type: 'route', path: route.path }
            }));
        }

        // Insecure direct object reference (IDOR) tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Security: IDOR - ${endpoint.path}`,
                description: 'Test for Insecure Direct Object Reference',
                category: 'security',
                subcategory: 'idor',
                securityType: 'access_control',
                automationLevel: 'full',
                priority: 'critical',
                tags: ['OWASP', 'A01:2021'],
                steps: [
                    { order: 1, action: 'Access object with valid ID', expected: 'Access granted' },
                    { order: 2, action: 'Try different object ID', expected: 'Access controlled' },
                    { order: 3, action: 'Check authorization', expected: 'Ownership verified' },
                    { order: 4, action: 'Test with sequential IDs', expected: 'No unauthorized access' }
                ],
                expectedResult: 'Object access is properly authorized',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Security misconfiguration tests
        tests.push(this.createTest({
            name: 'Security: Security Misconfiguration',
            description: 'Test for common security misconfigurations',
            category: 'security',
            subcategory: 'misconfiguration',
            securityType: 'security_headers',
            automationLevel: 'full',
            priority: 'high',
            tags: ['OWASP', 'A05:2021'],
            steps: [
                { order: 1, action: 'Check for default credentials', expected: 'No default creds' },
                { order: 2, action: 'Verify debug mode disabled', expected: 'Debug off in prod' },
                { order: 3, action: 'Check directory listing', expected: 'No directory listing' },
                { order: 4, action: 'Verify unnecessary features disabled', expected: 'Features minimized' }
            ],
            expectedResult: 'Application is securely configured'
        }));

        // Vulnerable component tests
        tests.push(this.createTest({
            name: 'Security: Vulnerable Components',
            description: 'Test for known vulnerabilities in dependencies',
            category: 'security',
            subcategory: 'vulnerable_components',
            securityType: 'security_headers',
            automationLevel: 'partial',
            priority: 'high',
            tags: ['OWASP', 'A06:2021'],
            steps: [
                { order: 1, action: 'Scan dependencies for CVEs', expected: 'Scan completed' },
                { order: 2, action: 'Check for outdated packages', expected: 'Packages up to date' },
                { order: 3, action: 'Verify no vulnerable versions', expected: 'No known CVEs' }
            ],
            expectedResult: 'No vulnerable dependencies found'
        }));

        // Logging and monitoring tests
        tests.push(this.createTest({
            name: 'Security: Logging and Monitoring',
            description: 'Test security event logging',
            category: 'security',
            subcategory: 'logging',
            securityType: 'security_headers',
            automationLevel: 'partial',
            priority: 'medium',
            tags: ['OWASP', 'A09:2021'],
            steps: [
                { order: 1, action: 'Trigger security event', expected: 'Event triggered' },
                { order: 2, action: 'Check security logs', expected: 'Event logged' },
                { order: 3, action: 'Verify log integrity', expected: 'Logs tamper-proof' },
                { order: 4, action: 'Check for sensitive data in logs', expected: 'No sensitive data' }
            ],
            expectedResult: 'Security events are properly logged'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generatePerformanceTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

            // Resource loading performance
            tests.push(this.createTest({
                name: `Performance: Resource Loading - ${route.path}`,
                description: `Measure resource loading performance on ${route.path}`,
                category: 'performance',
                subcategory: 'resource_loading',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Navigate to ${route.path}`, expected: 'Page loads' },
                    { order: 2, action: 'Measure image load times', expected: '<500ms per image' },
                    { order: 3, action: 'Measure CSS load times', expected: '<100ms' },
                    { order: 4, action: 'Measure JS load times', expected: '<200ms' },
                    { order: 5, action: 'Check for render blocking resources', expected: 'Minimal blocking' }
                ],
                expectedResult: 'Resources load efficiently',
                targetElement: { type: 'route', path: route.path },
                timeout: 30000
            }));

            // Interaction readiness
            tests.push(this.createTest({
                name: `Performance: Interaction Ready - ${route.path}`,
                description: `Measure time to interactive on ${route.path}`,
                category: 'performance',
                subcategory: 'tti',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Navigate to ${route.path}`, expected: 'Page loads' },
                    { order: 2, action: 'Measure Time to Interactive', expected: '<3.5s' },
                    { order: 3, action: 'Measure Total Blocking Time', expected: '<200ms' },
                    { order: 4, action: 'Check First Input Delay', expected: '<100ms' }
                ],
                expectedResult: 'Page is interactive within acceptable time',
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

            // API throughput
            tests.push(this.createTest({
                name: `Performance: API Throughput - ${endpoint.method} ${endpoint.path}`,
                description: `Measure API throughput for ${endpoint.path}`,
                category: 'performance',
                subcategory: 'throughput',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Send 100 requests to ${endpoint.path}`, expected: 'Requests sent' },
                    { order: 2, action: 'Measure requests per second', expected: '>10 req/s' },
                    { order: 3, action: 'Check 95th percentile latency', expected: '<1s' },
                    { order: 4, action: 'Verify no timeouts', expected: 'All requests complete' }
                ],
                expectedResult: 'API handles load efficiently',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method },
                timeout: 60000
            }));
        }

        // Database performance
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Performance: Database Query Performance',
                description: 'Measure database query execution times',
                category: 'performance',
                subcategory: 'database',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Execute simple SELECT query', expected: '<10ms' },
                    { order: 2, action: 'Execute complex JOIN query', expected: '<100ms' },
                    { order: 3, action: 'Measure query with large dataset', expected: '<500ms' },
                    { order: 4, action: 'Check for slow queries', expected: 'No queries >1s' }
                ],
                expectedResult: 'Database queries execute efficiently'
            }));

            // Connection pool performance
            tests.push(this.createTest({
                name: 'Performance: Database Connection Pool',
                description: 'Measure connection pool performance',
                category: 'performance',
                subcategory: 'connection_pool',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Simulate 50 concurrent connections', expected: 'Connections handled' },
                    { order: 2, action: 'Measure connection acquisition time', expected: '<10ms' },
                    { order: 3, action: 'Check pool utilization', expected: 'Healthy utilization' },
                    { order: 4, action: 'Verify no connection leaks', expected: 'No leaks detected' }
                ],
                expectedResult: 'Connection pool performs well'
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

        // CPU usage test
        tests.push(this.createTest({
            name: 'Performance: CPU Usage',
            description: 'Monitor CPU usage under normal and peak load',
            category: 'performance',
            subcategory: 'cpu',
            automationLevel: 'partial',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Record baseline CPU usage', expected: 'Baseline recorded' },
                { order: 2, action: 'Simulate normal user load', expected: 'Load applied' },
                { order: 3, action: 'Measure CPU during peak', expected: '<80% usage' },
                { order: 4, action: 'Check for CPU spikes', expected: 'No extreme spikes' }
            ],
            expectedResult: 'CPU usage remains within acceptable limits'
        }));

        // Network performance
        tests.push(this.createTest({
            name: 'Performance: Network Transfer',
            description: 'Measure network transfer efficiency',
            category: 'performance',
            subcategory: 'network',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Measure total page weight', expected: '<2MB total' },
                { order: 2, action: 'Check compression (gzip/brotli)', expected: 'Compression enabled' },
                { order: 3, action: 'Verify CDN usage for assets', expected: 'CDN configured' },
                { order: 4, action: 'Check HTTP/2 or HTTP/3', expected: 'Modern protocol' }
            ],
            expectedResult: 'Network transfer is optimized'
        }));

        // Caching performance
        tests.push(this.createTest({
            name: 'Performance: Caching Effectiveness',
            description: 'Test caching layer performance',
            category: 'performance',
            subcategory: 'caching',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Request cached resource', expected: 'Cache hit' },
                { order: 2, action: 'Measure cache response time', expected: '<10ms' },
                { order: 3, action: 'Verify Cache-Control headers', expected: 'Headers set' },
                { order: 4, action: 'Check ETag validation', expected: 'ETag working' }
            ],
            expectedResult: 'Caching improves performance'
        }));

        // Form performance
        for (const form of this.analysisResult.forms.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Performance: Form Submission - ${form.name}`,
                description: `Measure form submission performance for ${form.name}`,
                category: 'performance',
                subcategory: 'form_submission',
                automationLevel: 'full',
                priority: 'low',
                steps: [
                    { order: 1, action: `Navigate to ${form.name}`, expected: 'Form loaded' },
                    { order: 2, action: 'Fill form with valid data', expected: 'Form filled' },
                    { order: 3, action: 'Submit form', expected: 'Submission <2s' },
                    { order: 4, action: 'Measure client-side validation time', expected: '<100ms' }
                ],
                expectedResult: 'Form submission is responsive',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Animation performance
        tests.push(this.createTest({
            name: 'Performance: Animation Smoothness',
            description: 'Test CSS and JavaScript animation performance',
            category: 'performance',
            subcategory: 'animation',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Trigger page animations', expected: 'Animations run' },
                { order: 2, action: 'Measure frame rate', expected: '>60 FPS' },
                { order: 3, action: 'Check for layout thrashing', expected: 'No thrashing' },
                { order: 4, action: 'Verify GPU acceleration', expected: 'GPU used' }
            ],
            expectedResult: 'Animations run smoothly'
        }));

        // Scroll performance
        tests.push(this.createTest({
            name: 'Performance: Scroll Performance',
            description: 'Test scrolling performance on long pages',
            category: 'performance',
            subcategory: 'scroll',
            automationLevel: 'full',
            priority: 'low',
            steps: [
                { order: 1, action: 'Navigate to long page', expected: 'Page loaded' },
                { order: 2, action: 'Scroll rapidly', expected: 'Smooth scrolling' },
                { order: 3, action: 'Measure scroll jank', expected: 'Minimal jank' },
                { order: 4, action: 'Check lazy loading triggers', expected: 'Lazy loading works' }
            ],
            expectedResult: 'Scrolling is smooth and responsive'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateEdgeCaseTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    async generateMonkeyTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    async generateFeatureTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    async generateLoadTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate negative tests - Invalid inputs, error paths, failure scenarios
     */
    async generateNegativeTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate boundary tests - BVA (Boundary Value Analysis)
     */
    async generateBoundaryTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate accessibility tests - WCAG 2.1 compliance
     */
    async generateAccessibilityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate sanity tests - Quick validation after changes
     */
    async generateSanityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Application startup sanity tests
        tests.push(this.createTest({
            name: 'Sanity: Application Starts',
            description: 'Verify application starts without errors',
            category: 'sanity',
            subcategory: 'startup',
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
            name: 'Sanity: Server Response Time',
            description: 'Verify server responds within acceptable time',
            category: 'sanity',
            subcategory: 'performance',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Send request to home page', expected: 'Request sent' },
                { order: 2, action: 'Measure response time', expected: 'Response received' },
                { order: 3, action: 'Verify response < 3 seconds', expected: 'Fast response' }
            ],
            expectedResult: 'Server responds quickly'
        }));

        // Core navigation sanity
        tests.push(this.createTest({
            name: 'Sanity: Core Navigation Works',
            description: 'Verify main navigation functions',
            category: 'sanity',
            subcategory: 'navigation',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Click main navigation links', expected: 'Pages load' },
                { order: 2, action: 'Use browser back/forward', expected: 'Navigation works' },
                { order: 3, action: 'Verify URL changes correctly', expected: 'URL updates' }
            ],
            expectedResult: 'Navigation is functional'
        }));

        // Critical route sanity tests
        for (const route of this.analysisResult.routes.slice(0, 10)) {
            tests.push(this.createTest({
                name: `Sanity: ${route.method} ${route.path} Accessible`,
                description: `Verify ${route.path} is accessible after changes`,
                category: 'sanity',
                subcategory: 'route_accessibility',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${route.method} to ${route.path}`, expected: 'Request accepted' },
                    { order: 2, action: 'Verify status code', expected: '2xx status' },
                    { order: 3, action: 'Check no server errors', expected: 'No 5xx errors' }
                ],
                expectedResult: 'Route is accessible',
                targetElement: { type: 'route', path: route.path, method: route.method }
            }));
        }

        // Auth sanity if present
        if (this.analysisResult.authFlows.length > 0) {
            tests.push(this.createTest({
                name: 'Sanity: Authentication Works',
                description: 'Verify login/logout functionality',
                category: 'sanity',
                subcategory: 'authentication',
                automationLevel: 'partial',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Login with test credentials', expected: 'Login succeeds' },
                    { order: 2, action: 'Verify session is created', expected: 'Session active' },
                    { order: 3, action: 'Logout', expected: 'Logout succeeds' }
                ],
                expectedResult: 'Authentication cycle works'
            }));

            tests.push(this.createTest({
                name: 'Sanity: Session Persistence',
                description: 'Verify session persists after page refresh',
                category: 'sanity',
                subcategory: 'session',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: 'Login to application', expected: 'Logged in' },
                    { order: 2, action: 'Refresh page', expected: 'Page reloads' },
                    { order: 3, action: 'Verify still logged in', expected: 'Session persisted' }
                ],
                expectedResult: 'Session persists after refresh'
            }));
        }

        // Database sanity if present
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Sanity: Database Connection',
                description: 'Verify database is accessible',
                category: 'sanity',
                subcategory: 'database',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Connect to database', expected: 'Connection established' },
                    { order: 2, action: 'Execute simple query', expected: 'Query returns data' },
                    { order: 3, action: 'Verify no connection errors', expected: 'No errors' }
                ],
                expectedResult: 'Database is accessible'
            }));
        }

        // Form sanity tests
        for (const form of this.analysisResult.forms.slice(0, 5)) {
            tests.push(this.createTest({
                name: `Sanity: ${form.name} Form Loads`,
                description: `Verify ${form.name} form renders after changes`,
                category: 'sanity',
                subcategory: 'form_rendering',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${form.name}`, expected: 'Form displayed' },
                    { order: 2, action: 'Check form fields', expected: 'Fields present' },
                    { order: 3, action: 'Verify submit button', expected: 'Button visible' }
                ],
                expectedResult: 'Form renders correctly',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // API endpoint sanity
        for (const endpoint of this.analysisResult.endpoints.slice(0, 8)) {
            tests.push(this.createTest({
                name: `Sanity: API ${endpoint.method} ${endpoint.path}`,
                description: `Verify API endpoint ${endpoint.path} works`,
                category: 'sanity',
                subcategory: 'api',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Call ${endpoint.method} ${endpoint.path}`, expected: 'API responds' },
                    { order: 2, action: 'Check response status', expected: 'Valid status code' },
                    { order: 3, action: 'Validate response format', expected: 'Valid format' }
                ],
                expectedResult: 'API endpoint is functional',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Component sanity tests
        for (const component of this.analysisResult.components.slice(0, 8)) {
            tests.push(this.createTest({
                name: `Sanity: ${component.name} Component Renders`,
                description: `Verify ${component.name} displays after changes`,
                category: 'sanity',
                subcategory: 'component',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${component.name}`, expected: 'Page loads' },
                    { order: 2, action: 'Verify component visible', expected: 'Component displayed' },
                    { order: 3, action: 'Check no rendering errors', expected: 'No errors' }
                ],
                expectedResult: 'Component renders correctly',
                targetElement: { type: 'component', selector: component.name }
            }));
        }

        // Critical functionality sanity tests
        tests.push(this.createTest({
            name: 'Sanity: JavaScript Execution',
            description: 'Verify JavaScript runs without errors',
            category: 'sanity',
            subcategory: 'javascript',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Load application', expected: 'App loads' },
                { order: 2, action: 'Check console for errors', expected: 'No JS errors' },
                { order: 3, action: 'Interact with dynamic elements', expected: 'Elements respond' }
            ],
            expectedResult: 'JavaScript executes without errors'
        }));

        tests.push(this.createTest({
            name: 'Sanity: CSS Styling Applied',
            description: 'Verify styles are applied correctly',
            category: 'sanity',
            subcategory: 'styling',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Load application', expected: 'App loads' },
                { order: 2, action: 'Check layout integrity', expected: 'Layout correct' },
                { order: 3, action: 'Verify visual elements', expected: 'Styles applied' }
            ],
            expectedResult: 'CSS styling is correct'
        }));

        tests.push(this.createTest({
            name: 'Sanity: Error Handling',
            description: 'Verify error pages work correctly',
            category: 'sanity',
            subcategory: 'error_handling',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate to non-existent page', expected: '404 page shown' },
                { order: 2, action: 'Verify error message', expected: 'Message displayed' },
                { order: 3, action: 'Check navigation options', expected: 'Way out provided' }
            ],
            expectedResult: 'Error handling works correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate regression tests - Verify existing features
     */
    async generateRegressionTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Route-based regression tests
        for (const route of this.analysisResult.routes.slice(0, 20)) {
            tests.push(this.createTest({
                name: `Regression: ${route.method} ${route.path} - Basic Functionality`,
                description: `Verify ${route.path} endpoint responds correctly`,
                category: 'regression',
                subcategory: 'route_basic',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${route.method} request to ${route.path}`, expected: 'Request accepted' },
                    { order: 2, action: 'Verify HTTP status code', expected: '200 OK or appropriate status' },
                    { order: 3, action: 'Check response headers', expected: 'Headers present and valid' },
                    { order: 4, action: 'Validate response body structure', expected: 'Response matches schema' }
                ],
                expectedResult: 'Route responds correctly with valid data',
                targetElement: { type: 'route', path: route.path, method: route.method }
            }));

            tests.push(this.createTest({
                name: `Regression: ${route.method} ${route.path} - Response Time`,
                description: `Verify ${route.path} responds within acceptable time`,
                category: 'regression',
                subcategory: 'performance_regression',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Send request to ${route.path}`, expected: 'Request sent' },
                    { order: 2, action: 'Measure response time', expected: 'Response received' },
                    { order: 3, action: 'Verify response time < 2 seconds', expected: 'Fast response' }
                ],
                expectedResult: 'Response time is acceptable',
                targetElement: { type: 'route', path: route.path, method: route.method }
            }));
        }

        // Form regression tests
        for (const form of this.analysisResult.forms) {
            tests.push(this.createTest({
                name: `Regression: ${form.name} Form Submission`,
                description: `Verify ${form.name} form submits correctly`,
                category: 'regression',
                subcategory: 'form_submission',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${form.name}`, expected: 'Form displayed' },
                    { order: 2, action: 'Fill all required fields with valid data', expected: 'Fields populated' },
                    { order: 3, action: 'Submit the form', expected: 'Form submitted' },
                    { order: 4, action: 'Verify success message/redirect', expected: 'Success indication shown' }
                ],
                expectedResult: 'Form submits successfully with valid data',
                targetElement: { type: 'form', selector: form.name }
            }));

            tests.push(this.createTest({
                name: `Regression: ${form.name} Form Validation`,
                description: `Verify ${form.name} form validation works`,
                category: 'regression',
                subcategory: 'form_validation',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${form.name}`, expected: 'Form displayed' },
                    { order: 2, action: 'Leave required fields empty', expected: 'Fields empty' },
                    { order: 3, action: 'Attempt form submission', expected: 'Validation errors displayed' },
                    { order: 4, action: 'Verify error messages are clear', expected: 'Errors informative' }
                ],
                expectedResult: 'Form validation prevents invalid submission',
                targetElement: { type: 'form', selector: form.name }
            }));
        }

        // Component regression tests
        for (const component of this.analysisResult.components.slice(0, 15)) {
            tests.push(this.createTest({
                name: `Regression: ${component.name} Component Renders`,
                description: `Verify ${component.name} displays correctly`,
                category: 'regression',
                subcategory: 'component_rendering',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${component.name}`, expected: 'Page loads' },
                    { order: 2, action: 'Verify component is visible', expected: 'Component displayed' },
                    { order: 3, action: 'Check for visual defects', expected: 'No broken layout' },
                    { order: 4, action: 'Verify all child elements present', expected: 'Complete structure' }
                ],
                expectedResult: 'Component renders correctly without issues',
                targetElement: { type: 'component', selector: component.name }
            }));

            tests.push(this.createTest({
                name: `Regression: ${component.name} Interactive Elements`,
                description: `Verify ${component.name} buttons/links work`,
                category: 'regression',
                subcategory: 'interactivity',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Navigate to ${component.name}`, expected: 'Page loaded' },
                    { order: 2, action: 'Click all interactive elements', expected: 'Elements respond' },
                    { order: 3, action: 'Verify no console errors', expected: 'No JS errors' },
                    { order: 4, action: 'Check navigation works', expected: 'Correct navigation' }
                ],
                expectedResult: 'All interactive elements function correctly',
                targetElement: { type: 'component', selector: component.name }
            }));
        }

        // Authentication regression tests
        if (this.analysisResult.authFlows.length > 0) {
            for (const authFlow of this.analysisResult.authFlows) {
                tests.push(this.createTest({
                    name: `Regression: ${authFlow.type} Authentication Flow`,
                    description: `Verify ${authFlow.type} authentication works`,
                    category: 'regression',
                    subcategory: 'authentication',
                    automationLevel: 'full',
                    priority: 'critical',
                    steps: [
                        { order: 1, action: 'Navigate to login page', expected: 'Login form displayed' },
                        { order: 2, action: 'Enter valid credentials', expected: 'Credentials accepted' },
                        { order: 3, action: 'Submit login', expected: 'Login successful' },
                        { order: 4, action: 'Verify session/token created', expected: 'Authenticated state' }
                    ],
                    expectedResult: 'Authentication flow works correctly',
                    targetElement: { type: 'route', path: authFlow.endpoint }
                }));
            }
        }

        // Database regression tests
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Regression: Database Connection Stability',
                description: 'Verify database connection is stable',
                category: 'regression',
                subcategory: 'database_connection',
                automationLevel: 'full',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Connect to database', expected: 'Connection established' },
                    { order: 2, action: 'Execute read query', expected: 'Query returns data' },
                    { order: 3, action: 'Execute write query', expected: 'Write successful' },
                    { order: 4, action: 'Verify connection pooling', expected: 'Connections managed' }
                ],
                expectedResult: 'Database operations work correctly'
            }));
        }

        // API endpoint regression tests
        for (const endpoint of this.analysisResult.endpoints.slice(0, 20)) {
            tests.push(this.createTest({
                name: `Regression: API ${endpoint.method} ${endpoint.path} - Contract`,
                description: `Verify API contract for ${endpoint.path}`,
                category: 'regression',
                subcategory: 'api_contract',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${endpoint.method} to ${endpoint.path}`, expected: 'Request sent' },
                    { order: 2, action: 'Verify response status code', expected: 'Expected status' },
                    { order: 3, action: 'Validate response schema', expected: 'Schema matches' },
                    { order: 4, action: 'Check error handling', expected: 'Errors handled' }
                ],
                expectedResult: 'API follows contract specification',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Cross-browser regression tests
        const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
        for (const browser of browsers) {
            tests.push(this.createTest({
                name: `Regression: ${browser} Browser Compatibility`,
                description: `Verify app works in ${browser}`,
                category: 'regression',
                subcategory: 'browser_compatibility',
                automationLevel: 'partial',
                priority: 'high',
                steps: [
                    { order: 1, action: `Open app in ${browser}`, expected: 'App loads' },
                    { order: 2, action: 'Test core functionality', expected: 'Features work' },
                    { order: 3, action: 'Check for console errors', expected: 'No errors' },
                    { order: 4, action: 'Verify responsive layout', expected: 'Layout correct' }
                ],
                expectedResult: `Application works correctly in ${browser}`
            }));
        }

        // Mobile regression tests
        const devices = ['iPhone', 'iPad', 'Android Phone', 'Android Tablet'];
        for (const device of devices) {
            tests.push(this.createTest({
                name: `Regression: ${device} Responsive Layout`,
                description: `Verify layout on ${device}`,
                category: 'regression',
                subcategory: 'mobile_responsive',
                automationLevel: 'partial',
                priority: 'medium',
                steps: [
                    { order: 1, action: `Emulate ${device}`, expected: 'Viewport set' },
                    { order: 2, action: 'Load application', expected: 'App loads' },
                    { order: 3, action: 'Verify layout adapts', expected: 'Responsive design' },
                    { order: 4, action: 'Test touch interactions', expected: 'Touch works' }
                ],
                expectedResult: `Application is responsive on ${device}`
            }));
        }

        // Cookie/Session regression tests
        tests.push(this.createTest({
            name: 'Regression: Session Persistence',
            description: 'Verify session persists correctly',
            category: 'regression',
            subcategory: 'session_management',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Login to application', expected: 'Logged in' },
                { order: 2, action: 'Navigate to different pages', expected: 'Session maintained' },
                { order: 3, action: 'Refresh page', expected: 'Session persists' },
                { order: 4, action: 'Close and reopen browser', expected: 'Session handling correct' }
            ],
            expectedResult: 'Session management works correctly'
        }));

        // Error handling regression tests
        tests.push(this.createTest({
            name: 'Regression: 404 Error Page',
            description: 'Verify 404 page displays correctly',
            category: 'regression',
            subcategory: 'error_handling',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Navigate to non-existent URL', expected: '404 triggered' },
                { order: 2, action: 'Verify 404 page renders', expected: 'Error page displayed' },
                { order: 3, action: 'Check helpful message shown', expected: 'User guidance present' },
                { order: 4, action: 'Verify navigation options', expected: 'Way out provided' }
            ],
            expectedResult: '404 error handled gracefully'
        }));

        tests.push(this.createTest({
            name: 'Regression: 500 Error Handling',
            description: 'Verify server errors handled gracefully',
            category: 'regression',
            subcategory: 'error_handling',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Trigger server error condition', expected: 'Error occurs' },
                { order: 2, action: 'Verify error message', expected: 'User-friendly message' },
                { order: 3, action: 'Check no sensitive data exposed', expected: 'Secure error' },
                { order: 4, action: 'Verify recovery options', expected: 'Can continue' }
            ],
            expectedResult: 'Server errors handled gracefully'
        }));

        // Search functionality regression
        tests.push(this.createTest({
            name: 'Regression: Search Functionality',
            description: 'Verify search returns correct results',
            category: 'regression',
            subcategory: 'search',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Navigate to search page', expected: 'Search displayed' },
                { order: 2, action: 'Enter valid search term', expected: 'Results returned' },
                { order: 3, action: 'Verify result relevance', expected: 'Results match query' },
                { order: 4, action: 'Test empty search', expected: 'Handled gracefully' }
            ],
            expectedResult: 'Search functionality works correctly'
        }));

        // Data persistence regression
        tests.push(this.createTest({
            name: 'Regression: Data Persistence',
            description: 'Verify data persists correctly',
            category: 'regression',
            subcategory: 'data_persistence',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Create new data entry', expected: 'Data saved' },
                { order: 2, action: 'Verify in database', expected: 'Stored correctly' },
                { order: 3, action: 'Refresh page', expected: 'Data persists' },
                { order: 4, action: 'Check data integrity', expected: 'No corruption' }
            ],
            expectedResult: 'Data persists correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate integration tests - Component interactions
     */
    async generateIntegrationTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate usability tests - UX evaluation
     */
    async generateUsabilityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate acceptance tests - UAT style tests
     */
    async generateAcceptanceTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
    }

    /**
     * Generate exploratory tests - Unscripted creative testing
     */
    async generateExploratoryTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

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

        this.addTestsWithCoverage(tests);
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

        this.addTestsWithCoverage(tests);
    }

    async generateBackendIdempotencyTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Idempotency tests for POST endpoints
        for (const endpoint of this.analysisResult.endpoints.filter(e => e.method === 'POST')) {
            tests.push(this.createTest({
                name: `Backend: Idempotency - ${endpoint.path} Duplicate Request`,
                description: `Verify ${endpoint.path} handles duplicate requests correctly`,
                category: 'backend_idempotency',
                subcategory: 'duplicate_requests',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send POST to ${endpoint.path} with idempotency key`, expected: 'Request sent' },
                    { order: 2, action: 'Send identical request with same key', expected: 'Duplicate sent' },
                    { order: 3, action: 'Verify response is identical', expected: 'Same response' },
                    { order: 4, action: 'Check no duplicate data created', expected: 'No duplicates' }
                ],
                expectedResult: 'Duplicate requests return same response without side effects',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Idempotency key validation
            tests.push(this.createTest({
                name: `Backend: Idempotency - ${endpoint.path} Key Validation`,
                description: `Verify ${endpoint.path} validates idempotency keys`,
                category: 'backend_idempotency',
                subcategory: 'key_validation',
                automationLevel: 'full',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Send request without idempotency key', expected: 'Request rejected or processed' },
                    { order: 2, action: 'Send with malformed key', expected: 'Error returned' },
                    { order: 3, action: 'Send with expired key', expected: 'Key expired' }
                ],
                expectedResult: 'Idempotency keys are properly validated',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // PUT/PATCH idempotency
        for (const endpoint of this.analysisResult.endpoints.filter(e => e.method === 'PUT' || e.method === 'PATCH')) {
            tests.push(this.createTest({
                name: `Backend: Idempotency - ${endpoint.method} ${endpoint.path} Consistency`,
                description: `Verify ${endpoint.method} ${endpoint.path} is idempotent`,
                category: 'backend_idempotency',
                subcategory: 'update_idempotency',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Send ${endpoint.method} with payload`, expected: 'Update applied' },
                    { order: 2, action: 'Send same request again', expected: 'No error' },
                    { order: 3, action: 'Verify state unchanged', expected: 'Consistent state' }
                ],
                expectedResult: 'Multiple identical updates produce same result',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        this.addTestsWithCoverage(tests);
    }

    async generateBackendWebhookTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Webhook delivery tests
        tests.push(this.createTest({
            name: 'Backend: Webhook - Delivery Success',
            description: 'Verify webhooks are delivered successfully',
            category: 'backend_webhooks',
            subcategory: 'delivery',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Trigger webhook event', expected: 'Event triggered' },
                { order: 2, action: 'Wait for webhook delivery', expected: 'Webhook sent' },
                { order: 3, action: 'Verify 200 response from receiver', expected: 'Success response' },
                { order: 4, action: 'Check delivery timestamp logged', expected: 'Timestamp recorded' }
            ],
            expectedResult: 'Webhook delivered and acknowledged'
        }));

        // Webhook retry logic
        tests.push(this.createTest({
            name: 'Backend: Webhook - Retry on Failure',
            description: 'Verify webhook retry mechanism works',
            category: 'backend_webhooks',
            subcategory: 'retry',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Configure receiver to return 500', expected: 'Receiver ready' },
                { order: 2, action: 'Trigger webhook', expected: 'Webhook triggered' },
                { order: 3, action: 'Verify retry attempts', expected: 'Multiple retries' },
                { order: 4, action: 'Check exponential backoff', expected: 'Backoff applied' }
            ],
            expectedResult: 'Failed webhooks are retried with exponential backoff'
        }));

        // Webhook signature verification
        tests.push(this.createTest({
            name: 'Backend: Webhook - Signature Verification',
            description: 'Verify webhook signatures are validated',
            category: 'backend_webhooks',
            subcategory: 'security',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Send webhook with valid signature', expected: 'Accepted' },
                { order: 2, action: 'Send webhook with invalid signature', expected: 'Rejected' },
                { order: 3, action: 'Send webhook without signature', expected: 'Rejected' }
            ],
            expectedResult: 'Only webhooks with valid signatures are processed'
        }));

        // Webhook payload validation
        tests.push(this.createTest({
            name: 'Backend: Webhook - Payload Validation',
            description: 'Verify webhook payloads are validated',
            category: 'backend_webhooks',
            subcategory: 'validation',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Send valid webhook payload', expected: 'Processed' },
                { order: 2, action: 'Send malformed JSON', expected: 'Error returned' },
                { order: 3, action: 'Send missing required fields', expected: 'Validation error' }
            ],
            expectedResult: 'Webhook payloads are properly validated'
        }));

        // Webhook ordering
        tests.push(this.createTest({
            name: 'Backend: Webhook - Event Ordering',
            description: 'Verify webhooks maintain event order',
            category: 'backend_webhooks',
            subcategory: 'ordering',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Trigger multiple events rapidly', expected: 'Events queued' },
                { order: 2, action: 'Verify delivery order matches trigger order', expected: 'Order preserved' },
                { order: 3, action: 'Check timestamp sequence', expected: 'Sequential timestamps' }
            ],
            expectedResult: 'Webhooks are delivered in correct order'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendStateIntegrityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Data consistency tests
        tests.push(this.createTest({
            name: 'Backend: State Integrity - Data Consistency',
            description: 'Verify data remains consistent after operations',
            category: 'backend_state_integrity',
            subcategory: 'consistency',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Record initial state', expected: 'State captured' },
                { order: 2, action: 'Perform CRUD operations', expected: 'Operations complete' },
                { order: 3, action: 'Verify referential integrity', expected: 'Relations intact' },
                { order: 4, action: 'Check for orphaned records', expected: 'No orphans' }
            ],
            expectedResult: 'Data integrity maintained after all operations'
        }));

        // Transaction rollback tests
        tests.push(this.createTest({
            name: 'Backend: State Integrity - Transaction Rollback',
            description: 'Verify transactions rollback on error',
            category: 'backend_state_integrity',
            subcategory: 'rollback',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Start multi-step transaction', expected: 'Transaction started' },
                { order: 2, action: 'Trigger error mid-transaction', expected: 'Error thrown' },
                { order: 3, action: 'Verify partial changes rolled back', expected: 'State restored' },
                { order: 4, action: 'Check database consistency', expected: 'Consistent state' }
            ],
            expectedResult: 'Failed transactions completely rollback'
        }));

        // Concurrent modification tests
        tests.push(this.createTest({
            name: 'Backend: State Integrity - Concurrent Modifications',
            description: 'Verify state integrity with concurrent updates',
            category: 'backend_state_integrity',
            subcategory: 'concurrency',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Initiate concurrent updates to same record', expected: 'Updates started' },
                { order: 2, action: 'Monitor for race conditions', expected: 'No race detected' },
                { order: 3, action: 'Verify final state is valid', expected: 'Valid state' },
                { order: 4, action: 'Check optimistic locking', expected: 'Locking works' }
            ],
            expectedResult: 'Concurrent modifications maintain state integrity'
        }));

        // State transition validation
        tests.push(this.createTest({
            name: 'Backend: State Integrity - Valid State Transitions',
            description: 'Verify only valid state transitions are allowed',
            category: 'backend_state_integrity',
            subcategory: 'transitions',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Attempt valid state transition', expected: 'Allowed' },
                { order: 2, action: 'Attempt invalid transition', expected: 'Blocked' },
                { order: 3, action: 'Verify state machine enforced', expected: 'Enforcement works' }
            ],
            expectedResult: 'Only valid state transitions permitted'
        }));

        // Data migration integrity
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Backend: State Integrity - Migration Safety',
                description: 'Verify data migrations preserve integrity',
                category: 'backend_state_integrity',
                subcategory: 'migrations',
                automationLevel: 'partial',
                priority: 'medium',
                steps: [
                    { order: 1, action: 'Run migration on test data', expected: 'Migration complete' },
                    { order: 2, action: 'Verify all data migrated', expected: 'No data loss' },
                    { order: 3, action: 'Check constraints after migration', expected: 'Constraints valid' }
                ],
                expectedResult: 'Migrations maintain data integrity'
            }));
        }

        this.addTestsWithCoverage(tests);
    }

    async generateBackendReliabilityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Graceful degradation tests
        tests.push(this.createTest({
            name: 'Backend: Reliability - Graceful Degradation',
            description: 'Verify system degrades gracefully under load',
            category: 'backend_reliability',
            subcategory: 'degradation',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Apply heavy load to system', expected: 'Load applied' },
                { order: 2, action: 'Monitor response times', expected: 'Monitored' },
                { order: 3, action: 'Verify core functionality works', expected: 'Core works' },
                { order: 4, action: 'Check non-critical features disabled', expected: 'Disabled' }
            ],
            expectedResult: 'System remains functional under stress'
        }));

        // Circuit breaker tests
        tests.push(this.createTest({
            name: 'Backend: Reliability - Circuit Breaker',
            description: 'Verify circuit breaker pattern works',
            category: 'backend_reliability',
            subcategory: 'circuit_breaker',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Simulate downstream service failure', expected: 'Service down' },
                { order: 2, action: 'Trigger multiple requests', expected: 'Requests sent' },
                { order: 3, action: 'Verify circuit opens', expected: 'Circuit open' },
                { order: 4, action: 'Wait and verify circuit closes', expected: 'Circuit closed' }
            ],
            expectedResult: 'Circuit breaker protects system from cascade failures'
        }));

        // Timeout handling
        tests.push(this.createTest({
            name: 'Backend: Reliability - Timeout Handling',
            description: 'Verify timeouts are handled correctly',
            category: 'backend_reliability',
            subcategory: 'timeout',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Introduce slow downstream service', expected: 'Delay added' },
                { order: 2, action: 'Send request and wait for timeout', expected: 'Timeout triggered' },
                { order: 3, action: 'Verify graceful timeout response', expected: 'Graceful response' },
                { order: 4, action: 'Check resources released', expected: 'Resources freed' }
            ],
            expectedResult: 'Timeouts handled gracefully without resource leaks'
        }));

        // Bulkhead pattern tests
        tests.push(this.createTest({
            name: 'Backend: Reliability - Bulkhead Isolation',
            description: 'Verify bulkhead pattern isolates failures',
            category: 'backend_reliability',
            subcategory: 'bulkhead',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Saturate one service pool', expected: 'Pool saturated' },
                { order: 2, action: 'Request other services', expected: 'Requests sent' },
                { order: 3, action: 'Verify other services respond', expected: 'Responses received' }
            ],
            expectedResult: 'Failure in one area does not affect others'
        }));

        // Self-healing tests
        tests.push(this.createTest({
            name: 'Backend: Reliability - Self-Healing',
            description: 'Verify system can recover automatically',
            category: 'backend_reliability',
            subcategory: 'self_healing',
            automationLevel: 'partial',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Inject recoverable error', expected: 'Error injected' },
                { order: 2, action: 'Monitor recovery attempts', expected: 'Recovery started' },
                { order: 3, action: 'Verify system returns to normal', expected: 'Normal state' }
            ],
            expectedResult: 'System automatically recovers from transient failures'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendConcurrencyTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Race condition tests
        tests.push(this.createTest({
            name: 'Backend: Concurrency - Race Conditions',
            description: 'Verify no race conditions in concurrent access',
            category: 'backend_concurrency',
            subcategory: 'race_conditions',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Simulate 100 concurrent users', expected: 'Users active' },
                { order: 2, action: 'All users modify same resource', expected: 'Modifications complete' },
                { order: 3, action: 'Verify no data corruption', expected: 'Data intact' },
                { order: 4, action: 'Check for lost updates', expected: 'No lost updates' }
            ],
            expectedResult: 'No race conditions detected'
        }));

        // Deadlock detection
        tests.push(this.createTest({
            name: 'Backend: Concurrency - Deadlock Prevention',
            description: 'Verify deadlocks are prevented or resolved',
            category: 'backend_concurrency',
            subcategory: 'deadlock',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Create potential deadlock scenario', expected: 'Scenario created' },
                { order: 2, action: 'Execute concurrent transactions', expected: 'Transactions running' },
                { order: 3, action: 'Monitor for deadlocks', expected: 'Monitored' },
                { order: 4, action: 'Verify deadlock resolution', expected: 'Resolved' }
            ],
            expectedResult: 'No deadlocks or quick resolution'
        }));

        // Connection pool exhaustion
        tests.push(this.createTest({
            name: 'Backend: Concurrency - Connection Pool Limits',
            description: 'Verify connection pool handles exhaustion',
            category: 'backend_concurrency',
            subcategory: 'connection_pool',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Simulate pool exhaustion', expected: 'Pool exhausted' },
                { order: 2, action: 'Wait for queue handling', expected: 'Queue processed' },
                { order: 3, action: 'Verify graceful degradation', expected: 'Graceful handling' }
            ],
            expectedResult: 'Connection pool limits enforced gracefully'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendFailureRecoveryTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Database failover
        if (this.analysisResult.databaseQueries.length > 0) {
            tests.push(this.createTest({
                name: 'Backend: Failure Recovery - Database Failover',
                description: 'Verify database failover works correctly',
                category: 'backend_failure_recovery',
                subcategory: 'database_failover',
                automationLevel: 'partial',
                priority: 'critical',
                steps: [
                    { order: 1, action: 'Identify primary database', expected: 'Primary identified' },
                    { order: 2, action: 'Simulate primary failure', expected: 'Primary down' },
                    { order: 3, action: 'Verify failover to replica', expected: 'Failover complete' },
                    { order: 4, action: 'Check data consistency', expected: 'Consistent' }
                ],
                expectedResult: 'Automatic failover with no data loss'
            }));
        }

        // Service restart recovery
        tests.push(this.createTest({
            name: 'Backend: Failure Recovery - Service Restart',
            description: 'Verify service recovers after restart',
            category: 'backend_failure_recovery',
            subcategory: 'restart',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Record application state', expected: 'State recorded' },
                { order: 2, action: 'Restart service', expected: 'Service restarted' },
                { order: 3, action: 'Verify state restoration', expected: 'State restored' },
                { order: 4, action: 'Check functionality', expected: 'Fully functional' }
            ],
            expectedResult: 'Service recovers completely after restart'
        }));

        // Message queue recovery
        tests.push(this.createTest({
            name: 'Backend: Failure Recovery - Message Queue',
            description: 'Verify message queue recovers from failures',
            category: 'backend_failure_recovery',
            subcategory: 'message_queue',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Queue messages', expected: 'Messages queued' },
                { order: 2, action: 'Simulate consumer failure', expected: 'Consumer down' },
                { order: 3, action: 'Restore consumer', expected: 'Consumer up' },
                { order: 4, action: 'Verify message processing resumes', expected: 'Processing resumed' }
            ],
            expectedResult: 'No messages lost during recovery'
        }));

        // Cache warmup after failure
        tests.push(this.createTest({
            name: 'Backend: Failure Recovery - Cache Warmup',
            description: 'Verify cache recovers after failure',
            category: 'backend_failure_recovery',
            subcategory: 'cache_recovery',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Verify cache is warm', expected: 'Cache warm' },
                { order: 2, action: 'Clear cache', expected: 'Cache cleared' },
                { order: 3, action: 'Request cached data', expected: 'Cache miss' },
                { order: 4, action: 'Verify cache repopulates', expected: 'Cache warm' }
            ],
            expectedResult: 'Cache recovers automatically'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendApiContractTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Schema validation
        for (const endpoint of this.analysisResult.endpoints) {
            tests.push(this.createTest({
                name: `Backend: API Contract - ${endpoint.path} Schema`,
                description: `Verify ${endpoint.path} response matches schema`,
                category: 'backend_api_contract',
                subcategory: 'schema',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: `Call ${endpoint.path}`, expected: 'Response received' },
                    { order: 2, action: 'Validate against OpenAPI schema', expected: 'Schema validated' },
                    { order: 3, action: 'Check required fields present', expected: 'All required present' },
                    { order: 4, action: 'Verify data types', expected: 'Types correct' }
                ],
                expectedResult: 'Response matches API contract',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));

            // Backward compatibility
            tests.push(this.createTest({
                name: `Backend: API Contract - ${endpoint.path} Backward Compatibility`,
                description: `Verify ${endpoint.path} maintains backward compatibility`,
                category: 'backend_api_contract',
                subcategory: 'compatibility',
                automationLevel: 'full',
                priority: 'high',
                steps: [
                    { order: 1, action: 'Call with old client version', expected: 'Request sent' },
                    { order: 2, action: 'Verify response structure', expected: 'Compatible structure' },
                    { order: 3, action: 'Check deprecated fields still present', expected: 'Deprecated present' }
                ],
                expectedResult: 'API remains backward compatible',
                targetElement: { type: 'endpoint', path: endpoint.path, method: endpoint.method }
            }));
        }

        // Version negotiation
        tests.push(this.createTest({
            name: 'Backend: API Contract - Version Negotiation',
            description: 'Verify API version negotiation works',
            category: 'backend_api_contract',
            subcategory: 'versioning',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Request with version header', expected: 'Version recognized' },
                { order: 2, action: 'Request latest version', expected: 'Latest returned' },
                { order: 3, action: 'Request deprecated version', expected: 'Deprecation warning' }
            ],
            expectedResult: 'Version negotiation works correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendStabilityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Long-running stability
        tests.push(this.createTest({
            name: 'Backend: Stability - Long Running Test',
            description: 'Verify system stability over extended period',
            category: 'backend_stability',
            subcategory: 'endurance',
            automationLevel: 'full',
            priority: 'medium',
            timeout: 3600000,
            steps: [
                { order: 1, action: 'Start 1-hour load test', expected: 'Test started' },
                { order: 2, action: 'Monitor memory usage hourly', expected: 'Monitored' },
                { order: 3, action: 'Check for memory leaks', expected: 'No leaks' },
                { order: 4, action: 'Verify response times stable', expected: 'Stable performance' }
            ],
            expectedResult: 'System remains stable for extended period'
        }));

        // Memory leak detection
        tests.push(this.createTest({
            name: 'Backend: Stability - Memory Leak Detection',
            description: 'Detect memory leaks under sustained load',
            category: 'backend_stability',
            subcategory: 'memory_leak',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Record baseline memory', expected: 'Baseline set' },
                { order: 2, action: 'Run sustained load for 30 minutes', expected: 'Load running' },
                { order: 3, action: 'Monitor heap growth', expected: 'Monitored' },
                { order: 4, action: 'Verify memory returns to baseline', expected: 'Memory stable' }
            ],
            expectedResult: 'No memory leaks detected'
        }));

        // Connection stability
        tests.push(this.createTest({
            name: 'Backend: Stability - Connection Stability',
            description: 'Verify connections remain stable',
            category: 'backend_stability',
            subcategory: 'connection',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Open long-lived connections', expected: 'Connections open' },
                { order: 2, action: 'Keep connections idle', expected: 'Idle maintained' },
                { order: 3, action: 'Verify no unexpected disconnections', expected: 'Stable' },
                { order: 4, action: 'Resume activity on connections', expected: 'Works normally' }
            ],
            expectedResult: 'Connections remain stable over time'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendComplianceTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Data retention policy
        tests.push(this.createTest({
            name: 'Backend: Compliance - Data Retention',
            description: 'Verify data retention policies are enforced',
            category: 'backend_compliance',
            subcategory: 'retention',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Create test data with expiration', expected: 'Data created' },
                { order: 2, action: 'Wait for retention period', expected: 'Period passed' },
                { order: 3, action: 'Verify old data is purged', expected: 'Data purged' },
                { order: 4, action: 'Check audit log of deletion', expected: 'Audit logged' }
            ],
            expectedResult: 'Data retention policies enforced correctly'
        }));

        // Audit logging
        tests.push(this.createTest({
            name: 'Backend: Compliance - Audit Logging',
            description: 'Verify all required events are audited',
            category: 'backend_compliance',
            subcategory: 'audit',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Perform CRUD operations', expected: 'Operations complete' },
                { order: 2, action: 'Check audit log entries', expected: 'Logged' },
                { order: 3, action: 'Verify user attribution', expected: 'User identified' },
                { order: 4, action: 'Check timestamp accuracy', expected: 'Accurate' }
            ],
            expectedResult: 'All operations properly audited'
        }));

        // PII handling
        tests.push(this.createTest({
            name: 'Backend: Compliance - PII Protection',
            description: 'Verify PII is properly protected',
            category: 'backend_compliance',
            subcategory: 'pii',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Create record with PII', expected: 'Record created' },
                { order: 2, action: 'Verify PII encrypted at rest', expected: 'Encrypted' },
                { order: 3, action: 'Check PII in transit', expected: 'TLS enforced' },
                { order: 4, action: 'Verify access logging for PII', expected: 'Access logged' }
            ],
            expectedResult: 'PII protected per compliance requirements'
        }));

        // GDPR/CCPA compliance
        tests.push(this.createTest({
            name: 'Backend: Compliance - Data Subject Rights',
            description: 'Verify GDPR/CCPA compliance for data subject requests',
            category: 'backend_compliance',
            subcategory: 'data_subject_rights',
            automationLevel: 'full',
            priority: 'critical',
            steps: [
                { order: 1, action: 'Submit data export request', expected: 'Request received' },
                { order: 2, action: 'Verify complete data export', expected: 'Complete export' },
                { order: 3, action: 'Submit deletion request', expected: 'Deletion processed' },
                { order: 4, action: 'Verify data removed', expected: 'Data deleted' }
            ],
            expectedResult: 'Data subject rights requests handled correctly'
        }));

        this.addTestsWithCoverage(tests);
    }

    async generateBackendObservabilityTests(): Promise<void> {
        if (!this.analysisResult) return;
        this.ensureValidAnalysisResult();

        const tests: TestCase[] = [];

        // Metrics collection
        tests.push(this.createTest({
            name: 'Backend: Observability - Metrics Collection',
            description: 'Verify all key metrics are collected',
            category: 'backend_observability',
            subcategory: 'metrics',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Generate traffic', expected: 'Traffic generated' },
                { order: 2, action: 'Check request count metrics', expected: 'Counted' },
                { order: 3, action: 'Verify latency metrics', expected: 'Latency recorded' },
                { order: 4, action: 'Check error rate metrics', expected: 'Errors tracked' }
            ],
            expectedResult: 'All metrics collected and accessible'
        }));

        // Distributed tracing
        tests.push(this.createTest({
            name: 'Backend: Observability - Distributed Tracing',
            description: 'Verify distributed tracing works across services',
            category: 'backend_observability',
            subcategory: 'tracing',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Initiate request through multiple services', expected: 'Request sent' },
                { order: 2, action: 'Verify trace ID propagation', expected: 'ID propagated' },
                { order: 3, action: 'Check span creation', expected: 'Spans created' },
                { order: 4, action: 'Verify trace completeness', expected: 'Complete trace' }
            ],
            expectedResult: 'Distributed traces capture request flow'
        }));

        // Health checks
        tests.push(this.createTest({
            name: 'Backend: Observability - Health Checks',
            description: 'Verify health check endpoints work correctly',
            category: 'backend_observability',
            subcategory: 'health',
            automationLevel: 'full',
            priority: 'high',
            steps: [
                { order: 1, action: 'Call /health endpoint', expected: 'Response received' },
                { order: 2, action: 'Verify all components reported', expected: 'All reported' },
                { order: 3, action: 'Simulate component failure', expected: 'Failure triggered' },
                { order: 4, action: 'Verify degraded status', expected: 'Status degraded' }
            ],
            expectedResult: 'Health checks accurately reflect system state'
        }));

        // Log correlation
        tests.push(this.createTest({
            name: 'Backend: Observability - Log Correlation',
            description: 'Verify logs can be correlated across components',
            category: 'backend_observability',
            subcategory: 'logs',
            automationLevel: 'full',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Make request with correlation ID', expected: 'Request made' },
                { order: 2, action: 'Check logs for correlation ID', expected: 'ID found' },
                { order: 3, action: 'Verify ID in all component logs', expected: 'All have ID' }
            ],
            expectedResult: 'Logs properly correlated for request tracing'
        }));

        // Alerting validation
        tests.push(this.createTest({
            name: 'Backend: Observability - Alerting',
            description: 'Verify alerting rules trigger correctly',
            category: 'backend_observability',
            subcategory: 'alerting',
            automationLevel: 'partial',
            priority: 'medium',
            steps: [
                { order: 1, action: 'Trigger alert condition', expected: 'Condition met' },
                { order: 2, action: 'Verify alert notification', expected: 'Alert sent' },
                { order: 3, action: 'Check alert accuracy', expected: 'Accurate' }
            ],
            expectedResult: 'Alerts fire correctly for conditions'
        }));

        this.addTestsWithCoverage(tests);
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

