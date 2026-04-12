/**
 * Swagger/OpenAPI Test Generator
 *
 * Generates comprehensive Postman collections and rule-based API test cases
 * from Swagger/OpenAPI specification files. Produces mock values for all
 * parameters, validates response schemas, and covers positive/negative/edge cases.
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
    SwaggerSpec,
    ParsedEndpoint,
    generateMockBody,
    generateMockQuery,
    generateMockPath,
    generateMockValue,
    detectSwaggerSpec
} from '../core/swaggerParser';

export interface GeneratedPostmanCollection {
    info: any;
    variable: any[];
    item: any[];
}

export interface SwaggerTestCase {
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
 * Generate comprehensive Postman collection from Swagger spec
 */
export function generatePostmanCollection(spec: SwaggerSpec): GeneratedPostmanCollection {
    const collection: GeneratedPostmanCollection = {
        info: {
            name: `${spec.title} - TestFox API Tests`,
            description: `Auto-generated API test collection from OpenAPI spec v${spec.version}`,
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        variable: [
            { key: 'baseUrl', value: spec.baseUrl || 'http://localhost:3000' },
            { key: 'authToken', value: '' }
        ],
        item: []
    };

    // Group endpoints by tag
    const tagGroups = new Map<string, ParsedEndpoint[]>();
    for (const ep of spec.endpoints) {
        const tag = ep.tags?.[0] || 'Default';
        if (!tagGroups.has(tag)) tagGroups.set(tag, []);
        tagGroups.get(tag)!.push(ep);
    }

    for (const [tag, endpoints] of tagGroups) {
        const folder: any = {
            name: tag,
            description: spec.tags.find(t => t.name === tag)?.description || '',
            item: []
        };

        for (const ep of endpoints) {
            // 1. Happy path test
            folder.item.push(buildHappyPathRequest(ep, spec));

            // 2. Missing required fields test (for POST/PUT/PATCH)
            if (['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.requestBody?.schema?.required?.length) {
                folder.item.push(buildMissingFieldsRequest(ep, spec));
            }

            // 3. Invalid types test
            if (ep.requestBody?.schema?.properties) {
                folder.item.push(buildInvalidTypesRequest(ep, spec));
            }

            // 4. Empty body test (for POST/PUT/PATCH)
            if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
                folder.item.push(buildEmptyBodyRequest(ep, spec));
            }

            // 5. Wrong HTTP method test
            folder.item.push(buildWrongMethodRequest(ep, spec));

            // 6. Auth test (if endpoint requires auth)
            if (ep.security?.length || spec.securitySchemes && Object.keys(spec.securitySchemes).length > 0) {
                folder.item.push(buildUnauthorizedRequest(ep, spec));
            }

            // 7. Boundary value tests for numeric params
            const numericParams = ep.parameters.filter(p =>
                p.type === 'integer' || p.type === 'number'
            );
            if (numericParams.length > 0) {
                folder.item.push(buildBoundaryRequest(ep, numericParams, spec));
            }

            // 8. SQL injection test
            if (ep.parameters.some(p => p.type === 'string') || ep.requestBody) {
                folder.item.push(buildSQLInjectionRequest(ep, spec));
            }

            // 9. XSS test
            if (ep.requestBody?.schema?.properties) {
                folder.item.push(buildXSSRequest(ep, spec));
            }

            // 10. Response schema validation
            folder.item.push(buildSchemaValidationRequest(ep, spec));
        }

        collection.item.push(folder);
    }

    return collection;
}

/**
 * Generate rule-based test cases from Swagger spec
 */
export function generateSwaggerTestCases(spec: SwaggerSpec): SwaggerTestCase[] {
    const tests: SwaggerTestCase[] = [];

    for (const ep of spec.endpoints) {
        const opName = ep.operationId || `${ep.method} ${ep.path}`;
        const mockPath = generateMockPath(ep.path, ep.parameters);
        const mockQuery = generateMockQuery(ep.parameters);
        const mockBody = ep.requestBody ? generateMockBody(ep.requestBody.schema) : null;

        // API - Happy path
        tests.push({
            id: uuidv4(),
            name: `API: ${opName} - Success`,
            description: `${ep.summary || ep.description || `Test ${ep.method} ${ep.path}`}`,
            category: 'api',
            subcategory: 'happy_path',
            priority: 'high',
            automationLevel: 'full',
            steps: [
                { order: 1, action: `Send ${ep.method} to ${mockPath}`, expected: 'Request succeeds with 2xx status' },
                ...(mockBody ? [{ order: 2, action: 'Include valid request body', expected: 'Body accepted', data: JSON.stringify(mockBody) }] : []),
                { order: mockBody ? 3 : 2, action: 'Validate response structure', expected: 'Response matches expected schema' }
            ],
            expectedResult: '2xx response with valid schema',
            istqbTechnique: 'equivalence_partitioning'
        });

        // API - Missing required fields
        if (ep.requestBody?.schema?.required?.length) {
            for (const field of ep.requestBody.schema.required) {
                tests.push({
                    id: uuidv4(),
                    name: `API: ${opName} - Missing ${field}`,
                    description: `Test ${ep.method} ${ep.path} with missing required field: ${field}`,
                    category: 'api',
                    subcategory: 'negative',
                    priority: 'high',
                    automationLevel: 'full',
                    steps: [
                        { order: 1, action: `Send ${ep.method} to ${mockPath} without '${field}'`, expected: '400 Bad Request' },
                        { order: 2, action: 'Check error message', expected: `Error indicates missing ${field}` }
                    ],
                    expectedResult: '400 with validation error',
                    istqbTechnique: 'error_guessing'
                });
            }
        }

        // API - Wrong method
        tests.push({
            id: uuidv4(),
            name: `API: ${opName} - Wrong HTTP method`,
            description: `Send wrong HTTP method to ${ep.path}`,
            category: 'api',
            subcategory: 'negative',
            priority: 'medium',
            automationLevel: 'full',
            steps: [
                { order: 1, action: `Send ${ep.method === 'GET' ? 'DELETE' : 'GET'} to ${mockPath}`, expected: '405 Method Not Allowed' }
            ],
            expectedResult: '405 or appropriate error',
            istqbTechnique: 'error_guessing'
        });

        // Security - Unauthorized access
        if (ep.security?.length) {
            tests.push({
                id: uuidv4(),
                name: `Security: ${opName} - No auth`,
                description: `Test ${ep.method} ${ep.path} without authentication`,
                category: 'security',
                subcategory: 'authentication',
                priority: 'critical',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: `Send ${ep.method} to ${mockPath} without auth token`, expected: '401 Unauthorized' },
                    { order: 2, action: 'Send with invalid token', expected: '401 or 403' },
                    { order: 3, action: 'Send with expired token', expected: '401 Unauthorized' }
                ],
                expectedResult: 'Proper 401/403 response',
                istqbTechnique: 'error_guessing'
            });
        }

        // Security - SQL Injection
        if (ep.parameters.some(p => p.type === 'string') || ep.requestBody) {
            tests.push({
                id: uuidv4(),
                name: `Security: ${opName} - SQL Injection`,
                description: `Test ${ep.method} ${ep.path} for SQL injection vulnerability`,
                category: 'security',
                subcategory: 'injection',
                priority: 'critical',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: `Send payload with SQL injection: ' OR 1=1 --`, expected: 'Request rejected or sanitized' },
                    { order: 2, action: `Send payload with UNION SELECT`, expected: 'Request rejected or sanitized' },
                    { order: 3, action: 'Verify no DB error in response', expected: 'No database error exposed' }
                ],
                expectedResult: 'Injection attempts blocked',
                istqbTechnique: 'error_guessing'
            });
        }

        // Security - XSS
        if (ep.requestBody?.schema?.properties) {
            tests.push({
                id: uuidv4(),
                name: `Security: ${opName} - XSS`,
                description: `Test ${ep.method} ${ep.path} for XSS vulnerability`,
                category: 'security',
                subcategory: 'xss',
                priority: 'critical',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: `Send <script>alert(1)</script> in string fields`, expected: 'Input sanitized or rejected' },
                    { order: 2, action: `Send javascript: URI in URL fields`, expected: 'Input sanitized or rejected' }
                ],
                expectedResult: 'XSS payload sanitized',
                istqbTechnique: 'error_guessing'
            });
        }

        // Boundary tests for numeric params
        for (const param of ep.parameters.filter(p => p.type === 'integer' || p.type === 'number')) {
            tests.push({
                id: uuidv4(),
                name: `Boundary: ${opName} - ${param.name} limits`,
                description: `Test boundary values for ${param.name} in ${ep.method} ${ep.path}`,
                category: 'boundary',
                subcategory: 'api_params',
                priority: 'medium',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: `Send ${param.name}=0`, expected: 'Handled correctly' },
                    { order: 2, action: `Send ${param.name}=-1`, expected: 'Rejected or handled' },
                    { order: 3, action: `Send ${param.name}=999999999`, expected: 'Handled or limited' },
                    { order: 4, action: `Send ${param.name}=NaN`, expected: 'Validation error' }
                ],
                expectedResult: 'Boundary values handled properly',
                istqbTechnique: 'boundary_value_analysis'
            });
        }

        // Performance - Response time
        tests.push({
            id: uuidv4(),
            name: `Performance: ${opName} - Response time`,
            description: `Verify ${ep.method} ${ep.path} responds within acceptable time`,
            category: 'performance',
            subcategory: 'response_time',
            priority: 'medium',
            automationLevel: 'full',
            steps: [
                { order: 1, action: `Send ${ep.method} to ${mockPath}`, expected: 'Response within 3000ms' },
                { order: 2, action: 'Measure TTFB (Time to First Byte)', expected: 'TTFB < 500ms' }
            ],
            expectedResult: 'Response time within thresholds',
            istqbTechnique: 'equivalence_partitioning'
        });

        // Schema validation
        if (ep.responses['200']?.schema || ep.responses['201']?.schema) {
            tests.push({
                id: uuidv4(),
                name: `API Contract: ${opName} - Schema validation`,
                description: `Validate response schema for ${ep.method} ${ep.path}`,
                category: 'api',
                subcategory: 'contract',
                priority: 'high',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: `Send valid ${ep.method} to ${mockPath}`, expected: 'Success response' },
                    { order: 2, action: 'Validate response body against OpenAPI schema', expected: 'All fields present with correct types' },
                    { order: 3, action: 'Check Content-Type header', expected: 'application/json' }
                ],
                expectedResult: 'Response matches OpenAPI contract',
                istqbTechnique: 'decision_table'
            });
        }

        // Rate limiting
        tests.push({
            id: uuidv4(),
            name: `Load: ${opName} - Rate limiting`,
            description: `Test rate limiting for ${ep.method} ${ep.path}`,
            category: 'load',
            subcategory: 'rate_limiting',
            priority: 'medium',
            automationLevel: 'full',
            steps: [
                { order: 1, action: `Send 100 rapid requests to ${mockPath}`, expected: 'Rate limit triggered (429)' },
                { order: 2, action: 'Check Retry-After header', expected: 'Header present when rate limited' }
            ],
            expectedResult: 'Rate limiting protects endpoint',
            istqbTechnique: 'error_guessing'
        });

        // Content-type tests
        if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
            tests.push({
                id: uuidv4(),
                name: `API: ${opName} - Wrong Content-Type`,
                description: `Send wrong Content-Type to ${ep.method} ${ep.path}`,
                category: 'negative',
                subcategory: 'content_type',
                priority: 'medium',
                automationLevel: 'full',
                steps: [
                    { order: 1, action: 'Send with Content-Type: text/plain', expected: '415 Unsupported Media Type' },
                    { order: 2, action: 'Send with Content-Type: application/xml', expected: '415 or graceful handling' }
                ],
                expectedResult: 'Incorrect content type rejected',
                istqbTechnique: 'error_guessing'
            });
        }
    }

    return tests;
}

