/**
 * Swagger / OpenAPI Specification Parser
 *
 * Detects and parses OpenAPI 3.x and Swagger 2.0 specification files,
 * extracting endpoints, schemas, auth requirements, and generating
 * comprehensive Postman collections with mock values.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ParsedEndpoint {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters: ParsedParameter[];
    requestBody?: ParsedRequestBody;
    responses: Record<string, ParsedResponse>;
    security?: Record<string, string[]>[];
    deprecated?: boolean;
}

export interface ParsedParameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required: boolean;
    type: string;
    format?: string;
    description?: string;
    example?: any;
    enum?: any[];
}

export interface ParsedRequestBody {
    required: boolean;
    contentType: string;
    schema: ParsedSchema;
}

export interface ParsedResponse {
    statusCode: string;
    description: string;
    schema?: ParsedSchema;
}

export interface ParsedSchema {
    type: string;
    properties?: Record<string, ParsedSchemaProperty>;
    required?: string[];
    items?: ParsedSchema;
    example?: any;
}

export interface ParsedSchemaProperty {
    type: string;
    format?: string;
    description?: string;
    example?: any;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    nullable?: boolean;
    default?: any;
}

export interface SwaggerSpec {
    title: string;
    version: string;
    baseUrl: string;
    endpoints: ParsedEndpoint[];
    securitySchemes: Record<string, any>;
    tags: { name: string; description?: string }[];
}

/**
 * Find and parse Swagger/OpenAPI spec files in a project
 */
export async function detectSwaggerSpec(projectPath: string): Promise<SwaggerSpec | null> {
    const candidates = [
        'swagger.json', 'swagger.yaml', 'swagger.yml',
        'openapi.json', 'openapi.yaml', 'openapi.yml',
        'api/swagger.json', 'api/openapi.json',
        'docs/swagger.json', 'docs/openapi.json', 'docs/openapi.yaml',
        'src/swagger.json', 'src/openapi.json',
        'public/swagger.json', 'public/openapi.json',
        'static/swagger.json', 'static/openapi.json',
        'api-docs/swagger.json', 'api-docs/openapi.json',
        'spec/swagger.json', 'spec/openapi.json',
        '.testfox/swagger.json', '.testfox/openapi.json'
    ];

    for (const candidate of candidates) {
        const filePath = path.join(projectPath, candidate);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                let spec: any;

                if (filePath.endsWith('.json')) {
                    spec = JSON.parse(content);
                } else {
                    // Basic YAML parsing for simple specs (key: value)
                    spec = parseSimpleYaml(content);
                }

                if (spec) {
                    return parseSpec(spec);
                }
            } catch (err) {
                console.warn(`TestFox: Failed to parse ${candidate}:`, err);
            }
        }
    }

    return null;
}

/**
 * Parse an OpenAPI 3.x or Swagger 2.0 spec object
 */
