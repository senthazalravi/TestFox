/**
 * Enhanced Rule-Based Test Generator
 *
 * Generates comprehensive test cases across all categories without requiring
 * AI. These tests are generated purely from static analysis of the project
 * structure, routes, endpoints, forms, and code patterns.
 *
 * This ensures TestFox generates a good number of tests even when AI is
 * unavailable or the user chooses rule-based mode.
 */

import { v4 as uuidv4 } from 'uuid';
import { AnalysisResult } from '../types';

interface RuleTestCase {
    id: string;
    name: string;
    description: string;
    category: string;
    subcategory?: string;
    priority: string;
    automationLevel: string;
    steps: { order: number; action: string; expected: string; data?: string }[];
    expectedResult: string;
    istqbTechnique?: string;
}

/**
 * Generate enhanced rule-based tests from analysis results.
 * Returns tests across all categories to fill gaps where AI isn't available.
 */
export function generateEnhancedRuleTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    tests.push(...generateEnhancedSmokeTests(analysis));
    tests.push(...generateEnhancedFunctionalTests(analysis));
    tests.push(...generateEnhancedSecurityTests(analysis));
    tests.push(...generateEnhancedPerformanceTests(analysis));
    tests.push(...generateEnhancedAccessibilityTests(analysis));
    tests.push(...generateEnhancedNegativeTests(analysis));
    tests.push(...generateEnhancedBoundaryTests(analysis));
    tests.push(...generateEnhancedIntegrationTests(analysis));
    tests.push(...generateEnhancedRegressionTests(analysis));
    tests.push(...generateEnhancedE2ETests(analysis));
    tests.push(...generateCrossOriginTests(analysis));
    tests.push(...generateCachingTests(analysis));
    tests.push(...generateErrorHandlingTests(analysis));
    tests.push(...generateDataValidationTests(analysis));

    return tests;
}

function ct(overrides: Partial<RuleTestCase> & { name: string; description: string; category: string; steps: any[] }): RuleTestCase {
    return {
        id: uuidv4(),
        priority: 'medium',
        automationLevel: 'full',
        expectedResult: '',
        ...overrides
    };
}

// ---- Smoke Tests (enhanced) ----
function generateEnhancedSmokeTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    // Environment health checks
    tests.push(ct({
        name: 'Smoke: Application health endpoint',
        description: 'Verify application has a health/status endpoint',
        category: 'smoke', subcategory: 'health_check', priority: 'critical',
        steps: [
            { order: 1, action: 'Send GET /health or /api/health', expected: '200 OK' },
            { order: 2, action: 'Check response body', expected: 'Status indicates healthy' },
            { order: 3, action: 'Verify response time < 500ms', expected: 'Fast response' }
        ],
        expectedResult: 'Health endpoint responds correctly'
    }));

    tests.push(ct({
        name: 'Smoke: Application startup time',
        description: 'Verify application starts within acceptable time',
        category: 'smoke', subcategory: 'startup', priority: 'critical',
        steps: [
            { order: 1, action: 'Start application', expected: 'Application starts' },
            { order: 2, action: 'Measure time to first response', expected: '< 10 seconds' },
            { order: 3, action: 'Verify all routes are registered', expected: 'Routes respond' }
        ],
        expectedResult: 'Application starts within acceptable time'
    }));

    tests.push(ct({
        name: 'Smoke: Static assets load',
        description: 'Verify CSS, JS, and image assets load correctly',
        category: 'smoke', subcategory: 'assets', priority: 'high',
        steps: [
            { order: 1, action: 'Load main page', expected: 'Page renders' },
            { order: 2, action: 'Check all CSS files load (no 404)', expected: 'Styles applied' },
            { order: 3, action: 'Check all JS files load', expected: 'No script errors' },
            { order: 4, action: 'Check images load', expected: 'No broken images' }
        ],
        expectedResult: 'All static assets load correctly'
    }));

    tests.push(ct({
        name: 'Smoke: Error page renders',
        description: 'Verify 404 and error pages render correctly',
        category: 'smoke', subcategory: 'error_pages', priority: 'medium',
        steps: [
            { order: 1, action: 'Navigate to /nonexistent-page-xyz', expected: '404 page shown' },
            { order: 2, action: 'Verify error page has navigation back', expected: 'Link to home' },
            { order: 3, action: 'Verify no stack trace exposed', expected: 'Friendly error message' }
        ],
        expectedResult: 'Error pages render friendly messages'
    }));

    // HTTP method tests for each endpoint
    for (const ep of analysis.endpoints.slice(0, 20)) {
        tests.push(ct({
            name: `Smoke: ${ep.method} ${ep.path} - HEAD request`,
            description: `Verify HEAD request works for ${ep.path}`,
            category: 'smoke', subcategory: 'http_methods', priority: 'medium',
            steps: [
                { order: 1, action: `Send HEAD ${ep.path}`, expected: 'Response without body' },
                { order: 2, action: 'Check Content-Length header', expected: 'Header present' }
            ],
            expectedResult: 'HEAD request succeeds'
        }));

        tests.push(ct({
            name: `Smoke: ${ep.method} ${ep.path} - OPTIONS request`,
            description: `Verify CORS preflight for ${ep.path}`,
            category: 'smoke', subcategory: 'cors', priority: 'medium',
            steps: [
                { order: 1, action: `Send OPTIONS ${ep.path}`, expected: 'CORS headers returned' },
                { order: 2, action: 'Check Access-Control-Allow-Methods', expected: 'Allowed methods listed' }
            ],
            expectedResult: 'OPTIONS request returns CORS headers'
        }));
    }

    return tests;
}

