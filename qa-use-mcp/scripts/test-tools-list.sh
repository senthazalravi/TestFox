#!/bin/bash

echo "🧪 Testing QA Use MCP Server - Tools List"
echo "========================================="

# Build the project first
echo "📦 Building project..."
bun run build > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"

# Test tools list
echo "🔍 Testing tools list..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/src/index.js

echo ""
echo "✅ Tools list test completed!"
