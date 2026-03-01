/**
 * Unified AI Provider System
 * 
 * This provides a simple, flexible interface for any AI provider
 * while maintaining a single internal contract for TestFox.
 */

// ===== UNIFIED SCHEMA =====

export interface LLMProviderConfig {
  providerType: "ollama" | "custom";
  model: string;
  baseUrl: string;
  apiKey?: string;
  payloadTemplate?: object;
}

export interface LLMRequest {
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

export interface LLMResponse {
  text: string;
  raw: any;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency?: number;
  rawResponse?: any;
}

// ===== PROVIDER ADAPTERS =====

/**
 * Ollama Adapter - Handles local Ollama instances
 */
export class OllamaAdapter {
  static async call(config: LLMProviderConfig, req: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          messages: req.messages,
          stream: req.stream ?? false,
          max_tokens: req.max_tokens,
          temperature: req.temperature,
          top_p: req.top_p
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const raw: any = await response.json();
      const text = raw.message?.content || raw.choices?.[0]?.message?.content || '';

      return { text, raw };
    } catch (error) {
      throw new Error(`Ollama adapter error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async testConnection(baseUrl: string): Promise<ConnectionTestResult> {
    try {
      const startTime = Date.now();
      const response = await fetch(`${baseUrl}/api/tags`);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          message: `Ollama server responded with ${response.status}: ${response.statusText}`,
          latency
        };
      }

      const data: any = await response.json();
      return {
        success: true,
        message: `Ollama server is running. Found ${data.models?.length || 0} models.`,
        latency,
        rawResponse: data
      };
    } catch (error) {
      return {
        success: false,
        message: `Cannot connect to Ollama server: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  static async ensureModel(config: LLMProviderConfig): Promise<boolean> {
    try {
      // Check if model exists
      const testResponse = await fetch(`${config.baseUrl}/api/show`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: config.model
        })
      });

      if (testResponse.ok) {
        return true; // Model exists
      }

      // Try to pull the model
      console.log(`🦊 Ollama: Model ${config.model} not found, attempting to pull...`);
      const pullResponse = await fetch(`${config.baseUrl}/api/pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: config.model
        })
      });

      return pullResponse.ok;
    } catch (error) {
      console.error(`❌ Ollama: Failed to ensure model ${config.model}:`, error);
      return false;
    }
  }
}

/**
 * Custom/BYOAPI Adapter - Handles any OpenAI-compatible API
 */
export class CustomAdapter {
  static async call(config: LLMProviderConfig, req: LLMRequest): Promise<LLMResponse> {
    try {
      const payload = {
        ...(config.payloadTemplate || {}),
        model: config.model,
        messages: req.messages,
        max_tokens: req.max_tokens,
        temperature: req.temperature,
        top_p: req.top_p,
        stream: req.stream ?? false
      };

      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Custom API request failed: ${response.statusText}`);
      }

      const raw: any = await response.json();
      const text = raw.choices?.[0]?.message?.content || raw.content || '';

