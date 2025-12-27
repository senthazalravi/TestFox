# TestFox 🦊

**The Final Quality Gate in Your SDLC**

TestFox is a comprehensive VS Code extension that serves as the end-of-lifecycle testing solution for your applications. It automatically detects your project type, generates tests across multiple categories following ISTQB standards, and produces detailed interactive test reports with AI-powered insights.

## Features

### 🔍 Automatic Project Detection
- Detects project type (Node.js, Python, Java, Go, .NET, PHP, Ruby)
- Identifies frameworks (React, Vue, Angular, Express, Django, Spring, etc.)
- Reads `package.json`, `requirements.txt`, `pom.xml`, and other config files
- Auto-configures run commands

### 🧪 Comprehensive Test Categories (18 Types)

TestFox covers the complete testing spectrum aligned with industry standards:

#### Quick Validation
| Category | Description | Automation |
|----------|-------------|------------|
| **Smoke Tests** | Critical path verification - build acceptance | Fully Automated |
| **Sanity Tests** | Quick focused checks after changes | Fully Automated |
| **Regression Tests** | Verify existing features still work | Fully Automated |

#### Functional Testing
| Category | Description | Automation |
|----------|-------------|------------|
| **Functional Tests** | Feature behavior per requirements | Automated + Manual |
| **API Tests** | REST/GraphQL endpoint validation | Fully Automated |
| **UI/E2E Tests** | User interface and end-to-end journeys | Fully Automated |
| **Integration Tests** | Component/service interaction testing | Fully Automated |
| **Database Tests** | Data integrity and CRUD operations | Fully Automated |

#### Non-Functional Testing
| Category | Description | Automation |
|----------|-------------|------------|
| **Security Tests** | OWASP Top 10, SQL Injection, XSS, CSRF | Fully Automated |
| **Performance Tests** | Response times, Core Web Vitals | Fully Automated |
| **Load Tests** | Concurrent users, throughput testing | Fully Automated |
| **Stress Tests** | Beyond normal capacity limits | Fully Automated |
| **Accessibility Tests** | WCAG 2.1, keyboard nav, screen readers | Automated + Manual |

#### Edge Cases & Special Testing
| Category | Description | Automation |
|----------|-------------|------------|
| **Negative Tests** | Invalid inputs, error paths, failures | Fully Automated |
| **Boundary Tests** | BVA - min/max values, edge conditions | Fully Automated |
| **Monkey Tests** | Random chaotic input testing | Fully Automated |

#### Manual & Exploratory Testing
| Category | Description | Automation |
|----------|-------------|------------|
| **Exploratory Tests** | Unscripted creative testing sessions | Manual |
| **Usability Tests** | UX evaluation, user satisfaction | Manual |
| **Acceptance Tests** | User acceptance testing (UAT) | Manual |
| **Compatibility Tests** | Cross-browser, device, OS testing | Partial |

#### Account Management Testing
| Category | Description | Automation |
|----------|-------------|------------|
| **Account Creation** | User registration, validation, duplicate prevention | Fully Automated |
| **Account Deletion** | Self/admin deletion, confirmation requirements | Fully Automated |
| **Account Updates** | Profile changes, password updates | Fully Automated |
| **Account Security** | Session management, inactive handling | Fully Automated |

### 🛡️ Security Testing (OWASP/WASP)
- SQL Injection detection
- Cross-Site Scripting (XSS) testing
- CSRF protection verification
- Authentication bypass attempts
- Security headers validation
- Sensitive data exposure checks
- Session management testing
- Broken access control testing

### 📊 ISTQB-Aligned Testing Techniques
- Boundary Value Analysis (BVA)
- Equivalence Partitioning
- Decision Table Testing
- State Transition Testing
- Use Case Testing
- Error Guessing
- Exploratory Testing

### 🤖 Smart Application Testing
- **Automatic Application Startup**: Launches your app using detected run commands
- **Intelligent Browser Automation**: Simulates real user interactions
- **Test Account Creation**: Automatically creates test accounts on-the-fly for comprehensive testing
- **Account Lifecycle Management**: Creates → Uses → Tests → Cleans up test accounts automatically
- **Credential Discovery**: Finds and uses existing test credentials
- **Page Exploration**: Automatically discovers and tests all application pages
- **Form Testing**: Validates all forms and user inputs
- **API Integration Testing**: Tests frontend-backend communication
- **Account Security Testing**: Session management, password policies, access controls

### 🤖 AI-Powered Features
- **Smart Test Generation**: AI suggests comprehensive test cases
- **Report Summaries**: Executive summaries with AI insights
- **Risk Assessment**: Automatic release readiness evaluation
- **Recommendations**: Prioritized action items from AI analysis
- **Multiple AI Providers**: OpenRouter (Grok, Claude, GPT, Llama), OpenAI, Anthropic

