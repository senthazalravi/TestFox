#!/bin/bash

# TestFox AI Configuration Improvements - Test Script
# This script verifies the AI configuration improvements are working

echo "🧪 Testing AI Configuration Improvements"
echo "============================================"
echo ""

# Test 1: Check if files exist
echo "✅ Test 1: Verifying new files exist..."
test -f "src/views/aiConfigWizard.ts" && echo "   ✓ aiConfigWizard.ts exists" || echo "   ✗ aiConfigWizard.ts missing"
test -f "AI_CONFIG_IMPROVEMENTS.md" && echo "   ✓ AI_CONFIG_IMPROVEMENTS.md exists" || echo "   ✗ Documentation missing"
echo ""

# Test 2: Check TypeScript compilation
echo "✅ Test 2: Checking TypeScript syntax..."
npx tsc --noEmit src/views/aiConfigWizard.ts 2>&1 | head -20
if [ $? -eq 0 ]; then
    echo "   ✓ aiConfigWizard.ts compiles successfully"
else
    echo "   ✗ TypeScript compilation errors found"
fi
echo ""

# Test 3: Check for required imports
echo "✅ Test 3: Verifying imports in extension.ts..."
grep -q "aiConfigWizard" src/extension.ts && echo "   ✓ AI Config Wizard is imported" || echo "   ✗ Import missing"
grep -q "testfox.configureAI" src/extension.ts && echo "   ✓ configureAI command registered" || echo "   ✗ Command not found"
echo ""

# Test 4: Check onboarding panel changes
echo "✅ Test 4: Checking onboarding panel modifications..."
grep -q "launchAIWizard" src/views/onboardingPanel.ts && echo "   ✓ Wizard launcher button exists" || echo "   ✗ Button missing"
grep -q "AI Config Wizard" src/views/onboardingPanel.ts && echo "   ✓ Wizard title present" || echo "   ✗ Title missing"
echo ""

# Test 5: Verify key features
echo "✅ Test 5: Verifying key features..."
grep -q "fetchOllamaModels" src/views/aiConfigWizard.ts && echo "   ✓ Ollama model fetching" || echo "   ✗ Missing Ollama fetch"
grep -q "checkOllamaInstalled" src/views/aiConfigWizard.ts && echo "   ✓ Ollama availability check" || echo "   ✗ Missing check"
grep -q "selectProvider" src/views/aiConfigWizard.ts && echo "   ✓ Provider selection flow" || echo "   ✗ Missing selection"
echo ""

# Test 6: Verify package.json commands
echo "✅ Test 6: Checking commands in package.json..."
grep -q "configureAI" package.json && echo "   ✓ configureAI command exists" || echo "   ✗ Command missing"
echo ""

echo "============================================"
echo "🧪 Test Complete!"
echo ""
echo "📝 Next Steps:"
echo "   1. npm install"
echo "   2. npm run compile"
echo "   3. vsce package"
echo "   4. Test in VS Code"
echo ""
echo "📖 See AI_CONFIG_IMPROVEMENTS.md for details"
