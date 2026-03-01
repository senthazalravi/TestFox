# AI Configuration Improvements

## Overview
This update fixes the AI configuration onboarding experience and adds proper Ollama support with automatic model discovery.

## Changes Made

### 1. New AI Config Wizard (`src/views/aiConfigWizard.ts`)
A guided, step-by-step wizard for configuring AI providers:
- **Better provider selection** with clear descriptions of each option
- **Automatic Ollama model discovery** - fetches installed models from local Ollama server
- **Better validation** with helpful error messages
- **Smoother UX** with progress notifications
- **Fallback options** if model fetching fails

### 2. Enhanced Onboarding Panel (`src/views/onboardingPanel.ts`)
- Added **"Launch AI Config Wizard"** button for easy access
- Better visual hierarchy with highlighted wizard option
- Seamless integration with existing setup flow

### 3. Updated Extension Command (`src/extension.ts`)
- Modified `testfox.configureAI` command to use the new wizard
- Falls back to old onboarding if wizard fails

## New Features

### 🧙‍♂️ AI Config Wizard
- Step-by-step guided setup
- Auto-fetches Ollama models from local server
- Clear descriptions for each provider
- Better validation and error messages
- Progress indicators for long-running operations

### 🐳 Ollama Support
- **Automatic model discovery**: Fetches all installed models from Ollama server
- **Manual fallback**: Enter model name if automatic fetch fails
- **Server availability check**: Validates Ollama is running before attempting connection
- **URL configuration**: Supports custom Ollama server URLs

## Usage

### Via Command Palette
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "TestFox: Configure AI"
3. Select it to launch the wizard

### Via Onboarding
1. Open TestFox onboarding (first time setup or via "Show Onboarding")
2. Click the green **"Launch AI Config Wizard"** button
3. Follow the step-by-step instructions

### Via Settings
1. Open VS Code settings (`Ctrl+,`)
2. Search for "TestFox AI"
3. Configure manually or click "Configure AI" to launch wizard

## Provider Setup Details

### OpenRouter (Recommended for Beginners)
1. Get API key from https://openrouter.ai/keys
2. Select from 8+ free models (Gemini, DeepSeek, Llama, etc.)
3. Wizard validates key format and tests connection

### Ollama (Local AI)
1. Install Ollama from https://ollama.ai
2. Run `ollama serve` to start the server
3. Pull models with `ollama pull llama2`
4. Wizard auto-discovers installed models

### LM Studio (Local AI)
1. Install LM Studio from https://lmstudio.ai
2. Start the local server
3. Wizard connects to localhost:1234 by default

### Other Providers
- Google Gemini: Requires API key from Google AI Studio
- DeepSeek: Direct API access with your API key
- BYO API: Connect to any OpenAI-compatible endpoint

## Testing

```bash
# Build the extension
npm run compile

# Run tests
npm test

# Package for testing
vsce package
```

## Troubleshooting

### Ollama Models Not Showing
1. Ensure Ollama is running: `ollama serve`
2. Check if models are installed: `ollama list`
3. Install a model: `ollama pull llama2`
4. Try manual entry in wizard

### Connection Failed
1. Check API key format and validity
2. Verify network connectivity
3. For local providers (Ollama/LM Studio), ensure server is running
4. Open settings to verify configuration

### Need Help
- Open an issue: https://github.com/senthazalravi/TestFox/issues
- Documentation: https://testfox.ai/docs
- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=TestFox.testfox

## Next Steps
- [ ] Add model comparison/selection UI
- [ ] Add provider-specific tips and best practices
- [ ] Add configuration export/import
- [ ] Add AI model performance benchmarks
- [ ] Add one-click Ollama installation guide

## Version
- Added in: 0.6.47
- Author: TestFox Team