### 📝 Manual Test Support
- Track tests that cannot be automated
- Save and load manual test results
- Mark tests as Pass/Fail/Skip with notes
- Evidence attachment support

### 📈 Interactive Web Reports
- Beautiful dark-themed dashboard
- Real-time test execution progress
- Category-wise breakdown with charts
- Security findings with severity levels
- Performance metrics visualization
- AI-generated recommendations
- Export to HTML for sharing
- Print-friendly view

## SDLC Integration

TestFox is designed to be the **final quality gate** before release:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Software Development Lifecycle                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   📋 Requirements    Development    Unit Tests    Code Review           │
│        │                │              │              │                 │
│        ▼                ▼              ▼              ▼                 │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                                                                 │   │
│   │                    🦊 TestFox Quality Gate                      │   │
│   │                                                                 │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │  Smoke → Functional → Security → Performance → UAT     │   │   │
│   │   └─────────────────────────────────────────────────────────┘   │   │
│   │                                                                 │   │
│   │   ✓ Automated Testing    ✓ Manual Testing    ✓ AI Analysis    │   │
│   │   ✓ Security Scanning    ✓ Performance Check ✓ Accessibility  │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│                          🚀 Release                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Where TestFox Fits

| Stage | Tool/Process | Focus |
|-------|--------------|-------|
| Development | IDE, Linters | Code quality |
| Unit Testing | Jest, PyTest, JUnit | Function-level testing |
| Code Review | GitHub, GitLab | Human review |
| **TestFox** | **This Extension** | **System-level QA, Security, Performance** |
| Release | CI/CD Pipeline | Deployment |

TestFox is **not** a unit testing framework - it's the comprehensive system testing phase that validates your entire application before release.

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "TestFox"
4. Click Install
5. **Welcome Screen**: TestFox will show an interactive welcome guide to help you get started

### Dependencies
Playwright browsers are automatically installed on first use. If needed, you can install manually:
```bash
npx playwright install chromium
```

## Quick Start

1. **Open your project** in VS Code
2. **Click the TestFox icon** (🦊) in the Activity Bar
3. **Analyze Project**: Detects your project type automatically
4. **Generate Tests**: Creates comprehensive test cases
5. **Run Tests**: Executes automated tests
6. **View Report**: Interactive web report with AI insights

## Commands

| Command | Description |
|---------|-------------|
| `TestFox: Analyze Project` | Scan and detect project type |
| `TestFox: Generate Tests` | Generate tests for all categories |
| `TestFox: Run All Tests` | Execute all automated tests |
| `TestFox: Run Test Category` | Run tests for a specific category |
| `TestFox: Generate Web Report` | Open interactive report viewer |
| `TestFox: Configure AI Settings` | Set up AI provider and API key |
| `TestFox: Export Report` | Export report to HTML file |
| `TestFox: Mark Manual Test Result` | Record manual test result |

## Configuration

Configure TestFox in VS Code settings:

```json
{
  "testfox.autoDetectProject": true,
  "testfox.autoAnalyze": true,
  "testfox.defaultTimeout": 30000,
  "testfox.browserHeadless": true,
  "testfox.reportFormat": "html",
  "testfox.securityTestLevel": "standard",
  "testfox.performanceThreshold": 3000,
  "testfox.loadTestConcurrency": 10,
  "testfox.ai.enabled": true,
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "x-ai/grok-beta"
}
```

### AI Configuration

1. **Get an API Key**: Visit [OpenRouter](https://openrouter.ai/keys) (free tier available)
2. **Configure in TestFox**: 
   - Run command: `TestFox: Configure AI Settings`
   - Or set `testfox.ai.apiKey` in settings

Available models include:
- **Grok Beta** (x-ai/grok-beta) - Fast, capable model Enjoy as long as Mr Musk gives it for free.
- **Claude 3.5 Sonnet** - Best for complex analysis
- **GPT-4o Mini** - Fast and affordable
- **Llama 3.1 8B** (FREE) - Open source option
- **Gemma 2 9B** (FREE) - Google's efficient model
- **Amazon / Qwen / Deepseek / GLP** (FREE) - I will plan this soon

## Supported Project Types

| Type | Frameworks |
|------|------------|
| Node.js | React, Vue, Angular, Next.js, Express, NestJS, Fastify |
| Python | Django, Flask, FastAPI |
| Java | Spring, Spring Boot |
| Go | Gin, Echo, Fiber |
| .NET | ASP.NET Core |
| PHP | Laravel, Symfony |
| Ruby | Rails, Sinatra |

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18+ (for extension development)
- Internet connection (for AI features)
- If you already have an API Key use it or else get it from OpenRouter. Upto 239 Models and 31 of them are free. So just by using a OpenRouter Key you will be able to access all this.

## Author

Developed by [@senthazalravi](https://x.com/senthazalravi),NithiyanandamS

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**TestFox** - *The Final Quality Gate* 🦊
