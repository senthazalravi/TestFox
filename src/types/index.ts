// TestFox Type Definitions

export type ProjectType = 'nodejs' | 'python' | 'java' | 'go' | 'dotnet' | 'php' | 'ruby' | 'unknown';

export type Framework = 
    | 'react' | 'vue' | 'angular' | 'svelte' | 'nextjs' | 'nuxt' | 'gatsby'
    | 'express' | 'fastify' | 'koa' | 'nestjs' | 'hapi'
    | 'django' | 'flask' | 'fastapi'
    | 'spring' | 'springboot'
    | 'rails' | 'sinatra'
    | 'laravel' | 'symfony'
    | 'gin' | 'echo' | 'fiber'
    | 'aspnet'
    | 'unknown';

export interface ProjectInfo {
    type: ProjectType;
    framework?: Framework;
    language: string;
    rootPath: string;
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'maven' | 'gradle' | 'go' | 'composer';
    runCommand?: string;
    devCommand?: string;
    buildCommand?: string;
    testCommand?: string;
    port?: number;
    entryPoint?: string;
    configFiles: string[];
}

export interface AnalysisResult {
    routes: RouteInfo[];
    forms: FormInfo[];
    endpoints: EndpointInfo[];
    authFlows: AuthFlowInfo[];
    databaseQueries: DatabaseQueryInfo[];
    externalApis: ExternalApiInfo[];
    components: ComponentInfo[];
}

export interface RouteInfo {
    path: string;
    method: HttpMethod;
    file: string;
    line: number;
    handler?: string;
    params?: string[];
    queryParams?: string[];
    middleware?: string[];
    authentication?: boolean;
}

export interface FormInfo {
    name: string;
    file: string;
    line: number;
    action?: string;
    method?: HttpMethod;
    fields: FormFieldInfo[];
}

export interface FormFieldInfo {
    name: string;
    type: string;
    required?: boolean;
    validation?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
}

export interface EndpointInfo {
    path: string;
    method: HttpMethod;
    file: string;
    line: number;
    requestBody?: string;
    responseType?: string;
    authentication?: boolean;
    rateLimit?: boolean;
}

export interface AuthFlowInfo {
    type: 'login' | 'register' | 'logout' | 'password-reset' | 'oauth' | 'mfa';
    file: string;
    line: number;
    endpoint?: string;
    method?: HttpMethod;
}

export interface DatabaseQueryInfo {
    type: 'select' | 'insert' | 'update' | 'delete' | 'raw';
    file: string;
    line: number;
    query?: string;
    parameterized: boolean;
    table?: string;
}

export interface ExternalApiInfo {
    url: string;
    method: HttpMethod;
    file: string;
    line: number;
}

