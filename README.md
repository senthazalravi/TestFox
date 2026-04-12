# TestFox

<div align="center">

**Comprehensive End-to-End Testing for Every Project**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=TestFox.testfox)
[![OpenVSX](https://img.shields.io/badge/OpenVSX-Registry-green)](https://open-vsx.org/extension/TestFox/testfox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate, run, and report on hundreds of tests across 30+ categories.
Works out of the box with rule-based generation. Add an AI key for even smarter tests.

</div>

---

## How It Works

```
1. Install TestFox from the VS Code marketplace
2. Open any project  ->  TestFox auto-detects language, framework, routes, forms, APIs
3. (Optional) Add an AI key  ->  Seamless setup panel on first launch
4. Click "Generate Tests"  ->  Hundreds of tests across 30+ categories
5. Click "Run All Tests"   ->  Fire and forget - view report when ready
```

TestFox generates **comprehensive rule-based tests without AI**. When AI is configured, tests are enhanced with intelligent analysis. When a Swagger/OpenAPI spec is detected, TestFox automatically generates a full Postman collection with mock values, schema validation, and security tests.

---

## Supported Languages & Frameworks

| Language | Frameworks | Build Tools |
|----------|------------|-------------|
| **JavaScript/TypeScript** | React, Vue, Angular, Next.js, Express, NestJS, Fastify, Svelte | npm, yarn, pnpm |
| **Python** | Django, Flask, FastAPI | pip, poetry |
| **Java** | Spring, Spring Boot | Maven, Gradle |
| **C / C++** | Any | Make, CMake, Meson |
| **Rust** | Actix, Rocket, Axum | Cargo |
| **Go** | Gin, Echo, Fiber | go mod |
| **.NET** | ASP.NET Core, Blazor | dotnet |
| **PHP** | Laravel, Symfony | Composer |
| **Ruby** | Rails, Sinatra | Bundler |

---

## Test Categories (30+)

### Quick Validation
| Category | What It Tests |
|----------|---------------|
| **Smoke** | Health endpoints, route accessibility, static assets, error pages, CORS preflight |
| **Sanity** | Server response time, core navigation, database connection, session persistence |
| **Regression** | All routes still accessible, form submissions, auth flows intact |

### Functional
| Category | What It Tests |
|----------|---------------|
| **Functional** | Form validation, field constraints, double-submit prevention, reset behavior, auth flows (login, register, password reset, account lockout, remember me) |
| **API** | Happy path, missing required fields, invalid types, empty body, wrong HTTP method, schema validation, content-type validation |
| **UI** | Viewport responsiveness (desktop/tablet/mobile), interactive elements, visual layout, loading states |
| **E2E** | Full user journeys: registration, CRUD workflows, search/filter, multi-step flows |
| **Integration** | Database resilience, transaction rollback, external API timeout handling, retry logic |
| **Database** | CRUD operations, constraint validation, relationship testing, transaction handling |
| **Payment** | Stripe/PayPal/Braintree flows, card validation, 3D Secure, subscription lifecycle, fraud detection, webhook signature verification |

### Non-Functional
| Category | What It Tests |
|----------|---------------|
| **Security** | OWASP Top 10: SQL injection, XSS, CSRF, directory traversal, security headers (HSTS, CSP, X-Frame-Options), cookie attributes (HttpOnly, Secure, SameSite), sensitive data exposure, rate limiting, open redirect, CORS misconfiguration |
| **Performance** | Core Web Vitals (LCP, FID, CLS), bundle sizes, API response times (p50/p95/p99), database query performance, HTTP caching headers |
| **Load** | Concurrent users, rate limiting, throughput |
| **Stress** | Beyond capacity, retry storms |
| **Accessibility** | WCAG 2.1: keyboard navigation, color contrast (AA), form labels/ARIA, image alt text, heading hierarchy, screen reader compatibility, focus management |

### Backend (10 categories)
| Category | What It Tests |
|----------|---------------|
| **Idempotency** | Duplicate request handling with idempotency keys |
| **Webhooks** | Event ordering, signature verification, timeout/retry, dead-letter queues |
| **Concurrency** | Race conditions, last-item scenarios |
| **State Integrity** | Order state machines, event ordering enforcement |
| **Reliability** | Fault tolerance, duplicate prevention |
| **Failure Recovery** | Partial failures, self-healing |
| **API Contract** | Schema validation against spec |
| **Stability** | Retry storm protection, circuit breakers |
| **Compliance** | GDPR deletion propagation |
| **Observability** | PII leak detection in logs |

### Edge Cases
| Category | What It Tests |
|----------|---------------|
| **Negative** | Malformed JSON, oversized payloads, non-existent IDs, unicode/emoji input, null bytes |
| **Boundary** | Empty values, numeric extremes, email format edge cases, string length limits, float precision |
| **Monkey** | Random click/input fuzzing |

---

## Swagger / OpenAPI Integration

When TestFox detects a `swagger.json` or `openapi.json` file in your project, it automatically:

1. **Parses the spec** (OpenAPI 3.x and Swagger 2.0)
2. **Generates mock values** for all parameters using spec types, formats, and examples
3. **Creates a Postman collection** (`.testfox/swagger_postman_collection.json`) with:
   - Happy path requests with mock bodies
   - Missing required fields tests (400 validation)
   - Invalid type tests (wrong data types)
   - Empty body tests
   - Wrong HTTP method tests (405)
   - Unauthorized access tests (401/403)
   - Boundary value tests for numeric params
   - SQL injection tests
   - XSS tests
   - Response schema validation
4. **Generates rule-based test cases** for API, security, boundary, performance, and contract testing

Place your spec file in any of these locations:
```
swagger.json / openapi.json / openapi.yaml
api/swagger.json / docs/openapi.json
src/swagger.json / public/openapi.json
.testfox/swagger.json
```

---

## AI Setup

TestFox works fully without AI. When you want smarter test generation, configure an AI provider in the setup panel that appears on first launch.

### Providers

| Provider | Cost | Setup |
|----------|------|-------|
| **OpenRouter** | Free models available | Get key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Ollama** | Free (local) | Install from [ollama.ai](https://ollama.ai) |
| **Custom API** | Varies | Any OpenAI-compatible endpoint |

### Free Models (no billing required)

| Model | Provider | Best For |
|-------|----------|----------|
| Gemini 2.0 Flash | Google | Fast, recommended default |
| DeepSeek R1 | DeepSeek | Advanced reasoning |
| Llama 3.3 70B | Meta | Large context |
| Qwen 2.5 Coder | Alibaba | Code-specialized |
| Mistral Nemo | Mistral | Lightweight |

### Configuration

The AI setup panel appears automatically on first launch. You can also open it anytime:
- Click **AI Settings** in the sidebar Actions panel
- Or run `TestFox: Configure AI Settings` from the command palette

---

## MCP Tools (Model Context Protocol)

TestFox integrates MCP servers for advanced test automation. All available from the sidebar Actions panel:

| MCP Server | Generate | Run | What It Does |
|------------|----------|-----|--------------|
| **Playwright** | Tests from project analysis | Full browser automation | E2E, accessibility, smoke, functional tests |
| **Postman** | Collection from endpoints | Newman execution | API contract, auth, CRUD, security tests |
| **DevTools** | Performance/network tests | Chrome DevTools Protocol | LCP/FID/CLS, network monitoring, console errors |
| **Puppeteer** | Launch browser session | Chrome automation | Tab connection, custom automation |

---

## Fire and Forget

TestFox is designed to be non-intrusive:

1. **Start tests** from the Actions panel or command palette
2. **Continue working** - tests run in the background
3. **Get notified** when complete: "42/50 passed. View Report?"
4. **View the report** anytime - detailed breakdown by category with error details

All test runs are tracked in the **Test Runs** sidebar. Click any past run to see its full report.

---

## The Report

Every test run produces a comprehensive report with:

- **Pass rate ring** - Visual percentage indicator
- **Stats grid** - Total, passed, failed, skipped counts
- **Failed tests section** - Error details for every failure
- **Category breakdown** - Collapsible cards with progress bars per category
- **Individual test results** - Status, duration, error messages
- **MCP results** - Server-specific test outcomes

---

## Quick Start

### Install

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search **TestFox**
4. Click Install

### First Run

1. Click the TestFox icon in the Activity Bar
2. (Optional) Configure AI in the setup panel
3. Click **Generate Tests** in the Actions panel
4. Click **Run All Tests**
5. Click **View Report** when notified

### Commands

| Command | Description |
|---------|-------------|
| `TestFox: Analyze Project` | Detect project type, routes, forms, APIs |
| `TestFox: Generate Tests` | Generate tests across all categories |
| `TestFox: Run All Tests` | Execute all automated tests |
| `TestFox: Run Full Cycle` | Smoke > Functional > Regression pipeline |
| `TestFox: Run Test Category` | Run a specific category |
| `TestFox: View Latest Test Report` | Open comprehensive report |
| `TestFox: Configure AI Settings` | Open AI setup panel |
| `TestFox: Run Cross-Browser Tests` | Chrome, Firefox, Safari |

---

## Configuration

Configure in VS Code settings (Ctrl+,) or `settings.json`:

```json
{
  "testfox.ai.enabled": true,
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free",
  "testfox.ai.apiKey": "",
  "testfox.browserHeadless": true,
  "testfox.defaultTimeout": 30000,
  "testfox.securityTestLevel": "standard",
  "testfox.performanceThreshold": 3000,
  "testfox.reportFormat": "html",
  "testfox.storeResultsInGit": false,
  "testfox.autoAnalyze": true
}
```

### Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `testfox.ai.enabled` | `true` | Enable AI-enhanced test generation |
| `testfox.ai.provider` | `openrouter` | AI provider: openrouter, ollama, custom |
| `testfox.browserHeadless` | `true` | Run browser tests in headless mode |
| `testfox.securityTestLevel` | `standard` | Security test depth: basic, standard, comprehensive |
| `testfox.performanceThreshold` | `3000` | Max acceptable response time (ms) |
| `testfox.autoAnalyze` | `true` | Auto-detect project on workspace open |
| `testfox.storeResultsInGit` | `false` | Persist test results in .testfox/ directory |
| `testfox.automation.dailyTests` | `false` | Run tests automatically every day |

---

## ISTQB-Aligned Techniques

TestFox implements standard testing methodologies:

- **Boundary Value Analysis (BVA)** - Min/max/edge values for every input
- **Equivalence Partitioning** - Valid/invalid input classes
- **Decision Table Testing** - Combinatorial condition coverage
- **State Transition Testing** - Auth flows, order states
- **Use Case Testing** - End-to-end user journeys
- **Error Guessing** - Common failure patterns

---

## Architecture

```
TestFox Sidebar
  |-- Actions Panel       Quick actions, MCP tools, AI/App status
  |-- Test Explorer        Tests organized by category group
  |-- Test Runs            Fire-and-forget history with reports

Test Generation Pipeline
  |-- Project Detection    Language, framework, build tools
  |-- Code Analysis        Routes, forms, endpoints, auth flows, DB queries
  |-- Runtime Analysis     Live app inspection (when running)
  |-- Rule-Based Tests     Comprehensive tests without AI (default)
  |-- Enhanced Rules       Additional security, performance, a11y, boundary tests
  |-- Swagger Parser       Auto-detect and parse OpenAPI specs
  |-- AI Enhancement       Smarter tests when AI is configured
  |-- MCP Orchestration    Playwright, Postman, DevTools test generation

Test Execution
  |-- Playwright Runner    Browser automation
  |-- API Runner           REST/GraphQL testing
  |-- MCP Test Runner      MCP server execution
  |-- Full Cycle Runner    Smoke > Functional > Regression pipeline
  |-- Cross-Browser        Chrome, Firefox, Safari
```

---

## Requirements

- **VS Code** 1.85.0+
- **Node.js** 18+ (for test execution)
- **Internet** (optional, only for AI features)

---

## Contributing

Contributions welcome. Visit [github.com/senthazalravi/TestFox](https://github.com/senthazalravi/TestFox).

## Author

Developed in **Stockholm, Sweden**

- **Twitter/X**: [@senthazalravi](https://x.com/senthazalravi)
- **Email**: ravi.antone@gmail.com

## Support

- Star us on GitHub
- Write a review on the VS Code Marketplace
- Share with your team

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**TestFox** - Comprehensive end-to-end testing that works out of the box.

</div>
