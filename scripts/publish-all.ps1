# Combined Publishing Script
# Publishes TestFox extension to both VS Code Marketplace and OpenVSX

Write-Host "🚀 Publishing TestFox to both marketplaces..." -ForegroundColor Cyan

# Step 1: Package the extension
Write-Host "`n📦 Step 1: Packaging extension..." -ForegroundColor Yellow
npm run package
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Packaging failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Find the latest VSIX file
$vsixFile = Get-ChildItem -Path . -Filter "testfox-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsixFile) {
    Write-Host "❌ No VSIX file found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found: $($vsixFile.Name)" -ForegroundColor Green

# Step 3: Publish to VS Code Marketplace
Write-Host "`n📤 Step 2: Publishing to VS Code Marketplace..." -ForegroundColor Yellow

# Check if VSCE_PAT is available
$vsceToken = $env:VSCE_PAT
if (-not $vsceToken) {
    $vsceToken = [System.Environment]::GetEnvironmentVariable('VSCE_PAT', 'User')
}

if (-not $vsceToken) {
    Write-Host "⚠️  VSCE_PAT not set, skipping VS Code Marketplace publish" -ForegroundColor Yellow
    Write-Host "To set it: [System.Environment]::SetEnvironmentVariable('VSCE_PAT', 'your-token', 'User')" -ForegroundColor Cyan
} else {
    Write-Host "✅ VSCE_PAT found, publishing to VS Code Marketplace..." -ForegroundColor Green
    npm run publish
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ VS Code Marketplace publish failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Published to VS Code Marketplace!" -ForegroundColor Green
}

# Step 4: Publish to OpenVSX
Write-Host "`n📤 Step 3: Publishing to OpenVSX..." -ForegroundColor Yellow

# Load token from environment variable
$token = $env:OVSX_PAT
if (-not $token) {
    Write-Host "⚠️  OVSX_PAT not set, checking user environment..." -ForegroundColor Yellow
    $token = [System.Environment]::GetEnvironmentVariable('OVSX_PAT', 'User')
}

if (-not $token) {
    Write-Host "❌ Error: OVSX_PAT environment variable not set" -ForegroundColor Red
    Write-Host "Please set it using: [System.Environment]::SetEnvironmentVariable('OVSX_PAT', 'your-token', 'User')" -ForegroundColor Yellow
    exit 1
}

ovsx publish $vsixFile.FullName -p $token
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ OpenVSX publish failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Published to OpenVSX!" -ForegroundColor Green

Write-Host ""
Write-Host "Successfully published to both marketplaces!" -ForegroundColor Green
Write-Host "VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=TestFox.testfox" -ForegroundColor Cyan
Write-Host "OpenVSX Registry: https://open-vsx.org/extension/TestFox/testfox" -ForegroundColor Cyan