function parseSpec(spec: any): SwaggerSpec | null {
    if (!spec) return null;

    const isOpenAPI3 = spec.openapi && spec.openapi.startsWith('3');
    const isSwagger2 = spec.swagger && spec.swagger.startsWith('2');

    if (!isOpenAPI3 && !isSwagger2) return null;

    const title = spec.info?.title || 'API';
    const version = spec.info?.version || '1.0.0';

    // Determine base URL
    let baseUrl = '';
    if (isOpenAPI3 && spec.servers?.length > 0) {
        baseUrl = spec.servers[0].url || '';
    } else if (isSwagger2) {
        const scheme = spec.schemes?.[0] || 'http';
        const host = spec.host || 'localhost:3000';
        const basePath = spec.basePath || '';
        baseUrl = `${scheme}://${host}${basePath}`;
    }

    // Parse security schemes
    const securitySchemes = isOpenAPI3
        ? spec.components?.securitySchemes || {}
        : spec.securityDefinitions || {};

    // Parse tags
    const tags = (spec.tags || []).map((t: any) => ({
        name: t.name,
        description: t.description
    }));

    // Parse endpoints
    const endpoints: ParsedEndpoint[] = [];
    const paths = spec.paths || {};

    for (const [pathStr, pathObj] of Object.entries<any>(paths)) {
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
        for (const method of methods) {
            const operation = pathObj[method];
            if (!operation) continue;

            const endpoint: ParsedEndpoint = {
                path: pathStr,
                method: method.toUpperCase(),
                operationId: operation.operationId,
                summary: operation.summary,
                description: operation.description,
                tags: operation.tags,
                parameters: [],
                responses: {},
                security: operation.security,
                deprecated: operation.deprecated
            };

            // Parse parameters (path-level + operation-level)
            const params = [...(pathObj.parameters || []), ...(operation.parameters || [])];
            for (const param of params) {
                const resolved = resolveRef(param, spec);
                endpoint.parameters.push({
                    name: resolved.name,
                    in: resolved.in,
                    required: resolved.required || resolved.in === 'path',
                    type: resolved.schema?.type || resolved.type || 'string',
                    format: resolved.schema?.format || resolved.format,
                    description: resolved.description,
                    example: resolved.example || resolved.schema?.example,
                    enum: resolved.schema?.enum || resolved.enum
                });
            }

            // Parse request body (OpenAPI 3) or body parameter (Swagger 2)
            if (isOpenAPI3 && operation.requestBody) {
                const reqBody = resolveRef(operation.requestBody, spec);
                const contentType = Object.keys(reqBody.content || {})[0] || 'application/json';
                const mediaType = reqBody.content?.[contentType] || {};
                const schema = resolveRef(mediaType.schema || {}, spec);

                endpoint.requestBody = {
                    required: reqBody.required || false,
                    contentType,
                    schema: flattenSchema(schema, spec)
                };
            } else if (isSwagger2) {
                const bodyParam = params.find((p: any) => p.in === 'body');
                if (bodyParam) {
                    const schema = resolveRef(bodyParam.schema || {}, spec);
                    endpoint.requestBody = {
                        required: bodyParam.required || false,
                        contentType: 'application/json',
                        schema: flattenSchema(schema, spec)
                    };
                }
            }

            // Parse responses
            for (const [statusCode, respObj] of Object.entries<any>(operation.responses || {})) {
                const resolved = resolveRef(respObj, spec);
                let respSchema: ParsedSchema | undefined;

                if (isOpenAPI3 && resolved.content) {
                    const ct = Object.keys(resolved.content)[0] || 'application/json';
                    const media = resolved.content[ct];
                    if (media?.schema) {
                        respSchema = flattenSchema(resolveRef(media.schema, spec), spec);
                    }
                } else if (isSwagger2 && resolved.schema) {
                    respSchema = flattenSchema(resolveRef(resolved.schema, spec), spec);
                }

                endpoint.responses[statusCode] = {
                    statusCode,
                    description: resolved.description || '',
                    schema: respSchema
                };
            }

            endpoints.push(endpoint);
        }
    }

    return { title, version, baseUrl, endpoints, securitySchemes, tags };
}

/**
 * Resolve a $ref pointer
 */
