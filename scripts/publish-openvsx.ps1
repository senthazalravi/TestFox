# OpenVSX Publishing Script
# This script publishes the TestFox extension to OpenVSX

# Load token from environment variable
$token = $env:OVSX_PAT
if (-not $token) {
    Write-Host "Error: OVSX_PAT environment variable not set"
    Write-Host "Please set it using: `$env:OVSX_PAT = 'your-token'"
    exit 1
}

# Find the latest VSIX file
$vsixFile = Get-ChildItem -Path . -Filter "testfox-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "Error: No VSIX file found. Please run 'npm run package' first."
    exit 1
}

Write-Host "Publishing $($vsixFile.Name) to OpenVSX..."

# Publish to OpenVSX
ovsx publish $vsixFile.FullName -p $token

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully published to OpenVSX!"
} else {
    Write-Host "❌ Failed to publish to OpenVSX"
    exit 1
}