// ---- Functional Tests (enhanced) ----
function generateEnhancedFunctionalTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    // Form tests
    for (const form of analysis.forms) {
        // String length validation
        for (const field of form.fields.filter(f => f.type === 'text' || f.type === 'string')) {
            tests.push(ct({
                name: `Functional: ${form.name} - ${field.name} max length`,
                description: `Test maximum length for ${field.name} in ${form.name}`,
                category: 'functional', subcategory: 'field_validation', priority: 'medium',
                steps: [
                    { order: 1, action: `Enter ${field.maxLength || 255} characters in ${field.name}`, expected: 'Accepted or truncated' },
                    { order: 2, action: `Enter ${(field.maxLength || 255) + 100} characters`, expected: 'Rejected or truncated' }
                ],
                expectedResult: 'Field enforces length limits',
                istqbTechnique: 'boundary_value_analysis'
            }));
        }

        // Required field combinations
        if (form.fields.filter(f => f.required).length > 1) {
            tests.push(ct({
                name: `Functional: ${form.name} - Submit with only required fields`,
                description: `Submit ${form.name} with only required fields filled`,
                category: 'functional', subcategory: 'form_submission', priority: 'high',
                steps: [
                    { order: 1, action: 'Fill only required fields', expected: 'Form accepts' },
                    { order: 2, action: 'Submit form', expected: 'Submission succeeds' },
                    { order: 3, action: 'Verify optional fields default correctly', expected: 'Defaults applied' }
                ],
                expectedResult: 'Form works with only required fields',
                istqbTechnique: 'equivalence_partitioning'
            }));
        }

        // Form reset test
        tests.push(ct({
            name: `Functional: ${form.name} - Form reset`,
            description: `Test reset/clear functionality for ${form.name}`,
            category: 'functional', subcategory: 'form_behavior', priority: 'medium',
            steps: [
                { order: 1, action: 'Fill all fields with data', expected: 'Fields populated' },
                { order: 2, action: 'Click reset/clear button', expected: 'All fields cleared' },
                { order: 3, action: 'Verify default values restored', expected: 'Defaults restored' }
            ],
            expectedResult: 'Form reset works correctly'
        }));

        // Double submit prevention
        tests.push(ct({
            name: `Functional: ${form.name} - Double submit prevention`,
            description: `Verify ${form.name} prevents double submission`,
            category: 'functional', subcategory: 'form_behavior', priority: 'high',
            steps: [
                { order: 1, action: 'Fill form with valid data', expected: 'Form ready' },
                { order: 2, action: 'Click submit twice rapidly', expected: 'Only one submission processed' },
                { order: 3, action: 'Check for duplicate records', expected: 'No duplicates created' }
            ],
            expectedResult: 'Double submission prevented'
        }));
    }

    // Auth flow tests
    for (const auth of analysis.authFlows) {
        if (auth.type === 'login') {
            tests.push(ct({
                name: 'Functional: Login with valid credentials',
                description: 'Test login flow with correct username and password',
                category: 'functional', subcategory: 'authentication', priority: 'critical',
                steps: [
                    { order: 1, action: 'Navigate to login page', expected: 'Login form visible' },
                    { order: 2, action: 'Enter valid credentials', expected: 'Fields accept input' },
                    { order: 3, action: 'Click login button', expected: 'Redirect to dashboard' },
                    { order: 4, action: 'Verify user session created', expected: 'Session active' }
                ],
                expectedResult: 'Successful login and redirect'
            }));

            tests.push(ct({
                name: 'Functional: Login - Remember me',
                description: 'Test remember me checkbox on login',
                category: 'functional', subcategory: 'authentication', priority: 'medium',
                steps: [
                    { order: 1, action: 'Login with "remember me" checked', expected: 'Login succeeds' },
                    { order: 2, action: 'Close browser and reopen', expected: 'Session persists' },
                    { order: 3, action: 'Login without "remember me"', expected: 'Session expires on close' }
                ],
                expectedResult: 'Remember me works correctly'
            }));

            tests.push(ct({
                name: 'Functional: Login - Account lockout',
                description: 'Test account lockout after failed attempts',
                category: 'functional', subcategory: 'authentication', priority: 'high',
                steps: [
                    { order: 1, action: 'Enter wrong password 5 times', expected: 'Error shown each time' },
                    { order: 2, action: 'Try 6th attempt', expected: 'Account locked message' },
                    { order: 3, action: 'Try correct password while locked', expected: 'Still locked' },
                    { order: 4, action: 'Wait for lockout period', expected: 'Account unlocked' }
                ],
                expectedResult: 'Account lockout enforced correctly'
            }));
        }

        if (auth.type === 'register') {
            tests.push(ct({
                name: 'Functional: Registration - Duplicate email',
                description: 'Prevent registration with existing email',
                category: 'functional', subcategory: 'registration', priority: 'high',
                steps: [
                    { order: 1, action: 'Register with email already in use', expected: 'Error: email exists' },
                    { order: 2, action: 'Verify no account created', expected: 'No duplicate account' }
                ],
                expectedResult: 'Duplicate email rejected'
            }));

            tests.push(ct({
                name: 'Functional: Registration - Password requirements',
                description: 'Verify password complexity requirements',
                category: 'functional', subcategory: 'registration', priority: 'high',
                steps: [
                    { order: 1, action: 'Try password "123"', expected: 'Too short error' },
                    { order: 2, action: 'Try password "password"', expected: 'Too simple error' },
                    { order: 3, action: 'Try strong password "P@ssw0rd123!"', expected: 'Accepted' }
                ],
                expectedResult: 'Password complexity enforced',
                istqbTechnique: 'boundary_value_analysis'
            }));
        }

        if (auth.type === 'password-reset') {
            tests.push(ct({
                name: 'Functional: Password reset flow',
                description: 'Test complete password reset flow',
                category: 'functional', subcategory: 'authentication', priority: 'high',
                steps: [
                    { order: 1, action: 'Click "Forgot password"', expected: 'Reset form shown' },
                    { order: 2, action: 'Enter registered email', expected: 'Reset email sent' },
                    { order: 3, action: 'Enter non-registered email', expected: 'No error exposed (security)' },
                    { order: 4, action: 'Use reset link', expected: 'New password form shown' },
                    { order: 5, action: 'Set new password and login', expected: 'Login with new password succeeds' }
                ],
                expectedResult: 'Password reset works end-to-end'
            }));
        }
    }

    return tests;
}