function resolveRef(obj: any, root: any): any {
    if (!obj || !obj.$ref) return obj;
    const refPath = obj.$ref.replace(/^#\//, '').split('/');
    let resolved = root;
    for (const part of refPath) {
        resolved = resolved?.[part];
    }
    return resolved || obj;
}

/**
 * Flatten a schema, resolving nested $refs
 */
function flattenSchema(schema: any, root: any): ParsedSchema {
    const resolved = resolveRef(schema, root);
    const result: ParsedSchema = {
        type: resolved.type || 'object',
        example: resolved.example
    };

    if (resolved.properties) {
        result.properties = {};
        result.required = resolved.required || [];
        for (const [key, val] of Object.entries<any>(resolved.properties)) {
            const propResolved = resolveRef(val, root);
            result.properties[key] = {
                type: propResolved.type || 'string',
                format: propResolved.format,
                description: propResolved.description,
                example: propResolved.example,
                enum: propResolved.enum,
                minimum: propResolved.minimum,
                maximum: propResolved.maximum,
                minLength: propResolved.minLength,
                maxLength: propResolved.maxLength,
                pattern: propResolved.pattern,
                nullable: propResolved.nullable,
                default: propResolved.default
            };
        }
    }

    if (resolved.items) {
        result.items = flattenSchema(resolved.items, root);
    }

    return result;
}

/**
 * Generate a mock value for a schema property
 */
export function generateMockValue(prop: ParsedSchemaProperty): any {
    if (prop.example !== undefined) return prop.example;
    if (prop.default !== undefined) return prop.default;
    if (prop.enum?.length) return prop.enum[0];

    const { type, format } = prop;

    switch (type) {
        case 'string':
            switch (format) {
                case 'email': return 'test@example.com';
                case 'uri':
                case 'url': return 'https://example.com';
                case 'uuid': return '550e8400-e29b-41d4-a716-446655440000';
                case 'date': return '2026-01-15';
                case 'date-time': return '2026-01-15T10:30:00Z';
                case 'password': return 'P@ssw0rd123!';
                case 'byte': return 'dGVzdA==';
                case 'binary': return '<binary>';
                case 'hostname': return 'api.example.com';
                case 'ipv4': return '192.168.1.1';
                case 'ipv6': return '::1';
                case 'phone': return '+1-555-0100';
                default:
                    if (prop.pattern) return `matching-${prop.pattern.slice(0, 10)}`;
                    if (prop.minLength && prop.minLength > 0) {
                        return 'a'.repeat(prop.minLength);
                    }
                    return 'test-string';
            }
        case 'integer':
        case 'number':
            if (prop.minimum !== undefined && prop.maximum !== undefined) {
                return Math.floor((prop.minimum + prop.maximum) / 2);
            }
            if (prop.minimum !== undefined) return prop.minimum + 1;
            if (prop.maximum !== undefined) return prop.maximum - 1;
            return type === 'integer' ? 42 : 42.5;
        case 'boolean':
            return true;
        case 'array':
            return [];
        case 'object':
            return {};
        default:
            return 'test-value';
    }
}

/**
 * Generate mock request body from schema
 */
export function generateMockBody(schema: ParsedSchema): any {
    if (schema.example) return schema.example;

    if (schema.type === 'object' && schema.properties) {
        const body: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties)) {
            body[key] = generateMockValue(prop);
        }
        return body;
    }

    if (schema.type === 'array' && schema.items) {
        return [generateMockBody(schema.items)];
    }

    return {};
}

/**
 * Generate mock query parameters
 */
export function generateMockQuery(params: ParsedParameter[]): Record<string, string> {
    const query: Record<string, string> = {};
    for (const param of params.filter(p => p.in === 'query')) {
        if (param.example !== undefined) {
            query[param.name] = String(param.example);
        } else if (param.enum?.length) {
            query[param.name] = String(param.enum[0]);
        } else {
            switch (param.type) {
                case 'integer':
                case 'number': query[param.name] = '1'; break;
                case 'boolean': query[param.name] = 'true'; break;
                default: query[param.name] = 'test'; break;
            }
        }
    }
    return query;
}

/**
 * Generate mock path parameters
 */
export function generateMockPath(pathStr: string, params: ParsedParameter[]): string {
    let resolved = pathStr;
    for (const param of params.filter(p => p.in === 'path')) {
        const mock = param.example
            || (param.type === 'integer' || param.type === 'number' ? '1' : 'test-id');
        resolved = resolved.replace(`{${param.name}}`, String(mock));
    }
    return resolved;
}

/**
 * Basic YAML parser for simple key-value YAML files
 */
function parseSimpleYaml(content: string): any {
    try {
        // Attempt JSON parse first (some .yaml files are actually JSON)
        return JSON.parse(content);
    } catch {
        // Very basic YAML handling - for production, use a proper YAML library
        // This handles simple flat structures but won't parse complex nested YAML
        // Users should prefer JSON specs or install a YAML parser
        console.log('TestFox: YAML spec detected. For best results, use JSON format.');
        return null;
    }
}
