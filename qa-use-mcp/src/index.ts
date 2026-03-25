#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types';
import { createBrowserManager } from './lib/browser/index.js';
import { createTunnelManager } from './lib/tunnel/index.js';
import { createApiClient } from './lib/api/index.js';

// Environment variables
const API_KEY = process.env.QA_USE_API_KEY || '';
const API_URL = process.env.QA_USE_API_URL || 'https://api.desplega.ai';
const APP_URL = process.env.QA_USE_APP_URL || 'https://app.desplega.ai';

// Global state
let browserManager: any = null;
let tunnelManager: any = null;
let apiClient: any = null;
let activeSessions: Map<string, any> = new Map();

const server = new Server(
  {
    name: 'qa-use-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Initialize QA Server
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('Tools list requested');
  
  return {
    tools: [
      {
        name: 'init_qa_server',
        description: 'Initialize QA server with API key and create browser instance',
        inputSchema: {
          type: 'object',
          properties: {
            apiKey: {
              type: 'string',
              description: 'Desplega AI API key (optional if set in environment)',
            }
          },
        },
      },
      {
        name: 'start_browser',
        description: 'Start a new browser session for testing',
        inputSchema: {
          type: 'object',
          properties: {
            browser: {
              type: 'string',
              enum: ['chromium', 'firefox', 'webkit'],
              description: 'Browser type to use',
              default: 'chromium',
            },
            headless: {
              type: 'boolean',
              description: 'Run browser in headless mode',
              default: false,
            },
            viewport: {
              type: 'object',
              properties: {
                width: { type: 'number', default: 1920 },
                height: { type: 'number', default: 1080 },
              },
              description: 'Browser viewport dimensions',
            },
          },
        },
      },
      {
        name: 'navigate_to_url',
        description: 'Navigate browser to a specific URL',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Browser session ID',
            },
            url: {
              type: 'string',
              description: 'URL to navigate to',
            },
          },
          required: ['sessionId', 'url'],
        },
      },
      {
        name: 'take_screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Browser session ID',
            },
            fullPage: {
              type: 'boolean',
              description: 'Take full page screenshot vs element screenshot',
              default: true,
            },
            selector: {
              type: 'string',
              description: 'CSS selector for element screenshot (optional)',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'run_accessibility_test',
        description: 'Run accessibility tests on current page',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Browser session ID',
            },
            standards: {
              type: 'array',
              items: { type: 'string' },
              description: 'Accessibility standards to test (WCAG 2.1 AA, etc.)',
              default: ['WCAG 2.1 AA'],
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'create_tunnel',
        description: 'Create a public tunnel to local server',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Local port to expose',
            },
            subdomain: {
              type: 'string',
              description: 'Custom subdomain for tunnel (optional)',
            },
          },
          required: ['port'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List all active browser sessions',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'close_session',
        description: 'Close a browser session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Browser session ID to close',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'analyze_page_performance',
        description: 'Analyze page performance metrics',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'Browser session ID',
            },
            metrics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Performance metrics to collect',
              default: ['FCP', 'LCP', 'CLS', 'FID', 'TTI'],
            },
          },
          required: ['sessionId'],
        },
      },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    console.error(`Tool call: ${name}`, args);

    switch (name) {
      case 'init_qa_server':
        return await initQAServer(args);
      
      case 'start_browser':
        return await startBrowser(args);
      
      case 'navigate_to_url':
        return await navigateToUrl(args);
      
      case 'take_screenshot':
        return await takeScreenshot(args);
      
      case 'run_accessibility_test':
        return await runAccessibilityTest(args);
      
      case 'create_tunnel':
        return await createTunnel(args);
      
      case 'list_sessions':
        return await listSessions(args);
      
      case 'close_session':
        return await closeSession(args);
      
      case 'analyze_page_performance':
        return await analyzePagePerformance(args);
      
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    console.error(`Error in ${name}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

// Tool implementations
async function initQAServer(args: { apiKey?: string }) {
  const apiKey = args.apiKey || API_KEY;
  
  if (!apiKey) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'API key is required. Set QA_USE_API_KEY environment variable or provide apiKey parameter.'
    );
  }

  // Initialize managers
  apiClient = createApiClient(apiKey, API_URL);
  browserManager = createBrowserManager();
  tunnelManager = createTunnelManager();

  console.error('QA Server initialized with API key');

  return {
    content: [
      {
        type: 'text',
        text: `✅ QA Server initialized successfully\nAPI URL: ${API_URL}\nApp URL: ${APP_URL}`,
      },
    ],
  };
}

async function startBrowser(args: {
  browser?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
}) {
  if (!browserManager) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'QA Server not initialized. Call init_qa_server first.'
    );
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const browser = await browserManager.startBrowser({
    type: args.browser || 'chromium',
    headless: args.headless || false,
    viewport: args.viewport || { width: 1920, height: 1080 },
  });

  activeSessions.set(sessionId, {
    browser,
    startTime: new Date(),
    config: args,
  });

  console.error(`Browser started: ${sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Browser session started\nSession ID: ${sessionId}\nBrowser: ${args.browser || 'chromium'}\nHeadless: ${args.headless || false}`,
      },
    ],
  };
}

async function navigateToUrl(args: { sessionId: string; url: string }) {
  const session = activeSessions.get(args.sessionId);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Session ${args.sessionId} not found`
    );
  }

  await session.browser.navigateTo(args.url);
  console.error(`Navigated to ${args.url} in session ${args.sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Navigated to ${args.url}`,
      },
    ],
  };
}