// ---- Security Tests (enhanced) ----
function generateEnhancedSecurityTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    // Security headers
    tests.push(ct({
        name: 'Security: HTTP security headers',
        description: 'Verify all required security headers are present',
        category: 'security', subcategory: 'headers', priority: 'critical',
        steps: [
            { order: 1, action: 'Send request to main page', expected: 'Response received' },
            { order: 2, action: 'Check X-Content-Type-Options: nosniff', expected: 'Header present' },
            { order: 3, action: 'Check X-Frame-Options', expected: 'DENY or SAMEORIGIN' },
            { order: 4, action: 'Check X-XSS-Protection', expected: '1; mode=block' },
            { order: 5, action: 'Check Strict-Transport-Security', expected: 'HSTS present' },
            { order: 6, action: 'Check Content-Security-Policy', expected: 'CSP configured' },
            { order: 7, action: 'Check Referrer-Policy', expected: 'Appropriate policy set' }
        ],
        expectedResult: 'All security headers present'
    }));

    // Cookie security
    tests.push(ct({
        name: 'Security: Cookie attributes',
        description: 'Verify cookies have secure attributes',
        category: 'security', subcategory: 'cookies', priority: 'critical',
        steps: [
            { order: 1, action: 'Login and capture cookies', expected: 'Cookies set' },
            { order: 2, action: 'Check HttpOnly flag', expected: 'Session cookies are HttpOnly' },
            { order: 3, action: 'Check Secure flag', expected: 'Cookies have Secure flag' },
            { order: 4, action: 'Check SameSite attribute', expected: 'SameSite=Strict or Lax' },
            { order: 5, action: 'Check cookie expiration', expected: 'Reasonable expiry set' }
        ],
        expectedResult: 'Cookies have all security attributes'
    }));

    // CSRF protection
    for (const form of analysis.forms.filter(f => f.method === 'POST')) {
        tests.push(ct({
            name: `Security: CSRF protection - ${form.name}`,
            description: `Verify CSRF token required for ${form.name}`,
            category: 'security', subcategory: 'csrf', priority: 'critical',
            steps: [
                { order: 1, action: `Submit ${form.name} without CSRF token`, expected: 'Rejected (403)' },
                { order: 2, action: 'Submit with invalid CSRF token', expected: 'Rejected (403)' },
                { order: 3, action: 'Submit with valid CSRF token', expected: 'Accepted' }
            ],
            expectedResult: 'CSRF protection enforced'
        }));
    }

    // Directory traversal
    tests.push(ct({
        name: 'Security: Directory traversal prevention',
        description: 'Verify path traversal attacks are blocked',
        category: 'security', subcategory: 'path_traversal', priority: 'critical',
        steps: [
            { order: 1, action: 'Request /../../../etc/passwd', expected: 'Blocked (400/403)' },
            { order: 2, action: 'Request /..%2f..%2f..%2fetc%2fpasswd', expected: 'Blocked' },
            { order: 3, action: 'Request /static/../../../../etc/passwd', expected: 'Blocked' }
        ],
        expectedResult: 'Directory traversal blocked'
    }));

    // Sensitive data exposure
    tests.push(ct({
        name: 'Security: No sensitive data in responses',
        description: 'Verify API responses do not expose sensitive data',
        category: 'security', subcategory: 'data_exposure', priority: 'critical',
        steps: [
            { order: 1, action: 'Check API responses for password fields', expected: 'No passwords in response' },
            { order: 2, action: 'Check for credit card numbers', expected: 'No CC numbers exposed' },
            { order: 3, action: 'Check for SSN/social security', expected: 'No SSN exposed' },
            { order: 4, action: 'Check for internal IPs/paths', expected: 'No internal info leaked' },
            { order: 5, action: 'Check error responses for stack traces', expected: 'No stack traces' }
        ],
        expectedResult: 'No sensitive data in API responses'
    }));

    // Rate limiting
    for (const auth of analysis.authFlows.filter(a => a.type === 'login')) {
        tests.push(ct({
            name: 'Security: Login rate limiting',
            description: 'Verify login endpoint has rate limiting',
            category: 'security', subcategory: 'rate_limiting', priority: 'high',
            steps: [
                { order: 1, action: 'Send 20 login requests in 10 seconds', expected: 'Rate limit triggered' },
                { order: 2, action: 'Check for 429 Too Many Requests', expected: '429 response' },
                { order: 3, action: 'Check Retry-After header', expected: 'Indicates wait time' }
            ],
            expectedResult: 'Login rate limiting enforced'
        }));
    }

    // Open redirect
    tests.push(ct({
        name: 'Security: Open redirect prevention',
        description: 'Verify redirects cannot point to external domains',
        category: 'security', subcategory: 'open_redirect', priority: 'high',
        steps: [
            { order: 1, action: 'Try /login?redirect=https://evil.com', expected: 'External redirect blocked' },
            { order: 2, action: 'Try /login?redirect=//evil.com', expected: 'Protocol-relative blocked' },
            { order: 3, action: 'Try /login?redirect=/dashboard', expected: 'Internal redirect allowed' }
        ],
        expectedResult: 'Open redirect prevented'
    }));

    return tests;
}

