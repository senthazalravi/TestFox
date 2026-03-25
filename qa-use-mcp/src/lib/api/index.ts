import axios from 'axios';

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async testConnection(): Promise<ApiResponse<{ connected: boolean }>> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        data: { connected: true },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async submitTestResults(results: any): Promise<ApiResponse<{ id: string }>> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/test-results`, results, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      return {
        success: response.status === 201,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit results',
      };
    }
  }

  async getTestHistory(): Promise<ApiResponse<any[]>> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/test-results`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      return {
        success: response.status === 200,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch test history',
      };
    }
  }
}

export function createApiClient(apiKey: string, baseUrl: string): ApiClient {
  return new ApiClient(apiKey, baseUrl);
}
