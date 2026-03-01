# AI Providers Guide - Comprehensive Documentation

## 🤖 Supported AI Providers

TestFox supports **8 AI providers** with **300+ models** for AI-powered test generation. Choose the provider that best fits your needs.

---

## 📋 Provider Comparison Table

| Provider | Setup Time | Authentication | Default URL | Model Count | Best For |
|----------|------------|-------------|-------------|------------|-------------|
| **OpenRouter** | 2 minutes | API Key | https://openrouter.ai/api/v1 | 239+ models |
| **Google Gemini** | 1 minute | API Key | https://generativelanguage.googleapis.com | 4+ models |
| **DeepSeek** | 1 minute | API Key | https://api.deepseek.com | 5+ models |
| **Ollama** | 5 minutes | Local | http://localhost:11434 | Unlimited |
| **LM Studio** | 5 minutes | Local | http://localhost:1234 | Unlimited |
| **Nvidia NIM** | 5 minutes | API Key | http://localhost:8000 | Hardware-optimized |
| **Amazon Nova** | 2 minutes | API Key / NOVA_API_KEY | https://api.nova.amazon.com/v1 | Enterprise |
| **BYO API** | 1 minute | API Key | Custom | Custom endpoints |

---

## 🚀 Quick Setup Guides

### OpenRouter (Recommended for Beginners)
```json
{
  "testfox.ai.provider": "openrouter",
  "testfox.ai.baseUrl": "https://openrouter.ai/api/v1",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free",
  "testfox.ai.apiKey": "your-openrouter-key"
}
```
**Setup Steps:**
1. Visit [OpenRouter.ai/keys](https://openrouter.ai/keys)
2. Get free API key (no credit card required)
3. Configure in TestFox settings
4. Choose from 239+ free models

### Amazon Nova (Enterprise Ready)
```json
{
  "testfox.ai.provider": "amazon-nova",
  "testfox.ai.baseUrl": "https://api.nova.amazon.com/v1",
  "testfox.ai.model": "nova-2-lite-v1",
  "testfox.ai.apiKey": "your-nova-key"
}
```
**Setup Steps:**
1. Get API key from [AWS Console](https://console.aws.amazon.com/bedrock)
2. OR set `NOVA_API_KEY` environment variable
3. Configure in TestFox settings
4. Test connection with "nova-2-lite-v1"

### Nvidia NIM (High Performance)
```json
{
  "testfox.ai.provider": "nvidia-nim",
  "testfox.ai.baseUrl": "http://localhost:8000",
  "testfox.ai.model": "nvidia/llama-3.1-nemotron-70b-instruct",
  "testfox.ai.apiKey": "your-nim-key"
}
```
**Setup Steps:**
1. Deploy Nvidia NIM locally
2. Get API key from your NIM deployment
3. Configure in TestFox settings
4. Test with GPU-optimized models

### Google Gemini (Google Integration)
```json
{
  "testfox.ai.provider": "google-gemini",
  "testfox.ai.baseUrl": "https://generativelanguage.googleapis.com",
  "testfox.ai.model": "gemini-2.0-flash-exp:free",
  "testfox.ai.apiKey": "your-gemini-key"
}
```
**Setup Steps:**
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Get API key
3. Configure in TestFox settings
4. Choose Gemini 2.0 Flash for free usage

### DeepSeek (Advanced Reasoning)
```json
{
  "testfox.ai.provider": "deepseek",
  "testfox.ai.baseUrl": "https://api.deepseek.com",
  "testfox.ai.model": "deepseek-r1:free",
  "testfox.ai.apiKey": "your-deepseek-key"
}
```
**Setup Steps:**
1. Visit [DeepSeek Platform](https://platform.deepseek.com/)
2. Get API key
3. Configure in TestFox settings
4. Choose DeepSeek R1 for advanced reasoning

### Ollama (Local & Private)
```json
{
  "testfox.ai.provider": "ollama",
  "testfox.ai.baseUrl": "http://localhost:11434",
  "testfox.ai.model": "llama3.1:8b",
  "testfox.ai.apiKey": ""
}
```
**Setup Steps:**
1. Install Ollama locally
2. No authentication required
3. Configure custom port with `OLLAMA_HOST`
4. Use unlimited local models

### LM Studio (Custom Models)
```json
{
  "testfox.ai.provider": "lmstudio",
  "testfox.ai.baseUrl": "http://localhost:1234",
  "testfox.ai.model": "your-custom-model",
  "testfox.ai.apiKey": ""
}
```
**Setup Steps:**
1. Install LM Studio locally
2. No authentication required
3. Host custom models locally
4. Full control over model serving

### BYO API (Custom Endpoints)
```json
{
  "testfox.ai.provider": "byo-api",
  "testfox.ai.baseUrl": "https://your-custom-endpoint.com/v1",
  "testfox.ai.model": "your-custom-model",
  "testfox.ai.apiKey": "your-custom-key"
}
```
**Setup Steps:**
1. Use any OpenAI-compatible endpoint
2. Configure custom base URL
3. Add your API key
4. Bring your own models

---

## 🔑 Authentication Methods

### API Key Authentication
Most providers use API key authentication:

- **OpenRouter**: Get keys at [OpenRouter.ai/keys](https://openrouter.ai/keys)
- **Google Gemini**: Get keys at [Google AI Studio](https://aistudio.google.com/app/apikey)
- **DeepSeek**: Get keys at [DeepSeek Platform](https://platform.deepseek.com/)
- **Amazon Nova**: Get keys at [AWS Console](https://console.aws.amazon.com/bedrock)
- **Nvidia NIM**: Get keys from your NIM deployment
- **BYO API**: Use your custom endpoint's authentication

### Local Authentication
- **Ollama**: No authentication required
- **LM Studio**: No authentication required

### Environment Variable Support
TestFox automatically detects these environment variables:

| Variable | Provider | Description | Example |
|-----------|----------|-------------|---------|
| `NOVA_API_KEY` | Amazon Nova | Auto-detects Amazon Nova API key | `export NOVA_API_KEY="your-key"` |
| `OPENAI_API_KEY` | BYO API | For custom OpenAI-compatible endpoints | `export OPENAI_API_KEY="your-key"` |
| `OLLAMA_HOST` | Ollama | Custom Ollama server URL | `export OLLAMA_HOST="http://localhost:11434"` |

---

## 🎯 Provider Recommendations

### For Beginners
**Recommended: OpenRouter**
- 239+ models available
- Free tier with generous limits
- Easy setup process
- Multiple provider options in one place

### For Enterprise
**Recommended: Amazon Nova**
- AWS integration and compliance
- Enterprise-grade security
- Reliable infrastructure
- Compliance features built-in

### For Privacy
**Recommended: Ollama**
- Local processing only
- No data sharing with third parties
- Complete control over models
- Offline capability

### For High Performance
**Recommended: Nvidia NIM**
- GPU-optimized inference
- Hardware acceleration
- Large-scale testing support
- Optimized for enterprise workloads

### For Custom Integration
**Recommended: BYO API**
- Bring your own endpoint
- Use existing infrastructure
- Custom model support
- Full control over stack

### For Google Users
**Recommended: Google Gemini**
- Native Google integration
- Excellent free tier
- Fast and reliable
- Google ecosystem compatibility

### For Budget Conscious
**Recommended: DeepSeek**
- Excellent free tier
- Powerful reasoning models
- Cost-effective solution
- Advanced capabilities

---

## 🔧 Configuration Examples

### Complete Configuration
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

### Environment Variables Setup
```bash
# Amazon Nova (automatically detected)
export NOVA_API_KEY="your-nova-api-key"

# Custom OpenAI Endpoint
export OPENAI_API_KEY="your-custom-key"

# Custom Ollama Host
export OLLAMA_HOST="http://localhost:11434"
```

---

## 🚀 Getting Started

1. **Choose Your Provider**: Select from 8 supported providers
2. **Follow Setup Guide**: Use provider-specific instructions above
3. **Configure in TestFox**: Update VS Code settings
4. **Test Connection**: Use built-in connection testing
5. **Start Generating**: Begin AI-powered test creation

---

## 📚 Additional Resources

### Documentation
- [Main README](./README.md) - General TestFox documentation
- [Configuration Guide](./README.md#configuration) - VS Code settings
- [API Documentation](./docs/API.md) - Integration details

### Support
- [GitHub Issues](https://github.com/senthazalravi/TestFox/issues) - Report bugs
- [Discord Community](https://discord.gg/testfox) - Get help
- [Email Support](mailto:support@testfox.dev) - Direct support

### Model Information
- [OpenRouter Models](https://openrouter.ai/models) - All available models
- [Google Gemini Models](https://ai.google.dev/models) - Google model details
- [DeepSeek Models](https://platform.deepseek.com/) - DeepSeek model information
- [AWS Bedrock](https://aws.amazon.com/bedrock) - Amazon Nova documentation

---

*Last updated: March 2026*
