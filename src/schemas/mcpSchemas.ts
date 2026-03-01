/**
 * MCP JSON Schemas - Define output formats for each MCP server
 * 
 * These schemas ensure consistent, structured output from AI generation
 */

export interface PlaywrightConfig {
    testDir: string;
    fullyParallel: boolean;
    forbidOnly: boolean;
    retries: number;
    workers?: number;
    reporter: string;
    use: {
        baseURL: string;
        trace: string;
    };
    projects: Array<{
        name: string;
        use: any;
    }>;
}

export interface PlaywrightTest {
    name: string;
    test: string;
    describe?: string;
    beforeEach?: string;
    afterEach?: string;
    expect?: string;
}

export interface PostmanCollection {
    info: {
        name: string;
        description: string;
        schema: string;
    };
    item: PostmanItem[];
}

export interface PostmanItem {
    name: string;
    request?: PostmanRequest;
    item?: PostmanItem[];
    event?: PostmanEvent[];
}

export interface PostmanRequest {
    method: string;
    header?: Array<{ key: string; value: string }>;
    body?: {
        mode: string;
        raw: string;
    };
    url: {
        raw: string;
        host?: string[];
        path?: string[];
    };
}

export interface PostmanEvent {
    listen: string;
    script: {
        exec: string[];
    };
}

export interface PostmanEnvironment {
    name: string;
    values: Array<{
        key: string;
        value: string;
        type?: string;
    }>;
}

export interface DevToolsTest {
    name: string;
    type: 'network' | 'console' | 'performance' | 'coverage';
    description?: string;
    config?: {
        [key: string]: any;
    };
    threshold?: {
        metric: string;
        value: number;
    };
}

export interface NetworkTestConfig {
    blockedUrls?: string[];
    timeout?: number;
    maxResponseTime?: number;
    urls?: string[];
}

export interface ConsoleTestConfig {
    logLevel: 'error' | 'warning' | 'info';
    maxErrors?: number;
    maxWarnings?: number;
}

export interface PerformanceTestConfig {
    metric: 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTI';
    value: number;
}

/**
 * Schema validators
 */
export class SchemaValidators {
    static validatePlaywrightConfig(config: any): PlaywrightConfig | null {
        if (!config.testDir || typeof config.testDir !== 'string') {
            return null;
        }
        if (typeof config.fullyParallel !== 'boolean') {
            return null;
        }
        return config as PlaywrightConfig;
    }

    static validatePostmanCollection(collection: any): PostmanCollection | null {
        if (!collection.info || !collection.item) {
            return null;
        }
        if (!Array.isArray(collection.item)) {
            return null;
        }
        return collection as PostmanCollection;
    }

    static validateDevToolsTest(test: any): DevToolsTest | null {
        if (!test.name || !test.type) {
            return null;
        }
        const validTypes = ['network', 'console', 'performance', 'coverage'];
        if (!validTypes.includes(test.type)) {
            return null;
        }
        return test as DevToolsTest;
    }
}

/**
 * Schema templates for AI generation
 */
export class SchemaTemplates {
    static getPlaywrightConfigTemplate(): PlaywrightConfig {
        return {
            testDir: './',
            fullyParallel: true,
            forbidOnly: !!process.env.CI,
            retries: process.env.CI ? 2 : 0,
            workers: process.env.CI ? 1 : undefined,
            reporter: 'html',
            use: {
                baseURL: 'http://localhost:3000',
                trace: 'on-first-retry',
            },
            projects: [
                {
                    name: 'chromium',
                    use: { /* Desktop Chrome device config */ } as any,
                },
                {
                    name: 'firefox',
                    use: { /* Desktop Firefox device config */ } as any,
                },
                {
                    name: 'webkit',
                    use: { /* Desktop Safari device config */ } as any,
                },
            ],
        };
    }

    static getPostmanCollectionTemplate(): PostmanCollection {
        return {
            info: {
                name: "TestFox Generated API Tests",
                description: "Automatically generated API tests",
                schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            item: []
        };
    }

    static getDevToolsTestTemplate(type: string): DevToolsTest {
        return {
            name: `${type} Test`,
            type: type as 'network' | 'console' | 'performance' | 'coverage',
            description: `Chrome DevTools ${type} monitoring test`
        };
    }
}
