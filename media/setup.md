# Quick Setup ⚡

<div align="center">
  <h2>Get TestFox Ready in Minutes</h2>
</div>

---

## 🔧 **Step 1: Project Analysis**

TestFox automatically detects your project structure and technology stack.

```bash
# TestFox analyzes your project automatically
# Supported frameworks: React, Vue, Angular, Next.js, Express, Django, Spring, etc.
```

**What TestFox Detects:**
- ✅ **Project Type** (Node.js, Python, Java, .NET, PHP, Ruby)
- ✅ **Framework** (React, Vue, Angular, Express, Django, Spring)
- ✅ **Dependencies** (package.json, requirements.txt, pom.xml)
- ✅ **Run Scripts** (npm/yarn/pip commands)
- ✅ **Routes & APIs** (automatic endpoint discovery)

---

## 🤖 **Step 2: AI Configuration (Optional)**

Unlock TestFox's full potential with AI-powered test generation.

### Get Your API Key
1. Visit [OpenRouter.ai](https://openrouter.ai/keys) (free tier available)
2. Create an account and generate an API key
3. Copy the API key

### Configure TestFox
```json
// VS Code Settings (Ctrl+,)
{
  "testfox.ai.enabled": true,
  "testfox.ai.apiKey": "your-api-key-here",
  "testfox.ai.model": "google/gemini-2.0-flash-exp:free"
}
```

**Available AI Models:**
- 🆓 **Free Models**: Gemini 2.0 Flash, DeepSeek R1, Qwen3 Coder
- 🚀 **Premium Models**: Claude 3.5 Sonnet, GPT-4o, Llama 3.1

---

## 🌐 **Step 3: Browser Setup**

TestFox uses Playwright for browser automation.

```bash
# TestFox installs browsers automatically
# Supported: Chromium, Firefox, WebKit, Safari
```

**Browser Installation:**
- TestFox prompts to install browsers on first use
- Or manually install: `npx playwright install`

---

## 📱 **Step 4: Start Testing**

You're all set! TestFox is ready to test your application.

**Next Steps:**
1. Click "Analyze Project" in the TestFox sidebar
2. Generate comprehensive tests
3. Run automated testing
4. Review results in the interactive dashboard

---

<div align="center">
  <h3>🎉 Setup Complete!</h3>
  <p>TestFox is now ready to revolutionize your testing workflow.</p>
  <p>Continue to explore TestFox's powerful features.</p>
</div>
