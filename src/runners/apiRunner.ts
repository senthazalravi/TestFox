import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiRequestOptions {
    method: string;
    url: string;
    data?: any;
    headers?: Record<string, string>;
    timeout?: number;
    params?: Record<string, any>;
    auth?: {
        username: string;
        password: string;
    };
}

export interface ApiResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    responseTime: number;
}

/**
 * API test runner using Axios
 */
export class ApiRunner {
    private client: AxiosInstance;
    private authToken: string | null = null;

    constructor() {
        this.client = axios.create({
            validateStatus: () => true, // Accept all status codes
            timeout: 30000
        });
    }

    async request(options: ApiRequestOptions): Promise<ApiResponse> {
        const startTime = Date.now();

        const config: AxiosRequestConfig = {
            method: options.method,
            url: options.url,
            data: options.data,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
                ...(this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {})
            },
            timeout: options.timeout || 30000,
            params: options.params,
            auth: options.auth
        };

        try {
            const response: AxiosResponse = await this.client.request(config);
            const responseTime = Date.now() - startTime;

            return {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers as Record<string, string>,
                data: response.data,
                responseTime
            };
        } catch (error: any) {
            const responseTime = Date.now() - startTime;

            if (error.response) {
                return {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    headers: error.response.headers,
                    data: error.response.data,
                    responseTime
                };
            }

            throw error;
        }
    }

    async get(url: string, options?: Partial<ApiRequestOptions>): Promise<ApiResponse> {
        return this.request({ method: 'GET', url, ...options });
    }

    async post(url: string, data?: any, options?: Partial<ApiRequestOptions>): Promise<ApiResponse> {
        return this.request({ method: 'POST', url, data, ...options });
    }

    async put(url: string, data?: any, options?: Partial<ApiRequestOptions>): Promise<ApiResponse> {
        return this.request({ method: 'PUT', url, data, ...options });
    }

    async patch(url: string, data?: any, options?: Partial<ApiRequestOptions>): Promise<ApiResponse> {
        return this.request({ method: 'PATCH', url, data, ...options });
    }

    async delete(url: string, options?: Partial<ApiRequestOptions>): Promise<ApiResponse> {
        return this.request({ method: 'DELETE', url, ...options });
    }

    setAuthToken(token: string): void {
        this.authToken = token;
    }

    clearAuthToken(): void {
        this.authToken = null;
    }

    /**
     * Run multiple requests concurrently for load testing
     */
    async loadTest(options: ApiRequestOptions, concurrency: number): Promise<{
        results: ApiResponse[];
        errors: Error[];
        avgResponseTime: number;
        maxResponseTime: number;
        minResponseTime: number;
        errorRate: number;
    }> {
        const results: ApiResponse[] = [];
        const errors: Error[] = [];

        const requests = Array(concurrency).fill(null).map(async () => {
            try {
                const response = await this.request(options);
                results.push(response);
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)));
            }
        });

        await Promise.all(requests);

        const responseTimes = results.map(r => r.responseTime);
        const avgResponseTime = responseTimes.length > 0 
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
            : 0;

        return {
            results,
            errors,
            avgResponseTime,
            maxResponseTime: Math.max(...responseTimes, 0),
            minResponseTime: Math.min(...responseTimes, 0),
            errorRate: errors.length / concurrency * 100
        };
    }

    /**
     * Test rate limiting
     */
    async testRateLimit(url: string, requestCount: number = 100): Promise<{
        rateLimited: boolean;
        requestsBeforeLimit: number;
        limitStatusCode?: number;
    }> {
        let rateLimited = false;
        let requestsBeforeLimit = 0;
        let limitStatusCode: number | undefined;

        for (let i = 0; i < requestCount; i++) {
            try {
                const response = await this.request({
                    method: 'GET',
                    url,
                    timeout: 5000
                });

                if (response.status === 429) {
                    rateLimited = true;
                    limitStatusCode = 429;
                    requestsBeforeLimit = i;
                    break;
                }

                if (response.status >= 500) {
                    // Server might be overwhelmed
                    break;
                }
            } catch (error) {
                break;
            }

            // Small delay to not overwhelm the server
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        if (!rateLimited) {
            requestsBeforeLimit = requestCount;
        }

        return {
            rateLimited,
            requestsBeforeLimit,
            limitStatusCode
        };
    }
}