// ---- Performance Tests (enhanced) ----
function generateEnhancedPerformanceTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    tests.push(ct({
        name: 'Performance: Core Web Vitals - LCP',
        description: 'Verify Largest Contentful Paint is within threshold',
        category: 'performance', subcategory: 'core_web_vitals', priority: 'high',
        steps: [
            { order: 1, action: 'Load main page', expected: 'Page loads' },
            { order: 2, action: 'Measure LCP', expected: 'LCP < 2.5 seconds' }
        ],
        expectedResult: 'LCP within acceptable threshold'
    }));

    tests.push(ct({
        name: 'Performance: Core Web Vitals - FID',
        description: 'Verify First Input Delay is within threshold',
        category: 'performance', subcategory: 'core_web_vitals', priority: 'high',
        steps: [
            { order: 1, action: 'Load page and click first interactive element', expected: 'Response registered' },
            { order: 2, action: 'Measure FID', expected: 'FID < 100ms' }
        ],
        expectedResult: 'FID within acceptable threshold'
    }));

    tests.push(ct({
        name: 'Performance: Core Web Vitals - CLS',
        description: 'Verify Cumulative Layout Shift is minimal',
        category: 'performance', subcategory: 'core_web_vitals', priority: 'high',
        steps: [
            { order: 1, action: 'Load page and observe layout', expected: 'Stable layout' },
            { order: 2, action: 'Measure CLS', expected: 'CLS < 0.1' }
        ],
        expectedResult: 'Minimal layout shift'
    }));

    tests.push(ct({
        name: 'Performance: Bundle size check',
        description: 'Verify JavaScript and CSS bundle sizes are reasonable',
        category: 'performance', subcategory: 'bundle_size', priority: 'medium',
        steps: [
            { order: 1, action: 'Load page and capture network requests', expected: 'Resources loaded' },
            { order: 2, action: 'Check total JS size < 500KB (gzipped)', expected: 'Within limit' },
            { order: 3, action: 'Check total CSS size < 100KB (gzipped)', expected: 'Within limit' },
            { order: 4, action: 'Check total image size', expected: 'Reasonable size' }
        ],
        expectedResult: 'Bundle sizes within limits'
    }));

    tests.push(ct({
        name: 'Performance: API response times under load',
        description: 'Verify API endpoints respond quickly under normal load',
        category: 'performance', subcategory: 'api_latency', priority: 'high',
        steps: [
            { order: 1, action: 'Send 10 concurrent requests to each endpoint', expected: 'All respond' },
            { order: 2, action: 'Measure p50 response time', expected: 'p50 < 200ms' },
            { order: 3, action: 'Measure p95 response time', expected: 'p95 < 1000ms' },
            { order: 4, action: 'Measure p99 response time', expected: 'p99 < 3000ms' }
        ],
        expectedResult: 'API latencies within SLA'
    }));

    tests.push(ct({
        name: 'Performance: Database query performance',
        description: 'Verify database queries complete within acceptable time',
        category: 'performance', subcategory: 'database', priority: 'medium',
        steps: [
            { order: 1, action: 'Trigger endpoints that query database', expected: 'Queries execute' },
            { order: 2, action: 'Check no query takes > 500ms', expected: 'All queries fast' },
            { order: 3, action: 'Check for N+1 query patterns', expected: 'No N+1 queries' }
        ],
        expectedResult: 'Database queries performant'
    }));

    return tests;
}

