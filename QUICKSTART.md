# Quick Start Guide

Get up and running with Kenchi in minutes!

## Prerequisites Check

- ✅ Node.js 18+ installed
- ✅ npm installed
- ✅ Git (optional, for cloning)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all dependencies for all packages in the monorepo.

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Then edit `.env` and add your credentials:
- `OPENAI_API_KEY` (required)
- `SLACK_BOT_TOKEN` (optional, if using Slack bot)
- `SLACK_SIGNING_SECRET` (optional, if using Slack bot)
- `GITHUB_APP_ID` (optional, if using GitHub App)
- `GITHUB_APP_PRIVATE_KEY` (optional, if using GitHub App)

### 3. Validate Environment

```bash
npm run validate
```

This checks that your environment variables are set correctly.

### 4. Build the Shared Package

The shared package must be built before any service can run:

```bash
npm run build:shared
```

### 5. Build Services (Optional)

Build all services:
```bash
npm run build
```

Or build individual services:
```bash
npm run build:api
npm run build:slack-bot
npm run build:github-app
```

### 6. Verify Builds

```bash
npm run check-build
```

### 7. Run Services

**Development mode** (with hot reload):
```bash
npm run dev:api          # API service on port 3000
npm run dev:slack-bot    # Slack bot on port 3001
npm run dev:github-app   # GitHub App on port 3002
```

**Production mode**:
```bash
cd services/api && npm start
cd services/slack-bot && npm start
cd services/github-app && npm start
```

## Common Issues

### "Cannot find module '@kenchi/shared'"
**Solution**: Build the shared package first:
```bash
npm run build:shared
```

### "Cannot find module 'express'"
**Solution**: Install dependencies:
```bash
npm install
```

### TypeScript errors about missing types
**Solution**: All `@types/*` packages are included. Make sure you ran `npm install`.

### Environment variables not loading
**Solution**: 
1. Make sure `.env` file exists in the root directory
2. Run `npm run validate` to check

## Next Steps

- Read the main [README.md](./README.md) for detailed documentation
- Check [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines
- Explore the service-specific READMEs in each service directory

## Development Workflow

1. Make changes to TypeScript files
2. TypeScript will auto-compile in dev mode (`npm run dev:*`)
3. For production, run `npm run build` before `npm start`
4. Use `npm run type-check` to verify types across all packages

## Need Help?

- Check the service-specific READMEs
- Review the TypeScript configuration in `tsconfig.json`
- Ensure all dependencies are installed with `npm install`

