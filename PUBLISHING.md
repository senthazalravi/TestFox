# Publishing TestFox Extension

**⚠️ IMPORTANT: Always publish to BOTH marketplaces using `npm run publish:all`**

This document describes how to publish TestFox to both VS Code Marketplace and OpenVSX.

## Prerequisites

1. **VS Code Marketplace PAT**: Stored in `VSCE_PAT` environment variable
2. **OpenVSX Access Token**: Stored in `OVSX_PAT` environment variable
   - Current token: `ovsxat_d16bbdb8-247e-42fc-b609-671ecc522b5d`

## Publishing to Both Marketplaces

### Automatic (Recommended)

To publish to both marketplaces automatically:

```bash
npm run publish:all
```

This will:
1. Package the extension
2. Publish to VS Code Marketplace
3. Publish to OpenVSX

### Manual Publishing

#### VS Code Marketplace Only

```bash
npm run publish
```

#### OpenVSX Only

```bash
npm run publish:openvsx
```

## Environment Variables

### VS Code Marketplace (VSCE_PAT)

The PAT is stored in the user environment variable. To verify:

```powershell
[System.Environment]::GetEnvironmentVariable('VSCE_PAT', 'User')
```

### OpenVSX (OVSX_PAT)

The access token is stored in the user environment variable. To verify:

```powershell
[System.Environment]::GetEnvironmentVariable('OVSX_PAT', 'User')
```

To update the token:

```powershell
[System.Environment]::SetEnvironmentVariable('OVSX_PAT', 'your-token-here', 'User')
```

## Publishing Checklist

Before publishing a new version:

1. ✅ Update version in `package.json`
2. ✅ Update `CHANGELOG.md` with new features/fixes
3. ✅ Run `npm run compile` to ensure code compiles
4. ✅ Test the extension locally
5. ✅ Run `npm run publish:all` to publish to both marketplaces

## Marketplace Links

- **VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=TestFox.testfox
- **OpenVSX Registry**: https://open-vsx.org/extension/TestFox/testfox

## Notes

- Always use `npm run publish:all` for future versions to ensure both marketplaces are updated
- The OpenVSX namespace "TestFox" already exists and doesn't need to be created again
- Both marketplaces may take a few minutes to reflect the new version
