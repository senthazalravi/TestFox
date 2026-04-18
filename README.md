# TestFox 🦊

<div align="center">

**AI-Powered Testing Extension for VS Code**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=TestFox.testfox)
[![OpenVSX](https://img.shields.io/badge/OpenVSX-Registry-green)](https://open-vsx.org/extension/TestFox/testfox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-7.4.0-purple)]()

> Generate and run comprehensive tests for your projects.
> Works out of the box with rule-based generation. Add AI for smarter tests.

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Auto-Detect** | Detects language, framework, routes, APIs automatically |
| **Rule-Based Tests** | Generates tests without AI using ISTQB techniques |
| **AI-Enhanced** | Optional AI (OpenRouter/Ollama) for smarter generation |
| **MCP Integration** | Playwright, Postman, Chrome DevTools, Puppeteer |
| **Swagger Support** | Parses OpenAPI specs and generates Postman collections |
| **Background Execution** | Run tests in background, get notified on completion |
| **Test Reports** | Detailed HTML reports with pass/fail breakdown |
| **Defect Tracking** | Track and manage bugs found during testing |
| **Git Integration** | Create GitHub/Jira issues from test failures |

---

## 🚀 Quick Start

1. Install from VS Code Marketplace → Search "TestFox"
2. Open any project → TestFox auto-detects the stack
3. (Optional) Configure AI in the setup panel
4. Click **Generate Tests** → Click **Run All Tests**
5. View report when complete

---

## 🧪 Test Generators

| Generator | What It Creates |
|-----------|-----------------|
| **API** | REST/GraphQL endpoint tests |
| **E2E** | End-to-end user journey tests |
| **UI** | Viewport responsiveness, interactive elements |
| **Security** | OWASP Top 10: SQL injection, XSS, CSRF, headers |
| **Performance** | Core Web Vitals, response times |
| **Database** | CRUD operations, constraints, transactions |
| **Payment** | Stripe/PayPal/Braintree flows |
| **Playwright** | Browser automation tests |
| **Swagger** | Postman collection from OpenAPI spec |
| **Backend** | Idempotency, webhooks, concurrency tests |
| **Monkey** | Random fuzzing tests |

---

## 🔌 MCP Tools

| Tool | Generate | Run | Purpose |
|------|----------|-----|---------|
| **Playwright** | ✅ | ✅ | E2E, accessibility, smoke tests |
| **Postman** | ✅ | ✅ | API contract, auth, CRUD |
| **DevTools** | ✅ | ✅ | Performance, network monitoring |
| **Puppeteer** | — | ✅ | Browser automation |

---

## 📄 Swagger / OpenAPI

Auto-detects `swagger.json` / `openapi.json` in:
- Project root
- `api/`, `docs/`, `src/`, `public/`
- `.testfox/` directory

Generates Postman collection with validation tests.

---

## ⌨️ Commands

| Command | Action |
|---------|--------|
| `TestFox: Analyze Project` | Detect project type & structure |
| `TestFox: Generate Tests` | Create test cases |
| `TestFox: Run All Tests` | Execute all tests |
| `TestFox: Run Full Cycle` | Smoke → Functional → Regression |
| `TestFox: Run Test Category` | Run specific category |
| `TestFox: View Report` | Open test report |
| `TestFox: Configure AI` | Open AI settings |
| `TestFox: Open Dashboard` | View main dashboard |
| `TestFox: Stop Application` | Stop running app |
| `TestFox: Create GitHub Issue` | Create issue from failure |

---

## ⚙️ Settings

```json
{
  "testfox.ai.enabled": true,
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free",
  "testfox.browserHeadless": true,
  "testfox.defaultTimeout": 30000,
  "testfox.securityTestLevel": "standard"
}
```

---

## 🔧 Requirements

- **VS Code** 1.85.0+
- **Node.js** 18+ (for test execution)

---

## 🤝 Support

- [GitHub](https://github.com/senthazalravi/TestFox)
- [@senthazalravi](https://x.com/senthazalravi)
- ravi.antone@gmail.com

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

*Developed in Stockholm, Sweden*

</div>
