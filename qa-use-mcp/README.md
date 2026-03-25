# QA Use MCP Server

Quality assurance testing tools for Model Context Protocol (MCP) - Comprehensive browser automation and testing capabilities.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/testfox/qa-use-mcp
cd qa-use-mcp

# Install dependencies
bun install

# Build the project
bun build

# Start development server
bun dev
```

## 📋 Prerequisites

- **Node.js 18+** - Required for runtime
- **bun** - Package manager and runtime (recommended)
- **Git** - For version control

## 🛠️ Available Tools

### **Core MCP Tools**

| Tool | Description | Parameters |
|------|-------------|------------|
| `init_qa_server` | Initialize QA server with API key | `apiKey` (optional) |
| `start_browser` | Start new browser session | `browser`, `headless`, `viewport` |
| `navigate_to_url` | Navigate to specific URL | `sessionId`, `url` |
| `take_screenshot` | Capture page screenshots | `sessionId`, `fullPage`, `selector` |
| `run_accessibility_test` | Run accessibility tests | `sessionId`, `standards` |
| `create_tunnel` | Create public tunnel | `port`, `subdomain` |
| `list_sessions` | List active browser sessions | - |
| `close_session` | Close browser session | `sessionId` |
| `analyze_page_performance` | Analyze page performance | `sessionId`, `metrics` |

## 🔧 Environment Setup

### **Required Environment Variables**

```bash
# API Configuration
export QA_USE_API_KEY="your-desplega-api-key-here"
export QA_USE_API_URL="https://api.desplega.ai"
export QA_USE_APP_URL="https://app.desplega.ai"

# Optional: Override defaults for development
export QA_USE_API_URL="http://localhost:3000"
export QA_USE_APP_URL="http://localhost:3001"
```

### **.env File Example**

```bash
# .env
QA_USE_API_KEY=your-desplega-ai-api-key-here
QA_USE_API_URL=https://api.desplega.ai
QA_USE_APP_URL=https://app.desplega.ai
```

## 🧪 Testing

### **Run Test Scripts**

```bash
# Test tools list
./scripts/test-tools-list.sh

# Test server initialization
./scripts/test-init.sh

# Test session management
./scripts/test-list-sessions.sh

# Test session creation
./scripts/test-start-session.sh
```

### **Manual Testing with JSON-RPC**

```bash
# Test tools list
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/src/index.js

# Initialize server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"init_qa_server","arguments":{"apiKey":"your-api-key"}}}' | node dist/src/index.js
```

## 🔗 Integration with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qa-use-dev": {
      "command": "node",
      "args": ["/absolute/path/to/qa-use-mcp/dist/src/index.js"],
      "env": {
        "QA_USE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Important**: Use absolute paths and ensure the project is built first!

## 📁 Project Structure

```
qa-use-mcp/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   └── lib/
│       ├── browser/          # Browser automation (Playwright)
│       ├── tunnel/           # Public tunneling (localtunnel)
│       └── api/              # API client (axios)
├── scripts/                  # Test and utility scripts
├── dist/                     # Built JavaScript output
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## 🎯 Features

### **Browser Management**
- **Multi-browser Support**: Chromium, Firefox, WebKit
- **Session Management**: Multiple concurrent browser sessions
- **Viewport Control**: Custom screen resolutions
- **Headless Mode**: Option for headless operation

### **Testing Capabilities**
- **Screenshot Capture**: Full page or element-specific screenshots
- **Accessibility Testing**: WCAG 2.1 AA compliance checks
- **Performance Analysis**: Core Web Vitals metrics (FCP, LCP, CLS, FID, TTI)
- **Navigation Control**: Programmatic URL navigation

### **Tunneling**
- **Public Access**: Expose local ports via secure tunnels
- **Custom Subdomains**: Optional subdomain configuration
- **Automatic Cleanup**: Tunnel management and cleanup

### **API Integration**
- **Desplega AI Platform**: Submit test results and get history
- **Authentication**: Bearer token authentication
- **Error Handling**: Comprehensive error reporting and recovery

## 🔧 Development

### **Available Scripts**

```bash
bun dev              # Start with hot reload (tsx)
bun build             # Build TypeScript to JavaScript
bun start             # Build and run production version
bun lint              # Run ESLint
bun lint:fix          # Fix linting issues
bun typecheck         # Type check without building
bun format            # Format code with Prettier
bun test              # Run lint and typecheck
```

### **Code Quality**

- **TypeScript**: Type safety and IDE support
- **ESLint**: Code linting and style enforcement
- **Prettier**: Consistent code formatting

Run before committing:
```bash
bun lint:fix && bun format && bun typecheck
```

## 🌐 Deployment

### **Automated Release**

```bash
# Interactive release (prompts for version)
bun release

# Or specify version
bun release 1.0.1

# Semantic versioning
bun release patch    # 1.0.0 → 1.0.1
bun release minor    # 1.0.0 → 1.1.0
bun release major    # 1.0.0 → 2.0.0
```

### **Manual Publishing**

```bash
npm run build
npm publish --access public
```

## 📚 Documentation

- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Playwright Docs**: [playwright.dev](https://playwright.dev)
- **Desplega AI**: [desplega.ai](https://desplega.ai)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the QA community** 🦊
