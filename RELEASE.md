# Release Instructions

This document outlines how to create releases for the Console MCP Server.

## Package Information

- **NPM Package Name**: `console-mcp`
- **GitHub Repository**: `console-mcp`
- **CLI Command**: `console-mcp` (after global install)

## Automated Release Process

The project uses GitHub Actions to automatically publish to NPM when tags are created.

### Creating a Release

1. **Update version in package.json** (if needed):
   ```bash
   npm version patch  # or minor, major
   ```

2. **Create and push a git tag**:
   ```bash
   # For version 1.0.1
   git tag v1.0.1
   git push origin v1.0.1
   ```

3. **GitHub Actions will automatically**:
   - Check if the version already exists on NPM
   - If version doesn't exist:
     - Build the project
     - Publish to NPM
     - Create a GitHub release
   - If version exists:
     - Skip publishing and log a message

### Manual Release (if needed)

If you need to publish manually:

```bash
# Build the project
npm run build

# Login to NPM (if not already logged in)
npm login

# Publish
npm publish --access public
```

## NPM Token Setup

For automated publishing, you need to set up an NPM token:

1. Go to npmjs.com and create a token
2. In your GitHub repository settings:
   - Go to Settings > Secrets and variables > Actions
   - Add a new secret named `NPM_TOKEN`
   - Set the value to your NPM token

## Version Naming Convention

- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Tag format: `vMAJOR.MINOR.PATCH` (e.g., `v1.0.1`)
- Tags starting with `v` will trigger the publish workflow

## Pre-release Testing

Before creating a release:

1. Run the CI pipeline: `npm run build`
2. Test the CLI: `node build/cli.js --help`
3. Test core functionality
4. Update CHANGELOG.md with new features/fixes