// ---- Accessibility Tests (enhanced) ----
function generateEnhancedAccessibilityTests(_analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    tests.push(ct({
        name: 'Accessibility: Keyboard navigation',
        description: 'Verify all interactive elements are keyboard accessible',
        category: 'accessibility', subcategory: 'keyboard', priority: 'high',
        steps: [
            { order: 1, action: 'Tab through all interactive elements', expected: 'All reachable by Tab' },
            { order: 2, action: 'Check visible focus indicator on each', expected: 'Focus ring visible' },
            { order: 3, action: 'Activate buttons with Enter/Space', expected: 'Buttons activate' },
            { order: 4, action: 'Navigate dropdowns with arrow keys', expected: 'Arrow key navigation works' },
            { order: 5, action: 'Close modals with Escape', expected: 'Escape closes modals' }
        ],
        expectedResult: 'Full keyboard accessibility'
    }));

    tests.push(ct({
        name: 'Accessibility: Color contrast (WCAG AA)',
        description: 'Verify text has sufficient color contrast',
        category: 'accessibility', subcategory: 'visual', priority: 'high',
        steps: [
            { order: 1, action: 'Check body text contrast ratio', expected: '>= 4.5:1 for normal text' },
            { order: 2, action: 'Check heading contrast ratio', expected: '>= 3:1 for large text' },
            { order: 3, action: 'Check link contrast against background', expected: 'Sufficient contrast' },
            { order: 4, action: 'Check button text contrast', expected: 'Sufficient contrast' }
        ],
        expectedResult: 'WCAG AA contrast requirements met'
    }));

    tests.push(ct({
        name: 'Accessibility: Form labels and ARIA',
        description: 'Verify forms have proper labels and ARIA attributes',
        category: 'accessibility', subcategory: 'forms', priority: 'high',
        steps: [
            { order: 1, action: 'Check every input has a <label> or aria-label', expected: 'All inputs labeled' },
            { order: 2, action: 'Check error messages use aria-describedby', expected: 'Errors announced' },
            { order: 3, action: 'Check required fields have aria-required', expected: 'Required indicated' },
            { order: 4, action: 'Check form groups use fieldset/legend', expected: 'Groups labeled' }
        ],
        expectedResult: 'Forms are fully accessible'
    }));

    tests.push(ct({
        name: 'Accessibility: Image alt text',
        description: 'Verify all images have appropriate alt text',
        category: 'accessibility', subcategory: 'images', priority: 'high',
        steps: [
            { order: 1, action: 'Check all <img> elements have alt attribute', expected: 'All have alt' },
            { order: 2, action: 'Verify decorative images have alt=""', expected: 'Decorative hidden' },
            { order: 3, action: 'Verify informative images have descriptive alt', expected: 'Described properly' }
        ],
        expectedResult: 'All images have appropriate alt text'
    }));

    tests.push(ct({
        name: 'Accessibility: Heading hierarchy',
        description: 'Verify heading levels follow a logical hierarchy',
        category: 'accessibility', subcategory: 'structure', priority: 'medium',
        steps: [
            { order: 1, action: 'Check page has exactly one h1', expected: 'Single h1' },
            { order: 2, action: 'Verify heading levels dont skip (h1 > h3)', expected: 'No skipped levels' },
            { order: 3, action: 'Check landmarks are properly defined', expected: 'main, nav, footer present' }
        ],
        expectedResult: 'Proper heading hierarchy'
    }));

    tests.push(ct({
        name: 'Accessibility: Screen reader compatibility',
        description: 'Verify dynamic content is announced to screen readers',
        category: 'accessibility', subcategory: 'screen_reader', priority: 'high',
        steps: [
            { order: 1, action: 'Check alert/notification areas use role="alert"', expected: 'Alerts announced' },
            { order: 2, action: 'Check loading states use aria-live regions', expected: 'Loading announced' },
            { order: 3, action: 'Check modal dialogs trap focus', expected: 'Focus trapped in modal' },
            { order: 4, action: 'Verify page title updates on navigation', expected: 'Title reflects page' }
        ],
        expectedResult: 'Screen reader friendly'
    }));

    return tests;
}

