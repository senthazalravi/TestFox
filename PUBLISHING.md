# Publishing TestFox to VS Code Marketplace

## Prerequisites

1. **Azure DevOps Account**: You need a Microsoft/Azure account
2. **Personal Access Token (PAT)**: Required for publishing

## Step 1: Create a Publisher

1. Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
2. Sign in with your Microsoft account
3. Click **"Create Publisher"**
4. Fill in the details:
   - **Publisher ID**: `testfox` (or your preferred unique ID)
   - **Display Name**: `TestFox`
   - **Description**: Testing tools for developers

## Step 2: Create a Personal Access Token (PAT)

1. Go to [Azure DevOps](https://dev.azure.com)
2. Sign in and create an organization if you don't have one
3. Click on your profile icon → **Personal access tokens**
4. Click **"New Token"**
5. Configure:
   - **Name**: `vsce-publish`
   - **Organization**: All accessible organizations
   - **Expiration**: Choose a suitable period
   - **Scopes**: Select **"Custom defined"** then:
     - Under **Marketplace**, check **"Acquire"** and **"Manage"**
6. Click **Create** and **copy the token** (you won't see it again!)

## Step 3: Update Publisher in package.json

Update the `publisher` field in `package.json` to match your publisher ID:

```json
{
  "publisher": "your-publisher-id"
}
```

## Step 4: Create the Icon

The extension requires a 128x128 PNG icon. Convert the SVG:

### Option A: Online converter
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `media/testfox-icon.svg`
3. Set size to 128x128
4. Download and save as `media/testfox-icon.png`

### Option B: Using ImageMagick (if installed)
```bash
magick convert -background none -size 128x128 media/testfox-icon.svg media/testfox-icon.png
```

### Option C: Using Inkscape (if installed)
```bash
inkscape media/testfox-icon.svg --export-type=png --export-filename=media/testfox-icon.png --export-width=128 --export-height=128
```

## Step 5: Install vsce

```bash
npm install -g @vscode/vsce
```

Or it's already in devDependencies, so you can use `npx vsce`.

## Step 6: Login to vsce

```bash
npx vsce login your-publisher-id
```

When prompted, paste your Personal Access Token.

## Step 7: Package the Extension

Test packaging first:

```bash
npm run package
```

This creates `testfox-0.1.0.vsix`. You can install this locally to test:
- In VS Code: Extensions → ... → Install from VSIX

## Step 8: Publish

### Publish current version:
```bash
npm run publish
```

### Publish with version bump:
```bash
npm run publish:patch  # 0.1.0 → 0.1.1
npm run publish:minor  # 0.1.0 → 0.2.0
npm run publish:major  # 0.1.0 → 1.0.0
```

## Step 9: Verify Publication

1. Go to [VS Code Marketplace](https://marketplace.visualstudio.com/vscode)
2. Search for "TestFox"
3. Your extension should appear within a few minutes

## Updating the Extension

1. Make your changes
2. Update `CHANGELOG.md`
3. Run `npm run publish:patch` (or minor/major)

## Repository Setup (Optional but Recommended)

For the GitHub links in package.json to work:

1. Create a GitHub repository: `testfox-vscode`
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - TestFox v0.1.0"
   git remote add origin https://github.com/YOUR_USERNAME/testfox-vscode.git
   git push -u origin main
   ```
3. Update `package.json` with your actual GitHub URLs

## Troubleshooting

### "Personal access token verification failed"
- Make sure you selected "All accessible organizations"
- Ensure Marketplace → Manage and Acquire are checked

### "Missing icon"
- Icon must be PNG format, 128x128 minimum
- Path must match `icon` field in package.json

### "Extension not appearing"
- Wait a few minutes; indexing takes time
- Check the [Publisher Management](https://marketplace.visualstudio.com/manage) page

## Quick Commands Reference

```bash
# Package locally
npm run package

# Publish
npm run publish

# Version bumps
npm run publish:patch
npm run publish:minor
npm run publish:major
```

---

Happy Publishing! 🦊