      return { text, raw };
    } catch (error) {
      throw new Error(`Custom adapter error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async testConnection(config: LLMProviderConfig): Promise<ConnectionTestResult> {
    try {
      const startTime = Date.now();
      
      const payload = {
        ...(config.payloadTemplate || {}),
        model: config.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
        temperature: 0.1
      };

      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          message: `API responded with ${response.status}: ${response.statusText}`,
          latency,
          rawResponse: await response.text()
        };
      }

      const raw: any = await response.json();
      const text = raw.choices?.[0]?.message?.content || raw.content || '';

      return {
        success: true,
        message: `Connection successful. Model responded: "${text.trim()}"`,
        latency,
        rawResponse: raw
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// ===== UNIFIED AI PROVIDER =====

export class UnifiedAIProvider {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  /**
   * Generate text using the configured provider
   */
  async generate(prompt: string, options?: Partial<LLMRequest>): Promise<LLMResponse> {
    const request: LLMRequest = {
      model: this.config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 1.0,
      stream: false,
      ...options
    };

    switch (this.config.providerType) {
      case "ollama":
        return await OllamaAdapter.call(this.config, request);
      case "custom":
        return await CustomAdapter.call(this.config, request);
      default:
        throw new Error(`Unsupported provider type: ${this.config.providerType}`);
    }
  }

  /**
   * Test connection to the configured provider
   */
  async testConnection(): Promise<ConnectionTestResult> {
    switch (this.config.providerType) {
      case "ollama":
        return await OllamaAdapter.testConnection(this.config.baseUrl);
      case "custom":
        return await CustomAdapter.testConnection(this.config);
      default:
        return {
          success: false,
          message: `Unsupported provider type: ${this.config.providerType}`
        };
    }
  }

  /**
   * Ensure model is available (for Ollama)
   */
  async ensureModel(): Promise<boolean> {
    if (this.config.providerType === "ollama") {
      return await OllamaAdapter.ensureModel(this.config);
    }
    return true; // Custom providers typically handle model availability
  }

  /**
   * Get provider configuration
   */
  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ===== SYSTEM PROMPT CONTRACT =====

export const TESTFOX_SYSTEM_PROMPT = `You are TestFox AI. You generate test cases, analyze code, and provide QA insights.

Always follow these guidelines:
- Respond in plain text unless asked otherwise
- Follow user's instructions precisely
- If code is provided, analyze it deeply
- If asked to generate tests, output them in structured format
- Focus on comprehensive testing including edge cases
- Consider security, performance, and accessibility implications
- Provide clear, actionable recommendations

Your role is to help ensure software quality through intelligent testing and analysis.`;

// ===== PRESET CONFIGURATIONS =====

export const PRESET_CONFIGS = {
  openrouter: {
    providerType: "custom" as const,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    payloadTemplate: {
      max_tokens: 16384,
      temperature: 0.7,
      top_p: 1.0,
      stream: false
    }
  },
  nvidiaNim: {
    providerType: "custom" as const,
    baseUrl: "http://localhost:8000/v1/chat/completions",
    payloadTemplate: {
      max_tokens: 16384,
      temperature: 1.0,
      top_p: 1.0,
      stream: false
    }
  },
  amazonNova: {
    providerType: "custom" as const,
    baseUrl: "https://api.nova.amazon.com/v1/chat/completions",
    payloadTemplate: {
      max_tokens: 16384,
      temperature: 1.0,
      top_p: 1.0,
      stream: false
    }
  },
  ollama: {
    providerType: "ollama" as const,
    baseUrl: "http://localhost:11434"
  }
};

// ===== UTILITY FUNCTIONS =====

/**
 * Create a unified provider from legacy configuration
 */
export function createUnifiedProvider(legacyConfig: any): UnifiedAIProvider {
  // Map legacy provider types to unified types
  const providerMap: Record<string, LLMProviderConfig> = {
    "openrouter": {
      model: legacyConfig.model || "google/gemini-2.0-flash-exp:free",
      baseUrl: legacyConfig.baseUrl || "https://openrouter.ai/api/v1/chat/completions",
      apiKey: legacyConfig.apiKey,
      providerType: "custom",
      payloadTemplate: {
        max_tokens: 16384,
        temperature: 0.7,
        top_p: 1.0,
        stream: false
      }
    },
    "nvidia-nim": {
      model: legacyConfig.model || "nvidia/llama-3.1-nemotron-70b-instruct",
      baseUrl: legacyConfig.baseUrl || "http://localhost:8000/v1/chat/completions",
      apiKey: legacyConfig.apiKey,
      providerType: "custom",
      payloadTemplate: {
        max_tokens: 16384,
        temperature: 1.0,
        top_p: 1.0,
        stream: false
      }
    },
    "amazon-nova": {
      model: legacyConfig.model || "nova-2-lite-v1",
      baseUrl: legacyConfig.baseUrl || "https://api.nova.amazon.com/v1/chat/completions",
      apiKey: legacyConfig.apiKey || process.env.NOVA_API_KEY,
      providerType: "custom",
      payloadTemplate: {
        max_tokens: 16384,
        temperature: 1.0,
        top_p: 1.0,
        stream: false
      }
    },
    "ollama": {
      model: legacyConfig.model || "llama3.1:8b",
      baseUrl: legacyConfig.baseUrl || "http://localhost:11434",
      providerType: "ollama"
    }
  };

  const config = providerMap[legacyConfig.provider];
  if (!config) {
    throw new Error(`Unsupported legacy provider: ${legacyConfig.provider}`);
  }

  return new UnifiedAIProvider(config);
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: LLMProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.model?.trim()) {
    errors.push("Model name is required");
  }

  if (!config.baseUrl?.trim()) {
    errors.push("Base URL is required");
  }

  if (config.providerType === "custom" && !config.apiKey?.trim()) {
    errors.push("API key is required for custom providers");
  }

  try {
    new URL(config.baseUrl);
  } catch {
    errors.push("Base URL must be a valid URL");
  }

  return errors;
}