// ---- Negative Tests (enhanced) ----
function generateEnhancedNegativeTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    for (const ep of analysis.endpoints.slice(0, 15)) {
        tests.push(ct({
            name: `Negative: ${ep.method} ${ep.path} - Malformed JSON`,
            description: `Send malformed JSON to ${ep.path}`,
            category: 'negative', subcategory: 'malformed_input', priority: 'medium',
            steps: [
                { order: 1, action: `Send {invalid json to ${ep.path}`, expected: '400 Bad Request' },
                { order: 2, action: 'Send empty string as body', expected: '400 or handled' },
                { order: 3, action: 'Send XML instead of JSON', expected: '415 or 400' }
            ],
            expectedResult: 'Malformed input handled gracefully'
        }));

        tests.push(ct({
            name: `Negative: ${ep.method} ${ep.path} - Oversized payload`,
            description: `Send oversized request to ${ep.path}`,
            category: 'negative', subcategory: 'payload_limits', priority: 'medium',
            steps: [
                { order: 1, action: `Send 10MB payload to ${ep.path}`, expected: '413 Payload Too Large' },
                { order: 2, action: 'Verify server doesnt crash', expected: 'Server still responsive' }
            ],
            expectedResult: 'Oversized payload rejected'
        }));

        if (ep.path.includes(':id') || ep.path.includes('{id}')) {
            tests.push(ct({
                name: `Negative: ${ep.method} ${ep.path} - Non-existent ID`,
                description: `Request non-existent resource at ${ep.path}`,
                category: 'negative', subcategory: 'not_found', priority: 'medium',
                steps: [
                    { order: 1, action: `Request with ID=99999999`, expected: '404 Not Found' },
                    { order: 2, action: 'Request with ID=0', expected: '404 or 400' },
                    { order: 3, action: 'Request with ID=-1', expected: '400 Bad Request' },
                    { order: 4, action: 'Request with ID=abc', expected: '400 Bad Request' }
                ],
                expectedResult: 'Invalid IDs handled correctly'
            }));
        }
    }

    // Special characters in all string fields
    for (const form of analysis.forms.slice(0, 5)) {
        tests.push(ct({
            name: `Negative: ${form.name} - Unicode/emoji input`,
            description: `Test ${form.name} with unicode and emoji characters`,
            category: 'negative', subcategory: 'special_chars', priority: 'medium',
            steps: [
                { order: 1, action: 'Enter Chinese characters', expected: 'Accepted or clear error' },
                { order: 2, action: 'Enter Arabic RTL text', expected: 'Handled correctly' },
                { order: 3, action: 'Enter emoji characters', expected: 'Accepted or rejected gracefully' },
                { order: 4, action: 'Enter null bytes \\x00', expected: 'Sanitized or rejected' }
            ],
            expectedResult: 'Special characters handled'
        }));
    }

    return tests;
}

// ---- Boundary Tests (enhanced) ----
function generateEnhancedBoundaryTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    for (const form of analysis.forms) {
        for (const field of form.fields) {
            if (field.type === 'number' || field.type === 'text') {
                tests.push(ct({
                    name: `Boundary: ${form.name} - ${field.name} empty value`,
                    description: `Test ${field.name} with empty/null value`,
                    category: 'boundary', subcategory: 'empty_values', priority: 'medium',
                    steps: [
                        { order: 1, action: `Submit with ${field.name} empty`, expected: field.required ? 'Validation error' : 'Accepted' },
                        { order: 2, action: `Submit with ${field.name} = null`, expected: 'Handled gracefully' },
                        { order: 3, action: `Submit with ${field.name} = undefined`, expected: 'Handled gracefully' }
                    ],
                    expectedResult: 'Empty/null values handled',
                    istqbTechnique: 'boundary_value_analysis'
                }));
            }

            if (field.type === 'number') {
                tests.push(ct({
                    name: `Boundary: ${form.name} - ${field.name} numeric extremes`,
                    description: `Test ${field.name} with extreme numeric values`,
                    category: 'boundary', subcategory: 'numeric', priority: 'medium',
                    steps: [
                        { order: 1, action: `Enter ${field.min || 0}`, expected: 'Accepted (minimum)' },
                        { order: 2, action: `Enter ${(field.min || 0) - 1}`, expected: 'Rejected (below min)' },
                        { order: 3, action: `Enter ${field.max || 999999}`, expected: 'Accepted (maximum)' },
                        { order: 4, action: `Enter ${(field.max || 999999) + 1}`, expected: 'Rejected (above max)' },
                        { order: 5, action: 'Enter Number.MAX_SAFE_INTEGER', expected: 'Handled gracefully' },
                        { order: 6, action: 'Enter decimal 0.1 + 0.2', expected: 'Float precision handled' }
                    ],
                    expectedResult: 'Numeric boundaries enforced',
                    istqbTechnique: 'boundary_value_analysis'
                }));
            }

            if (field.type === 'email' || field.name.toLowerCase().includes('email')) {
                tests.push(ct({
                    name: `Boundary: ${form.name} - Email format edge cases`,
                    description: `Test email field with edge case formats`,
                    category: 'boundary', subcategory: 'email', priority: 'medium',
                    steps: [
                        { order: 1, action: 'Enter valid email: user@example.com', expected: 'Accepted' },
                        { order: 2, action: 'Enter email without @: userexample.com', expected: 'Rejected' },
                        { order: 3, action: 'Enter email without domain: user@', expected: 'Rejected' },
                        { order: 4, action: 'Enter email with spaces: user @example.com', expected: 'Rejected' },
                        { order: 5, action: 'Enter very long email (255 chars)', expected: 'Accepted or rejected' },
                        { order: 6, action: 'Enter email with +: user+tag@example.com', expected: 'Accepted' }
                    ],
                    expectedResult: 'Email validation covers edge cases',
                    istqbTechnique: 'boundary_value_analysis'
                }));
            }
        }
    }

    return tests;
}

