# TestFox 🦊

<div align="center">

**AI-Powered Comprehensive Testing for Every Programming Language**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=TestFox.testfox)
[![OpenVSX](https://img.shields.io/badge/OpenVSX-Registry-green)](https://open-vsx.org/extension/TestFox/testfox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*The Final Quality Gate in Your Software Development Lifecycle*

</div>

---

## 🌟 What is TestFox?

TestFox is a **comprehensive VS Code extension** that automatically generates and executes tests across **18+ test categories** for applications written in **any programming language**. It combines rule-based test generation with **AI-powered intelligence** to ensure your code is production-ready.

### ✨ Key Highlights

- 🌍 **Multi-Language Support**: JavaScript, TypeScript, Python, Java, C, C++, Rust, Go, .NET, PHP, Ruby
- 🤖 **AI-Powered**: Use **FREE or PAID** AI models from 15+ providers
- 🧪 **18+ Test Categories**: Smoke, Functional, Security, Performance, Accessibility, and more
- 📊 **Interactive Reports**: Beautiful web-based dashboard with real-time results
- 🔒 **Security Testing**: OWASP Top 10 vulnerability detection
- ♿ **Accessibility**: WCAG 2.1 compliance checking

---

## 🚀 Supported Languages & Frameworks

TestFox automatically detects your project type and generates appropriate tests:

| Language | Frameworks | Build Tools |
|----------|------------|-------------|
| **JavaScript/TypeScript** | React, Vue, Angular, Next.js, Express, NestJS, Fastify, Svelte | npm, yarn, pnpm |
| **Python** | Django, Flask, FastAPI | pip, poetry |
| **Java** | Spring, Spring Boot | Maven, Gradle |
| **C** | Any | Make, CMake |
| **C++** | Any | Make, CMake, Meson |
| **Rust** | Actix, Rocket, Axum | Cargo |
| **Go** | Gin, Echo, Fiber | go mod |
| **.NET** | ASP.NET Core, Blazor | dotnet |
| **PHP** | Laravel, Symfony | Composer |
| **Ruby** | Rails, Sinatra | Bundler |
| **Kotlin** | Spring, Ktor | Gradle |

---

## AI Providers & Models - Comprehensive Support

TestFox integrates with **8 AI providers**, giving you access to **300+ AI models** from major providers. Choose **FREE models** or paid options based on your needs.

### Quick Setup

| Provider | Setup Time | Authentication | Default URL |
|----------|------------|-------------|-------------|
| **OpenRouter** | 2 minutes | API Key | https://openrouter.ai/api/v1 |
| **Google Gemini** | 1 minute | API Key | https://generativelanguage.googleapis.com |
| **DeepSeek** | 1 minute | API Key | https://api.deepseek.com |
| **Ollama** | 5 minutes | Local | http://localhost:11434 |
| **LM Studio** | 5 minutes | Local | http://localhost:1234 |
| **Nvidia NIM** | 5 minutes | API Key | http://localhost:8000 |
| **Amazon Nova** | 2 minutes | API Key / NOVA_API_KEY | https://api.nova.amazon.com/v1 |
| **BYO API** | 1 minute | API Key | Custom |

### Free AI Models (No Credit Card Required!)

#### OpenRouter Models (239+ Available)
| Model | Provider | Best For |
|-------|----------|----------|
| **Gemini 2.0 Flash** | Google | Recommended - Fast & powerful |
| **DeepSeek R1** | DeepSeek | Advanced reasoning |
| **Llama 3.3 70B** | Meta | Large context, open source |
| **Qwen 2.5 72B** | Alibaba | Excellent for code |
| **Gemma 2 9B** | Google | Lightweight & efficient |
| **Mistral 7B** | Mistral AI | Fast responses |
| **Phi-3 Mini** | Microsoft | Compact but capable |

#### Direct Provider Models
| Model | Provider | Best For |
|-------|----------|----------|
| **Gemini 2.0 Flash** | Google | Recommended - Fast & powerful |
| **Nova 2 Lite** | Amazon | Fast and efficient from AWS |

#### Local Models (Self-Hosted)
| Model | Provider | Best For |
|-------|----------|----------|
| **Any Local Model** | Ollama | Privacy & offline use |
| **Any Local Model** | LM Studio | Custom model hosting |
| **Nvidia Models** | Nvidia NIM | GPU-optimized inference |

### Premium AI Models

| Model | Provider | Best For |
|-------|----------|----------|
| **GPT-4o** | OpenAI | Best overall quality |
| **Claude 3.5 Sonnet** | Anthropic | Complex analysis |
| **Grok Beta** | xAI | Fast & versatile |
| **Gemini Pro** | Google | Production workloads |
| **Command R+** | Cohere | Enterprise features |
| **DeepSeek Pro** | DeepSeek | Advanced capabilities |

### Authentication Methods

#### API Key Authentication
- **OpenRouter**: Get free key at [OpenRouter.ai/keys](https://openrouter.ai/keys)
- **Google Gemini**: Get key at [Google AI Studio](https://aistudio.google.com/app/apikey)
- **DeepSeek**: Get key at [DeepSeek Platform](https://platform.deepseek.com/)
- **Amazon Nova**: Get key at [AWS Console](https://console.aws.amazon.com/bedrock) OR use `NOVA_API_KEY` environment variable
- **Nvidia NIM**: Get key from your Nvidia NIM deployment
- **BYO API**: Use your custom OpenAI-compatible endpoint

#### Local Authentication
- **Ollama**: No authentication required (local)
- **LM Studio**: No authentication required (local)

### Environment Variable Support

| Variable | Provider | Usage |
|-----------|----------|-------|
| `NOVA_API_KEY` | Amazon Nova | Automatically used if API key not configured |
| `OPENAI_API_KEY` | BYO API | For custom OpenAI-compatible endpoints |
| `OLLAMA_HOST` | Ollama | Custom Ollama server URL |

### Getting Started with AI

1. **Choose Your Provider**: Select from 8 supported providers in TestFox settings
2. **Free Models Available**: OpenRouter, Google Gemini, DeepSeek offer free tiers
3. **Local Options**: Ollama, LM Studio for offline privacy
4. **Enterprise Options**: Amazon Nova, Nvidia NIM for corporate environments
5. **Configure in TestFox**: Click "AI Config" in Test Control Center
6. **Select Model**: Choose from 300+ available models
7. **Start Generating**: Begin AI-powered test creation immediately!

### Provider Recommendations

| Use Case | Recommended Provider | Reason |
|------------|-------------------|--------|
| **Beginners** | OpenRouter | 239+ models, free tier available |
| **Enterprise** | Amazon Nova | AWS integration, compliance, reliability |
| **Privacy-Focused** | Ollama | Local processing, no data sharing |
| **High Performance** | Nvidia NIM | GPU optimization, speed |
| **Custom Integration** | BYO API | Bring your own endpoint |
| **Google Users** | Google Gemini | Native Google integration |
| **Budget Conscious** | DeepSeek | Excellent free tier, powerful models |

---

## Test Categories (18 Types)

TestFox covers the **complete testing spectrum** aligned with **ISTQB standards**:

### 🚦 Quick Validation
| Category | Description | Status |
|----------|-------------|--------|
| **Smoke Tests** | Critical path verification | ✅ Automated |
| **Sanity Tests** | Quick focused checks | ✅ Automated |
| **Regression Tests** | Existing features still work | ✅ Automated |

### ⚙️ Functional Testing
| Category | Description | Status |
|----------|-------------|--------|
| **Functional Tests** | Feature behavior validation | ✅ Automated |
| **API Tests** | REST/GraphQL endpoints | ✅ Automated |
| **UI/E2E Tests** | User interface journeys | ✅ Automated |
| **Integration Tests** | Component interactions | ✅ Automated |
| **Database Tests** | Data integrity & CRUD | ✅ Automated |

### 🛡️ Non-Functional Testing
| Category | Description | Status |
|----------|-------------|--------|
| **Security Tests** | OWASP Top 10, XSS, SQLi | ✅ Automated |
| **Performance Tests** | Response times, metrics | ✅ Automated |
| **Load Tests** | Concurrent users | ✅ Automated |
| **Accessibility Tests** | WCAG 2.1 compliance | ✅ Automated |

### 🎯 Edge Cases & Boundaries
| Category | Description | Status |
|----------|-------------|--------|
| **Negative Tests** | Invalid inputs, errors | ✅ Automated |
| **Boundary Tests** | Min/max values | ✅ Automated |
| **Edge Case Tests** | Unusual scenarios | ✅ Automated |

### 👤 User Account Testing
| Category | Description | Status |
|----------|-------------|--------|
| **Account Creation** | Registration flows | ✅ Automated |
| **Account Security** | Session management | ✅ Automated |
| **Account Lifecycle** | Full CRUD operations | ✅ Automated |

---

## 🛡️ Security Testing (OWASP Top 10)

TestFox performs comprehensive security analysis:

- ✅ **SQL Injection** - Detects database vulnerabilities
- ✅ **Cross-Site Scripting (XSS)** - Input/output sanitization
- ✅ **CSRF Protection** - Token verification
- ✅ **Authentication Bypass** - Login security
- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options
- ✅ **Sensitive Data Exposure** - API key leaks, passwords
- ✅ **Session Management** - Cookie security
- ✅ **Broken Access Control** - Authorization checks

---

## 📊 Interactive Reports Dashboard

Generate beautiful, interactive web reports with:

- 📈 **Real-time Progress** - Live test execution updates
- 📊 **Category Breakdown** - Pie charts and statistics
- 🔴 **Security Findings** - Severity levels and recommendations
- ⚡ **Performance Metrics** - Response times visualization
- 🤖 **AI Insights** - Intelligent recommendations
- 📄 **Export Options** - HTML, PDF-ready printing

---

## 🔧 Quick Start

### Installation

1. **Open VS Code**
2. **Go to Extensions** (Ctrl+Shift+X)
3. **Search for "TestFox"**
4. **Click Install**

### First Run

```
1. Click the 🦊 TestFox icon in the Activity Bar
2. Click "AI Config" to set up your API key (optional)
3. Click "Analyze Project" to detect your project
4. Click "Generate Tests" to create test cases
5. Click "Run Tests" to execute
6. Click "View Report" for results
```

---

## 💻 Commands

| Command | Description |
|---------|-------------|
| `TestFox: Analyze Project` | Detect project type and structure |
| `TestFox: Generate Tests` | AI-powered test generation |
| `TestFox: Run All Tests` | Execute all test categories |
| `TestFox: Run Test Category` | Run specific category |
| `TestFox: Generate Web Report` | Open interactive dashboard |
| `TestFox: Configure AI` | Set up AI provider and model |
| `TestFox: Install Browsers` | Install Playwright browsers |

---

## ⚙️ Configuration

Configure TestFox in VS Code settings (`Ctrl+,`):

### 🤖 AI Provider Configuration
```json
{
  "testfox.ai.enabled": true,
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free",
  "testfox.ai.apiKey": "",
  "testfox.ai.baseUrl": "https://openrouter.ai/api/v1"
}
```

### 📋 Available AI Providers
| Provider | Value | Base URL | Authentication |
|----------|---------|-----------|-------------|
| **OpenRouter** | `openrouter` | https://openrouter.ai/api/v1 | API Key |
| **Google Gemini** | `google-gemini` | https://generativelanguage.googleapis.com | API Key |
| **DeepSeek** | `deepseek` | https://api.deepseek.com | API Key |
| **Ollama** | `ollama` | http://localhost:11434 | Local |
| **LM Studio** | `lmstudio` | http://localhost:1234 | Local |
| **Nvidia NIM** | `nvidia-nim` | http://localhost:8000 | API Key |
| **Amazon Nova** | `amazon-nova` | https://api.nova.amazon.com/v1 | API Key / NOVA_API_KEY |
| **BYO API** | `byo-api` | Custom | API Key |

### 🔧 Environment Variables
| Variable | Provider | Description |
|-----------|----------|-------------|
| `NOVA_API_KEY` | Amazon Nova | Auto-detects Amazon Nova API key |
| `OPENAI_API_KEY` | BYO API | For custom OpenAI-compatible endpoints |
| `OLLAMA_HOST` | Ollama | Custom Ollama server URL |

### 🎯 Model Selection Examples
```json
// OpenRouter (239+ models)
{
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free"
}

// Amazon Nova
{
  "testfox.ai.provider": "amazon-nova",
  "testfox.ai.baseUrl": "https://api.nova.amazon.com/v1",
  "testfox.ai.model": "nova-2-lite-v1"
}

// Local Ollama
{
  "testfox.ai.provider": "ollama",
  "testfox.ai.baseUrl": "http://localhost:11434",
  "testfox.ai.model": "llama3.1:8b"
}
```

### 🚪 Full Configuration Example
```json
{
  "testfox.ai.enabled": true,
  "testfox.ai.provider": "openrouter",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free",
  "testfox.ai.apiKey": "your-api-key-here",
  "testfox.ai.baseUrl": "https://openrouter.ai/api/v1",
  "testfox.ai.fallbackModel": "meta-llama/llama-3.1-8b-instruct:free",
  "testfox.browserHeadless": true,
  "testfox.defaultTimeout": 30000,
  "testfox.securityTestLevel": "standard",
  "testfox.performanceThreshold": 3000,
  "testfox.automation.enabled": true,
  "testfox.automation.interval": "1h"
}
```

---

## 📚 ISTQB-Aligned Testing Techniques

TestFox implements industry-standard testing methodologies:

- ✅ **Boundary Value Analysis (BVA)**
- ✅ **Equivalence Partitioning**
- ✅ **Decision Table Testing**
- ✅ **State Transition Testing**
- ✅ **Use Case Testing**
- ✅ **Error Guessing**
- ✅ **Exploratory Testing**

---

## 🏗️ SDLC Integration

TestFox serves as the **final quality gate** before release:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Software Development Lifecycle               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 Requirements → 💻 Development → 🧪 Unit Tests → 👀 Review │
│                                                                 │
│                            ↓                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │              🦊 TestFox Quality Gate                      │ │
│  │                                                            │ │
│  │  ✓ Smoke → Functional → Security → Performance → UAT       │ │
│  │  ✓ AI-Powered Analysis    ✓ 18+ Test Categories            │ │
│  │  ✓ Multi-Language Support ✓ Interactive Reports            │ │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│                      🚀 Release                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Requirements

- **VS Code** 1.85.0 or higher
- **Node.js** 18+ (for test execution)
- **Internet** (for AI features - optional)

---

## 🤝 Contributing

Contributions are welcome! Please visit our GitHub repository.

**GitHub**: [github.com/senthazalravi/TestFox](https://github.com/senthazalravi/TestFox)

---

## 👨‍💻 Author

Developed with ❤️ in **Stockholm, Sweden**

- **Twitter/X**: [@senthazalravi](https://x.com/senthazalravi)
- **Email**: ravi.antone@gmail.com
- **Co-founder**: nithiyanandam.sundaram@gmail.com

### 💼 Looking for Co-founders & Investors

Interested in joining TestFox? Contact us!

---

## 🙏 Support the Project

- ⭐ **Star us on GitHub**
- 📝 **Write a review** on the VS Code Marketplace
- 💬 **Share** with your developer friends
- 💰 **Sponsor** our LLM credits and infrastructure

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">

**TestFox** 🦊 *- The Final Quality Gate*

*Making software testing intelligent, comprehensive, and accessible to everyone.*

</div>
