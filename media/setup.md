# Setup

Get TestFox running in a few minutes.

---

## Step 1: Install the extension

Install **TestFox** from the VS Code Marketplace, then reload the window if prompted.

## Step 2: First launch -- AI configuration (optional)

When you first activate TestFox, the **AI Setup panel** appears automatically. You have two choices:

- **Skip it** -- TestFox works fully with rule-based test generation. No API key needed.
- **Configure an AI provider** -- Connect to OpenRouter, Ollama (local), or a custom API endpoint for AI-enhanced test generation.

To configure AI later, open the command palette and run `TestFox: Configure AI`.

### Supported AI providers

| Provider | Notes |
|----------|-------|
| **OpenRouter** | Cloud-based. Free and premium models available. |
| **Ollama** | Local models. No data leaves your machine. |
| **Custom API** | Any OpenAI-compatible endpoint. |

## Step 3: Analyze your project

Open the TestFox sidebar and click **Analyze Project**. TestFox will:

- Detect your language and framework (JS/TS, Python, Java, C/C++, Rust, Go, .NET, PHP, Ruby).
- Discover routes, forms, and API endpoints.
- Locate and parse Swagger/OpenAPI spec files, if present.
- Read dependency manifests (package.json, requirements.txt, pom.xml, etc.).

## Step 4: Generate tests

Click **Generate Tests** in the sidebar. TestFox creates tests across 30+ categories using rule-based generation. If AI is enabled, it augments these with context-aware scenarios.

## Step 5: Run and review

Click **Run** to execute the generated tests. Results appear in the **Test Runs** section of the sidebar and in the detailed report view.

---

You are ready to go. Continue to the features overview.