export interface ComponentInfo {
    name: string;
    file: string;
    line: number;
    type: 'page' | 'component' | 'layout' | 'modal' | 'form';
    props?: string[];
    events?: string[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// Test Types - Industry-aligned categories following ISTQB and modern QA practices
export type TestCategory = 
    // Quick Validation
    | 'smoke'           // Critical path verification - build acceptance
    | 'sanity'          // Quick focused check after changes
    | 'regression'      // Verify existing features still work
    
    // Functional Testing
    | 'functional'      // Feature behavior per requirements
    | 'api'             // REST/GraphQL endpoint validation
    | 'ui'              // User interface interaction testing
    | 'e2e'             // End-to-end user journey flows
    | 'integration'     // Component/service interaction testing
    | 'database'        // Data integrity and CRUD operations
    
    // Non-Functional Testing
    | 'security'        // OWASP Top 10, injection, auth bypass
    | 'performance'     // Response times, Core Web Vitals
    | 'load'            // Concurrent users, throughput
    | 'stress'          // Beyond normal capacity limits
    | 'accessibility'   // WCAG 2.1, screen readers, keyboard
    
    // Edge Cases & Special
    | 'negative'        // Invalid inputs, error paths, failures
    | 'boundary'        // Min/max values, edge conditions (BVA)
    | 'monkey'          // Random chaotic input testing
    
    // Manual/Exploratory
    | 'exploratory'     // Unscripted creative testing
    | 'usability'       // UX evaluation, user satisfaction
    | 'acceptance'      // User acceptance testing (UAT)
    | 'compatibility'   // Cross-browser, device, OS testing
    
    // Browser Monitoring
    | 'console_logs'    // Browser console error/warning monitoring
    | 'network_logs';   // Network request/response monitoring

// Category groups for UI organization
export type TestCategoryGroup = 
    | 'quick_validation'
    | 'functional'
    | 'non_functional'
    | 'edge_cases'
    | 'manual_exploratory'
    | 'browser_monitoring';

export interface TestCategoryInfo {
    id: TestCategory;
    name: string;
    description: string;
    group: TestCategoryGroup;
    icon: string;
    automationDefault: AutomationLevel;
}

// Category metadata for UI display
export const TEST_CATEGORIES: TestCategoryInfo[] = [
    // Quick Validation
    { id: 'smoke', name: 'Smoke Tests', description: 'Critical path verification', group: 'quick_validation', icon: 'flame', automationDefault: 'full' },
    { id: 'sanity', name: 'Sanity Tests', description: 'Quick focused checks', group: 'quick_validation', icon: 'pulse', automationDefault: 'full' },
    { id: 'regression', name: 'Regression Tests', description: 'Verify existing features', group: 'quick_validation', icon: 'history', automationDefault: 'full' },
    
    // Functional
    { id: 'functional', name: 'Functional Tests', description: 'Feature behavior validation', group: 'functional', icon: 'check-all', automationDefault: 'full' },
    { id: 'api', name: 'API Tests', description: 'Endpoint testing', group: 'functional', icon: 'cloud', automationDefault: 'full' },
    { id: 'ui', name: 'UI Tests', description: 'Interface interactions', group: 'functional', icon: 'browser', automationDefault: 'full' },
    { id: 'e2e', name: 'E2E Tests', description: 'End-to-end journeys', group: 'functional', icon: 'debug-alt', automationDefault: 'full' },
    { id: 'integration', name: 'Integration Tests', description: 'Component interactions', group: 'functional', icon: 'plug', automationDefault: 'full' },
    { id: 'database', name: 'Database Tests', description: 'Data integrity', group: 'functional', icon: 'database', automationDefault: 'full' },
    
    // Non-Functional
    { id: 'security', name: 'Security Tests', description: 'OWASP Top 10', group: 'non_functional', icon: 'shield', automationDefault: 'full' },
    { id: 'performance', name: 'Performance Tests', description: 'Response times', group: 'non_functional', icon: 'dashboard', automationDefault: 'full' },
    { id: 'load', name: 'Load Tests', description: 'Concurrent users', group: 'non_functional', icon: 'graph', automationDefault: 'full' },
    { id: 'stress', name: 'Stress Tests', description: 'Beyond capacity', group: 'non_functional', icon: 'warning', automationDefault: 'full' },
    { id: 'accessibility', name: 'Accessibility Tests', description: 'WCAG compliance', group: 'non_functional', icon: 'accessibility', automationDefault: 'partial' },
    
    // Edge Cases
    { id: 'negative', name: 'Negative Tests', description: 'Invalid inputs', group: 'edge_cases', icon: 'error', automationDefault: 'full' },
    { id: 'boundary', name: 'Boundary Tests', description: 'Edge conditions', group: 'edge_cases', icon: 'arrow-both', automationDefault: 'full' },
    { id: 'monkey', name: 'Monkey Tests', description: 'Random inputs', group: 'edge_cases', icon: 'bug', automationDefault: 'full' },
    
    // Manual/Exploratory
    { id: 'exploratory', name: 'Exploratory Tests', description: 'Creative testing', group: 'manual_exploratory', icon: 'compass', automationDefault: 'manual' },
    { id: 'usability', name: 'Usability Tests', description: 'UX evaluation', group: 'manual_exploratory', icon: 'eye', automationDefault: 'manual' },
    { id: 'acceptance', name: 'Acceptance Tests', description: 'UAT validation', group: 'manual_exploratory', icon: 'account', automationDefault: 'manual' },
    { id: 'compatibility', name: 'Compatibility Tests', description: 'Cross-browser/device', group: 'manual_exploratory', icon: 'device-mobile', automationDefault: 'partial' },
    
    // Browser Monitoring
    { id: 'console_logs', name: 'Console Log Tests', description: 'Browser console monitoring', group: 'browser_monitoring', icon: 'terminal', automationDefault: 'full' },
    { id: 'network_logs', name: 'Network Log Tests', description: 'Network request monitoring', group: 'browser_monitoring', icon: 'radio-tower', automationDefault: 'full' }
];

export const CATEGORY_GROUPS = [
    { id: 'quick_validation', name: 'Quick Validation', icon: 'zap' },
    { id: 'functional', name: 'Functional', icon: 'check' },
    { id: 'non_functional', name: 'Non-Functional', icon: 'gauge' },
    { id: 'edge_cases', name: 'Edge Cases', icon: 'warning' },
    { id: 'manual_exploratory', name: 'Manual/Exploratory', icon: 'person' },
    { id: 'browser_monitoring', name: 'Browser Monitoring', icon: 'eye' }
];

export type TestStatus = 
    | 'pending'
    | 'running'
    | 'passed'
    | 'failed'
    | 'skipped'
    | 'not_tested'
    | 'manual_pass'
    | 'manual_fail';

export type AutomationLevel = 'full' | 'partial' | 'manual';

export type TestPriority = 'critical' | 'high' | 'medium' | 'low';

export type SecurityTestType = 
    | 'sql_injection'
    | 'xss'
    | 'csrf'
    | 'auth_bypass'
    | 'session_management'
    | 'input_validation'
    | 'security_headers'
    | 'sensitive_data'
    | 'broken_access_control';

export interface TestCase {
    id: string;
    name: string;
    description: string;
    category: TestCategory;
    subcategory?: string;
    automationLevel: AutomationLevel;
    priority: TestPriority;
    tags: string[];
    preconditions?: string[];
    steps: TestStep[];
    expectedResult: string;
    targetElement?: TestTarget;
    timeout?: number;
    retries?: number;
    istqbTechnique?: IstqbTechnique;
    securityType?: SecurityTestType;
}

export interface TestStep {
    order: number;
    action: string;
    data?: string;
    expected?: string;
}

export interface TestTarget {
    type: 'route' | 'endpoint' | 'form' | 'component' | 'element';
    path?: string;
    selector?: string;
    method?: HttpMethod;
}

export type IstqbTechnique = 
    | 'boundary_value_analysis'
    | 'equivalence_partitioning'
    | 'decision_table'
    | 'state_transition'
    | 'use_case'
    | 'error_guessing'
    | 'exploratory';

export interface TestResult {
    testId: string;
    status: TestStatus;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    error?: string;
    screenshot?: string;
    logs?: string[];
    notes?: string;
    timestamp: Date;
    evidence?: TestEvidence[];
}

export interface TestEvidence {
    type: 'screenshot' | 'log' | 'response' | 'har';
    path?: string;
    content?: string;
    timestamp: Date;
}

// Report Types
export interface TestReport {
    projectInfo?: ProjectInfo;
    generatedAt: Date;
    summary: ReportSummary;
    categories: CategoryReport[];
    securityFindings: SecurityFinding[];
    performanceMetrics: PerformanceMetrics;
    recommendations: string[];
}

export interface ReportSummary {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    notTested: number;
    manualPassed: number;
    manualFailed: number;
    passRate: number;
    duration: number;
}

export interface CategoryReport {
    category: TestCategory;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    tests: TestResultDetail[];
}

export interface TestResultDetail {
    test: TestCase;
    result: TestResult;
}

export interface SecurityFinding {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    type: SecurityTestType;
    title: string;
    description: string;
    location?: string;
    recommendation: string;
    evidence?: string;
}

export interface PerformanceMetrics {
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
    endpoints: EndpointMetrics[];
}

export interface EndpointMetrics {
    path: string;
    method: HttpMethod;
    averageTime: number;
    maxTime: number;
    minTime: number;
    requestCount: number;
    errorCount: number;
}

// Configuration Types
export interface TestFoxConfig {
    autoDetectProject: boolean;
    defaultTimeout: number;
    browserHeadless: boolean;
    reportFormat: 'html' | 'json' | 'both';
    securityTestLevel: 'basic' | 'standard' | 'comprehensive';
    performanceThreshold: number;
    loadTestConcurrency: number;
}

// Manual Test Types
export interface ManualTestEntry {
    testId: string;
    status: 'pass' | 'fail' | 'skip';
    notes?: string;
    tester?: string;
    timestamp: Date;
    evidence?: string[];
}