async function takeScreenshot(args: {
  sessionId: string;
  fullPage?: boolean;
  selector?: string;
}) {
  const session = activeSessions.get(args.sessionId);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Session ${args.sessionId} not found`
    );
  }

  const screenshot = await session.browser.takeScreenshot({
    fullPage: args.fullPage !== false,
    selector: args.selector,
  });

  // Convert to base64 for response
  const base64 = screenshot.toString('base64');

  console.error(`Screenshot taken in session ${args.sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Screenshot captured\nSession: ${args.sessionId}\nFull page: ${args.fullPage !== false}\nSelector: ${args.selector || 'none'}`,
      },
      {
        type: 'image',
        data: base64,
        mimeType: 'image/png',
      },
    ],
  };
}

async function runAccessibilityTest(args: {
  sessionId: string;
  standards?: string[];
}) {
  const session = activeSessions.get(args.sessionId);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Session ${args.sessionId} not found`
    );
  }

  const results = await session.browser.runAccessibilityTest({
    standards: args.standards || ['WCAG 2.1 AA'],
  });

  console.error(`Accessibility test completed for session ${args.sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Accessibility test completed\nSession: ${args.sessionId}\nStandards: ${(args.standards || ['WCAG 2.1 AA']).join(', ')}\nIssues found: ${results.issues.length}`,
      },
      {
        type: 'json',
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

async function createTunnel(args: { port: number; subdomain?: string }) {
  if (!tunnelManager) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Tunnel manager not initialized. Call init_qa_server first.'
    );
  }

  const tunnel = await tunnelManager.createTunnel({
    port: args.port,
    subdomain: args.subdomain,
  });

  console.error(`Tunnel created: ${tunnel.url}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Tunnel created\nLocal port: ${args.port}\nPublic URL: ${tunnel.url}\nSubdomain: ${args.subdomain || 'auto-generated'}`,
      },
    ],
  };
}

async function listSessions(args: any) {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    startTime: session.startTime,
    browser: session.config?.browser || 'chromium',
    headless: session.config?.headless || false,
    duration: Date.now() - session.startTime.getTime(),
  }));

  console.error(`Listed ${sessions.length} active sessions`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Active sessions: ${sessions.length}`,
      },
      {
        type: 'json',
        text: JSON.stringify(sessions, null, 2),
      },
    ],
  };
}

async function closeSession(args: { sessionId: string }) {
  const session = activeSessions.get(args.sessionId);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Session ${args.sessionId} not found`
    );
  }

  await session.browser.close();
  activeSessions.delete(args.sessionId);

  console.error(`Session closed: ${args.sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Session ${args.sessionId} closed`,
      },
    ],
  };
}

async function analyzePagePerformance(args: {
  sessionId: string;
  metrics?: string[];
}) {
  const session = activeSessions.get(args.sessionId);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Session ${args.sessionId} not found`
    );
  }

  const results = await session.browser.analyzePerformance({
    metrics: args.metrics || ['FCP', 'LCP', 'CLS', 'FID', 'TTI'],
  });

  console.error(`Performance analysis completed for session ${args.sessionId}`);

  return {
    content: [
      {
        type: 'text',
        text: `✅ Performance analysis completed\nSession: ${args.sessionId}\nMetrics: ${(args.metrics || ['FCP', 'LCP', 'CLS', 'FID', 'TTI']).join(', ')}`,
      },
      {
        type: 'json',
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

// Start server
async function main() {
  console.error('Starting QA Use MCP Server...');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('QA Use MCP Server started successfully');
}

// Handle process termination
process.on('SIGINT', async () => {
  console.error('Shutting down QA Use MCP Server...');
  
  // Close all browser sessions
  for (const [sessionId, session] of activeSessions) {
    await session.browser.close();
  }
  activeSessions.clear();
  
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}
