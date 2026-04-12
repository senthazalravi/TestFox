# Features

An overview of what TestFox provides.

---

## 30+ test categories

TestFox generates tests across a wide range of categories, including:

**Functional testing** -- Smoke, sanity, regression, integration, API (REST/GraphQL), UI/E2E, form validation, CRUD operations, authentication, and authorization.

**Non-functional testing** -- Security (OWASP Top 10), performance, load testing, accessibility (WCAG), SEO, cross-browser, and responsive/viewport testing.

**Monitoring and diagnostics** -- Console error detection, network request validation, broken link checks, and resource loading verification.

All categories are generated using rules derived from your project structure. AI mode adds deeper, context-specific scenarios on top.

---

## Swagger / OpenAPI auto-detection

TestFox scans your workspace for Swagger and OpenAPI specification files. When found, it:

- Parses endpoints, request schemas, and response models.
- Generates a Postman-compatible collection with realistic mock values.
- Creates API tests covering each endpoint with valid and invalid payloads.

No manual configuration is needed -- place your spec file in the project and TestFox handles the rest.

---

## Rule-based + AI modes

**Rule-based generation** works out of the box with no external dependencies. It applies deterministic rules to your codebase to produce a comprehensive test suite.

**AI-enhanced generation** (optional) connects to OpenRouter, Ollama, or a custom API to produce additional context-aware test cases, smarter assertions, and edge-case scenarios.

You can switch between modes at any time.

---

## MCP tool integrations

TestFox supports Model Context Protocol (MCP) servers for extended tooling:

- **Playwright MCP** -- Browser automation and E2E test execution.
- **Postman MCP** -- API collection management and execution.
- **DevTools MCP** -- Chrome DevTools protocol integration.
- **Puppeteer MCP** -- Headless browser control.

MCP tools appear in the **Actions panel** in the sidebar and can be invoked alongside generated tests.

---

## Fire-and-forget execution

Run your test suite and move on. TestFox executes tests in the background without blocking your editor. Results are stored in the **Test Runs** history and can be reviewed at any time.

---

## Comprehensive reports

Each test run produces a detailed report including:

- Pass/fail status for every test case.
- Defect entries with categorized IDs (e.g., SEC-001, PERF-003).
- Screenshots and console logs for failed UI tests.
- Network request/response details for API tests.
- Execution time and performance metrics.

---

## Multi-language support

TestFox works with projects in: JavaScript/TypeScript, Python, Java, C/C++, Rust, Go, .NET, PHP, and Ruby.

It detects your stack automatically and tailors test generation to the language, framework, and tooling in use.