// ---- Integration Tests ----
function generateEnhancedIntegrationTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    // Database integration
    if (analysis.databaseQueries.length > 0) {
        tests.push(ct({
            name: 'Integration: Database connection resilience',
            description: 'Test application behavior when database is unavailable',
            category: 'integration', subcategory: 'database', priority: 'high',
            steps: [
                { order: 1, action: 'Simulate database connection timeout', expected: 'Graceful error returned' },
                { order: 2, action: 'Check application doesnt crash', expected: 'App still responsive' },
                { order: 3, action: 'Restore database connection', expected: 'App recovers automatically' }
            ],
            expectedResult: 'Database failures handled gracefully'
        }));

        tests.push(ct({
            name: 'Integration: Database transaction rollback',
            description: 'Verify transactions rollback on error',
            category: 'integration', subcategory: 'database', priority: 'high',
            steps: [
                { order: 1, action: 'Start multi-step operation', expected: 'Steps begin' },
                { order: 2, action: 'Cause error in middle step', expected: 'Error thrown' },
                { order: 3, action: 'Verify all steps rolled back', expected: 'No partial data' }
            ],
            expectedResult: 'Transactions rollback correctly'
        }));
    }

    // External API integration
    for (const api of analysis.externalApis.slice(0, 5)) {
        tests.push(ct({
            name: `Integration: ${api.name} - Timeout handling`,
            description: `Test behavior when ${api.name} API times out`,
            category: 'integration', subcategory: 'external_api', priority: 'high',
            steps: [
                { order: 1, action: `Simulate ${api.name} timeout`, expected: 'Graceful fallback' },
                { order: 2, action: 'Check user sees appropriate message', expected: 'User informed' },
                { order: 3, action: 'Verify retry logic', expected: 'Retries attempted' }
            ],
            expectedResult: `${api.name} timeout handled gracefully`
        }));
    }

    return tests;
}

// ---- Regression Tests ----
function generateEnhancedRegressionTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    tests.push(ct({
        name: 'Regression: All routes still accessible',
        description: 'Verify no routes have been broken by recent changes',
        category: 'regression', subcategory: 'routes', priority: 'critical',
        steps: [
            { order: 1, action: 'Hit every registered route', expected: 'All return non-500 status' },
            { order: 2, action: 'Verify response format unchanged', expected: 'Same structure' }
        ],
        expectedResult: 'All routes functional'
    }));

    tests.push(ct({
        name: 'Regression: Form submissions still work',
        description: 'Verify all forms process submissions correctly',
        category: 'regression', subcategory: 'forms', priority: 'critical',
        steps: analysis.forms.map((form, i) => ({
            order: i + 1,
            action: `Submit ${form.name} with valid data`,
            expected: 'Submission succeeds'
        })),
        expectedResult: 'All forms working'
    }));

    tests.push(ct({
        name: 'Regression: Auth flows intact',
        description: 'Verify authentication still works after changes',
        category: 'regression', subcategory: 'auth', priority: 'critical',
        steps: [
            { order: 1, action: 'Login with valid credentials', expected: 'Login succeeds' },
            { order: 2, action: 'Access protected route', expected: 'Access granted' },
            { order: 3, action: 'Logout', expected: 'Session cleared' },
            { order: 4, action: 'Access protected route after logout', expected: 'Redirected to login' }
        ],
        expectedResult: 'Auth flow fully functional'
    }));

    return tests;
}

// ---- E2E Tests ----
function generateEnhancedE2ETests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    tests.push(ct({
        name: 'E2E: Complete user registration and first action',
        description: 'Test full user journey from registration to first action',
        category: 'e2e', subcategory: 'user_journey', priority: 'critical',
        steps: [
            { order: 1, action: 'Navigate to registration page', expected: 'Registration form shown' },
            { order: 2, action: 'Fill registration form with valid data', expected: 'Form filled' },
            { order: 3, action: 'Submit registration', expected: 'Account created' },
            { order: 4, action: 'Navigate to main feature', expected: 'Feature accessible' },
            { order: 5, action: 'Perform primary action', expected: 'Action succeeds' },
            { order: 6, action: 'Verify data persists on page reload', expected: 'Data saved' }
        ],
        expectedResult: 'Full user journey works'
    }));

    tests.push(ct({
        name: 'E2E: CRUD operations workflow',
        description: 'Test Create, Read, Update, Delete cycle',
        category: 'e2e', subcategory: 'crud', priority: 'high',
        steps: [
            { order: 1, action: 'Login', expected: 'Authenticated' },
            { order: 2, action: 'Create new resource', expected: 'Resource created' },
            { order: 3, action: 'Read/view resource', expected: 'Resource displayed' },
            { order: 4, action: 'Update resource', expected: 'Changes saved' },
            { order: 5, action: 'Verify update persisted', expected: 'Updated data shown' },
            { order: 6, action: 'Delete resource', expected: 'Resource removed' },
            { order: 7, action: 'Verify deletion', expected: 'Resource no longer exists' }
        ],
        expectedResult: 'Full CRUD cycle works'
    }));

    tests.push(ct({
        name: 'E2E: Search and filter workflow',
        description: 'Test search and filter functionality end-to-end',
        category: 'e2e', subcategory: 'search', priority: 'medium',
        steps: [
            { order: 1, action: 'Navigate to list/search page', expected: 'List displayed' },
            { order: 2, action: 'Enter search query', expected: 'Results filtered' },
            { order: 3, action: 'Apply additional filters', expected: 'Further filtered' },
            { order: 4, action: 'Clear all filters', expected: 'Full list restored' },
            { order: 5, action: 'Search for non-existent item', expected: '"No results" message' }
        ],
        expectedResult: 'Search and filter works correctly'
    }));

    return tests;
}