// ---- Postman request builders ----

function buildHappyPathRequest(ep: ParsedEndpoint, spec: SwaggerSpec): any {
    const mockPath = generateMockPath(ep.path, ep.parameters);
    const mockQuery = generateMockQuery(ep.parameters);
    const mockBody = ep.requestBody ? generateMockBody(ep.requestBody.schema) : null;

    const request: any = {
        name: `[Happy] ${ep.method} ${ep.path}`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: ep.requestBody?.contentType || 'application/json' }],
            url: {
                raw: `{{baseUrl}}${mockPath}`,
                host: ['{{baseUrl}}'],
                path: mockPath.split('/').filter(Boolean)
            }
        },
        event: [{
            listen: 'test',
            script: {
                exec: buildTestScript(ep, 'happy'),
                type: 'text/javascript'
            }
        }]
    };

    if (Object.keys(mockQuery).length > 0) {
        request.request.url.query = Object.entries(mockQuery).map(([k, v]) => ({ key: k, value: v }));
    }

    if (mockBody) {
        request.request.body = { mode: 'raw', raw: JSON.stringify(mockBody, null, 2), options: { raw: { language: 'json' } } };
    }

    addAuthHeader(request, ep, spec);

    return request;
}

function buildMissingFieldsRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    return {
        name: `[Negative] ${ep.method} ${ep.path} - Missing required fields`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) },
            body: { mode: 'raw', raw: '{}', options: { raw: { language: 'json' } } }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Missing fields returns 400', function () { pm.expect(pm.response.code).to.be.oneOf([400, 422]); });`,
                    `pm.test('Error message present', function () { const json = pm.response.json(); pm.expect(json.error || json.message || json.errors).to.exist; });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildInvalidTypesRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    const invalidBody: Record<string, any> = {};
    if (ep.requestBody?.schema?.properties) {
        for (const [key, prop] of Object.entries(ep.requestBody.schema.properties)) {
            invalidBody[key] = prop.type === 'string' ? 12345 : prop.type === 'integer' ? 'not-a-number' : prop.type === 'boolean' ? 'not-bool' : null;
        }
    }

    return {
        name: `[Negative] ${ep.method} ${ep.path} - Invalid types`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) },
            body: { mode: 'raw', raw: JSON.stringify(invalidBody, null, 2), options: { raw: { language: 'json' } } }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Invalid types returns 400/422', function () { pm.expect(pm.response.code).to.be.oneOf([400, 422]); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildEmptyBodyRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    return {
        name: `[Negative] ${ep.method} ${ep.path} - Empty body`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Empty body handled', function () { pm.expect(pm.response.code).to.be.oneOf([400, 411, 422]); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildWrongMethodRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    const wrongMethod = ep.method === 'GET' ? 'DELETE' : 'GET';
    return {
        name: `[Negative] ${wrongMethod} ${ep.path} - Wrong method`,
        request: {
            method: wrongMethod,
            header: [],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Wrong method returns 405 or 404', function () { pm.expect(pm.response.code).to.be.oneOf([404, 405]); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildUnauthorizedRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    return {
        name: `[Security] ${ep.method} ${ep.path} - No auth`,
        request: {
            method: ep.method,
            header: [],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Unauthorized without auth', function () { pm.expect(pm.response.code).to.be.oneOf([401, 403]); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildBoundaryRequest(ep: ParsedEndpoint, numericParams: any[], _spec: SwaggerSpec): any {
    const queryWithBoundary = numericParams.map(p => ({ key: p.name, value: '0' }));
    return {
        name: `[Boundary] ${ep.method} ${ep.path} - Numeric limits`,
        request: {
            method: ep.method,
            header: [],
            url: {
                raw: `{{baseUrl}}${ep.path}`,
                host: ['{{baseUrl}}'],
                path: ep.path.split('/').filter(Boolean),
                query: queryWithBoundary
            }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Boundary value handled', function () { pm.expect(pm.response.code).to.be.below(500); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildSQLInjectionRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    const injectionBody: Record<string, any> = {};
    if (ep.requestBody?.schema?.properties) {
        for (const key of Object.keys(ep.requestBody.schema.properties)) {
            injectionBody[key] = "' OR 1=1; DROP TABLE users; --";
        }
    }

    return {
        name: `[Security] ${ep.method} ${ep.path} - SQL Injection`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) },
            ...(Object.keys(injectionBody).length > 0 ? { body: { mode: 'raw', raw: JSON.stringify(injectionBody), options: { raw: { language: 'json' } } } } : {})
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('SQL injection blocked', function () { pm.expect(pm.response.code).to.be.oneOf([400, 403, 422]); });`,
                    `pm.test('No DB error exposed', function () { const text = pm.response.text(); pm.expect(text).to.not.include('SQL'); pm.expect(text).to.not.include('syntax error'); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildXSSRequest(ep: ParsedEndpoint, _spec: SwaggerSpec): any {
    const xssBody: Record<string, any> = {};
    if (ep.requestBody?.schema?.properties) {
        for (const [key, prop] of Object.entries(ep.requestBody.schema.properties)) {
            xssBody[key] = prop.type === 'string' ? '<script>alert("xss")</script>' : generateMockValue(prop);
        }
    }

    return {
        name: `[Security] ${ep.method} ${ep.path} - XSS`,
        request: {
            method: ep.method,
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: { raw: `{{baseUrl}}${ep.path}`, host: ['{{baseUrl}}'], path: ep.path.split('/').filter(Boolean) },
            body: { mode: 'raw', raw: JSON.stringify(xssBody, null, 2), options: { raw: { language: 'json' } } }
        },
        event: [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('XSS payload sanitized', function () { const text = pm.response.text(); pm.expect(text).to.not.include('<script>'); });`
                ],
                type: 'text/javascript'
            }
        }]
    };
}

