# OpenRouter Integration for TestFox

This document describes how to use the OpenRouter AI integration for automatic test case generation and MCP testing.

## Configuration

The OpenRouter API key is automatically loaded from the `.env` file in your workspace root:

```env
OPENROUTER_API_KEY=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
OPENROUTER_HTTP_REFERER=https://testfox.dev
OPENROUTER_SITE_NAME=TestFox
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
```

**Note**: The `.env` file is already in `.gitignore` and will not be committed to version control.

## Usage Examples

### Basic Test Generation

```typescript
import { getOpenRouterService } from './src/ai/openRouterService';

const openRouter = getOpenRouterService();

// Generate test cases for a component
const testCases = await openRouter.generateTestCases({
    name: 'UserLoginForm',
    type: 'form',
    description: 'Login form with email and password fields',
    framework: 'React'
});

console.log(testCases);
```

### Generate Test Code (Playwright)

```typescript
const testCode = await openRouter.generateTestCode(
    'Test user login flow: navigate to /login, enter valid credentials, click submit, verify redirect to dashboard',
    'playwright'
);

// Save to file
fs.writeFileSync('tests/login.spec.ts', testCode);
```

### Direct API Usage with Fetch

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://testfox.dev",
        "X-OpenRouter-Title": "TestFox",
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        "model": "openrouter/auto",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Generate test cases for a payment form with credit card input"
                    }
                ]
            }
        ]
    })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Code Analysis for Testability

```typescript
const codeAnalysis = await openRouter.analyzeCodeForTestability(
    `
    function processPayment(amount, cardNumber) {
        if (amount > 0) {
            return api.charge(cardNumber, amount);
        }
        return false;
    }
    `,
    'javascript'
);

console.log(codeAnalysis);
```

### Streaming Responses

```typescript
const stream = openRouter.streamChatCompletion([
    { role: 'user', content: 'Generate 10 security test payloads for SQL injection testing' }
]);

for await (const chunk of stream) {
    process.stdout.write(chunk);
}
```

### Test Connection

```typescript
const connectionTest = await openRouter.testConnection();
if (connectionTest.success) {
    console.log('✅ OpenRouter connection successful');
} else {
    console.log('❌ Connection failed:', connectionTest.error);
}
```

## Available Models

### Free Models (Recommended)

- `google/gemini-2.0-flash-exp:free` - Fast, efficient for most testing tasks
- `deepseek/deepseek-r1:free` - Advanced reasoning capabilities
- `meta-llama/llama-3.3-70b-instruct:free` - Strong performance on code tasks
- `qwen/qwen-2.5-coder-32b-instruct:free` - Code-specialized model

### Premium Models

- `anthropic/claude-3.5-sonnet` - Best for complex analysis
- `openai/gpt-4o` - Well-rounded capabilities
- `x-ai/grok-2-1212` - Real-time knowledge

## MCP Integration

The OpenRouter service can be used with MCP servers for AI-powered testing:

```typescript
// Example: Using OpenRouter with QA Use MCP Server
const mcpServer = new MCPConnection('qa-use-mcp');
await mcpServer.connect();

// Generate AI-powered test scenarios
const testScenarios = await openRouter.chatCompletion([
    {
        role: 'system',
        content: 'Generate browser automation test scenarios'
    },
    {
        role: 'user',
        content: 'Create test scenarios for an e-commerce checkout flow'
    }
]);

// Execute via MCP
await mcpServer.execute('browser-automation', { scenarios: testScenarios });
```

## Error Handling

```typescript
try {
    const result = await openRouter.chatCompletion(messages);
} catch (error) {
    if (error.message.includes('API key not configured')) {
        // Prompt user to configure API key
        vscode.window.showErrorMessage('Please configure OPENROUTER_API_KEY in .env file');
    } else if (error.message.includes('rate limit')) {
        // Handle rate limiting
        console.log('Rate limited, retrying with backoff...');
    } else {
        console.error('OpenRouter error:', error);
    }
}
```

## Best Practices

1. **Always use the service singleton**: Use `getOpenRouterService()` to get the instance
2. **Check configuration before use**: Call `openRouter.isConfigured()` before making requests
3. **Handle errors gracefully**: Wrap API calls in try-catch blocks
4. **Use streaming for long responses**: For generating large test suites, use `streamChatCompletion()`
5. **Cache results when appropriate**: Store generated test cases to avoid repeated API calls

## Testing the Integration

Run the following to test your OpenRouter setup:

```typescript
import { getOpenRouterService } from './src/ai/openRouterService';

async function testOpenRouter() {
    const service = getOpenRouterService();
    
    // Test connection
    const test = await service.testConnection();
    console.log('Connection test:', test);
    
    // Test simple generation
    if (test.success) {
        const response = await service.chatCompletion([
            { role: 'user', content: 'Say "OpenRouter is working!"' }
        ]);
        console.log('Response:', response);
    }
}

testOpenRouter();
```