// ---- Cross-Origin Tests ----
function generateCrossOriginTests(_analysis: AnalysisResult): RuleTestCase[] {
    return [
        ct({
            name: 'Security: CORS configuration',
            description: 'Verify CORS headers are properly configured',
            category: 'security', subcategory: 'cors', priority: 'high',
            steps: [
                { order: 1, action: 'Send request with Origin: https://evil.com', expected: 'No CORS allow header' },
                { order: 2, action: 'Send from allowed origin', expected: 'CORS headers present' },
                { order: 3, action: 'Check Access-Control-Allow-Credentials', expected: 'Properly configured' }
            ],
            expectedResult: 'CORS properly restricts origins'
        })
    ];
}

// ---- Caching Tests ----
function generateCachingTests(_analysis: AnalysisResult): RuleTestCase[] {
    return [
        ct({
            name: 'Performance: HTTP caching headers',
            description: 'Verify proper cache headers on static and dynamic resources',
            category: 'performance', subcategory: 'caching', priority: 'medium',
            steps: [
                { order: 1, action: 'Check static assets have Cache-Control with max-age', expected: 'Long cache for static' },
                { order: 2, action: 'Check API responses have appropriate cache headers', expected: 'No-cache for dynamic data' },
                { order: 3, action: 'Check ETag support', expected: 'ETags present for conditional requests' },
                { order: 4, action: 'Send If-None-Match with valid ETag', expected: '304 Not Modified' }
            ],
            expectedResult: 'Proper caching strategy'
        })
    ];
}

// ---- Error Handling Tests ----
function generateErrorHandlingTests(_analysis: AnalysisResult): RuleTestCase[] {
    return [
        ct({
            name: 'Functional: Graceful error handling',
            description: 'Verify errors are handled without crashing',
            category: 'functional', subcategory: 'error_handling', priority: 'high',
            steps: [
                { order: 1, action: 'Trigger 404 Not Found', expected: 'User-friendly 404 page' },
                { order: 2, action: 'Trigger validation error', expected: 'Clear error message shown' },
                { order: 3, action: 'Trigger server error (if possible)', expected: 'Generic error page, no stack trace' },
                { order: 4, action: 'Submit form with network disconnected', expected: 'Offline error shown' }
            ],
            expectedResult: 'All errors handled gracefully'
        }),
        ct({
            name: 'Functional: Error message consistency',
            description: 'Verify error messages follow consistent format',
            category: 'functional', subcategory: 'error_handling', priority: 'medium',
            steps: [
                { order: 1, action: 'Trigger multiple different errors', expected: 'Errors returned' },
                { order: 2, action: 'Check all have same structure (code, message)', expected: 'Consistent format' },
                { order: 3, action: 'Check no internal details leaked', expected: 'Sanitized messages' }
            ],
            expectedResult: 'Error messages are consistent and safe'
        })
    ];
}

// ---- Data Validation Tests ----
function generateDataValidationTests(analysis: AnalysisResult): RuleTestCase[] {
    const tests: RuleTestCase[] = [];

    for (const ep of analysis.endpoints.filter(e => ['POST', 'PUT', 'PATCH'].includes(e.method)).slice(0, 10)) {
        tests.push(ct({
            name: `Validation: ${ep.method} ${ep.path} - Data sanitization`,
            description: `Verify ${ep.path} sanitizes input data`,
            category: 'functional', subcategory: 'data_validation', priority: 'high',
            steps: [
                { order: 1, action: 'Send data with leading/trailing whitespace', expected: 'Whitespace trimmed' },
                { order: 2, action: 'Send data with HTML tags', expected: 'Tags stripped or escaped' },
                { order: 3, action: 'Send data exceeding max lengths', expected: 'Truncated or rejected' },
                { order: 4, action: 'Send empty required fields', expected: 'Validation error' }
            ],
            expectedResult: 'Input properly validated and sanitized'
        }));
    }

    return tests;
}