function buildSchemaValidationRequest(ep: ParsedEndpoint, spec: SwaggerSpec): any {
    const mockPath = generateMockPath(ep.path, ep.parameters);
    const request = buildHappyPathRequest(ep, spec);
    request.name = `[Contract] ${ep.method} ${ep.path} - Schema validation`;

    const successResp = ep.responses['200'] || ep.responses['201'];
    if (successResp?.schema?.properties) {
        const fieldChecks = Object.entries(successResp.schema.properties).map(([key, prop]) => {
            return `pm.test('Response has ${key} (${prop.type})', function () { const json = pm.response.json(); pm.expect(json).to.have.property('${key}'); });`;
        });
        request.event = [{
            listen: 'test',
            script: {
                exec: [
                    `pm.test('Status is success', function () { pm.expect(pm.response.code).to.be.within(200, 299); });`,
                    `pm.test('Response is JSON', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('json'); });`,
                    ...fieldChecks
                ],
                type: 'text/javascript'
            }
        }];
    }

    return request;
}

function buildTestScript(ep: ParsedEndpoint, _type: string): string[] {
    const scripts: string[] = [
        `pm.test('Status is success', function () { pm.expect(pm.response.code).to.be.within(200, 299); });`,
        `pm.test('Response time < 3000ms', function () { pm.expect(pm.response.responseTime).to.be.below(3000); });`
    ];

    if (ep.method !== 'DELETE') {
        scripts.push(
            `pm.test('Response is JSON', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('json'); });`
        );
    }

    // Add schema property checks for success response
    const successResp = ep.responses['200'] || ep.responses['201'];
    if (successResp?.schema?.properties) {
        for (const key of Object.keys(successResp.schema.properties)) {
            scripts.push(
                `pm.test('Has field: ${key}', function () { const json = pm.response.json(); pm.expect(json).to.have.property('${key}'); });`
            );
        }
    }

    return scripts;
}

function addAuthHeader(request: any, ep: ParsedEndpoint, spec: SwaggerSpec): void {
    const hasSecurity = ep.security?.length || (spec.securitySchemes && Object.keys(spec.securitySchemes).length > 0);
    if (hasSecurity) {
        request.request.header.push({ key: 'Authorization', value: 'Bearer {{authToken}}' });
    }
}

/**
 * Save Postman collection to disk
 */
export function savePostmanCollection(collection: GeneratedPostmanCollection, projectPath: string): string {
    const dir = path.join(projectPath, '.testfox');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'swagger_postman_collection.json');
    fs.writeFileSync(filePath, JSON.stringify(collection, null, 2), 'utf8');
    return filePath;
}
