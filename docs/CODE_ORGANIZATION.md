# Code Organization Guide

This document outlines the code organization principles and strategies to prevent duplication in the Kenchi monorepo.

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Shared Package Strategy](#shared-package-strategy)
3. [Duplication Prevention](#duplication-prevention)
4. [Code Location Guidelines](#code-location-guidelines)
5. [AI Tool Guidelines](#ai-tool-guidelines)
6. [Detection and Enforcement](#detection-and-enforcement)

## Architecture Principles

### 1. Single Source of Truth

**All shared functionality lives in `packages/shared/`.**

- ✅ One implementation of each utility
- ✅ One source for all types
- ✅ One place for all middleware
- ✅ One location for all clients

### 2. Service Isolation

**Services contain ONLY service-specific code.**

- ✅ Service routes and handlers
- ✅ Service-specific business logic
- ✅ Service-specific integrations
- ❌ NO utilities, helpers, or shared types

### 3. Import, Don't Duplicate

**Always import from `@kenchi/shared`, never copy code.**

```typescript
// ✅ CORRECT
import { logger, config, errorHandler } from "@kenchi/shared";

// ❌ WRONG
const logger = createLogger("service");
```

## Shared Package Strategy

### What Belongs in Shared Package

**`packages/shared/src/` should contain:**

1. **Utilities**
   - Logging (`logger.ts`)
   - Configuration (`config.ts`)
   - Validation (`validation.ts`)
   - Rate limiting (`rateLimit.ts`)
   - Error handling (`errors.ts`, `middleware.ts`)

2. **Types**
   - All TypeScript interfaces and types (`types.ts`)
   - Shared data models
   - Event types

3. **Clients**
   - OpenAI client (`openaiClient.ts`)
   - Vector store interface (`vectorStore.ts`)
   - External service clients

4. **Safety & Security**
   - Confidence scoring (`safety.ts`)
   - Validation helpers
   - Security utilities

5. **Middleware**
   - Express middleware (`middleware.ts`)
   - Request logging
   - Error handling

### Shared Package Structure

```
packages/shared/src/
├── index.ts           # Main exports - CHECK THIS FIRST
├── config.ts          # Environment configuration
├── logger.ts         # Logging utilities
├── errors.ts          # Error classes
├── middleware.ts      # Express middleware
├── validation.ts      # Request validation
├── rateLimit.ts       # Rate limiting
├── openaiClient.ts    # OpenAI integration
├── vectorStore.ts     # Vector DB interface
├── safety.ts          # Safety/confidence checks
└── types.ts           # Shared TypeScript types
```

### Adding to Shared Package

**Process:**

1. **Check if it exists**: Look in `packages/shared/src/index.ts`
2. **Check similar functionality**: Search codebase for similar code
3. **Add to shared**: Create new file or extend existing
4. **Export**: Update `packages/shared/src/index.ts`
5. **Use in services**: Import from `@kenchi/shared`

## Duplication Prevention

### Detection Strategies

#### 1. Pre-Commit Checks

**Check for duplicate code patterns:**

```bash
# Check for duplicate function signatures
grep -r "function.*logger" services/ --exclude-dir=node_modules

# Check for duplicate type definitions
grep -r "interface.*Config" services/ --exclude-dir=node_modules

# Check for duplicate imports that should be from shared
grep -r "from.*utils" services/ --exclude-dir=node_modules
```

#### 2. Code Review Checklist

**Before merging PRs, verify:**

- [ ] No duplicate utilities in services
- [ ] All imports from `@kenchi/shared` where applicable
- [ ] No local type definitions that should be shared
- [ ] No duplicate error handling code
- [ ] No duplicate validation logic
- [ ] No duplicate configuration loading

#### 3. Automated Detection

**Use tools to detect duplication:**

```bash
# Install jscpd for code duplication detection
npm install -g jscpd

# Run duplication check
jscpd packages/shared/src services/*/src --min-lines 5 --min-tokens 50
```

### Prevention Rules

#### Rule 1: Check Shared Package First

**Before writing ANY code:**

1. Open `packages/shared/src/index.ts`
2. Check if functionality exists
3. Search codebase for similar code
4. If exists, import it
5. If not, add to shared package first

#### Rule 2: No Local Utilities

**Services should NOT have:**

- `utils/` directories
- `helpers/` directories
- `lib/` directories
- Local type definitions
- Local error classes
- Local middleware

**All of these belong in `packages/shared/`**

#### Rule 3: Import Pattern

**Always use this pattern:**

```typescript
// ✅ CORRECT - Import from shared
import {
  logger,
  config,
  errorHandler,
  asyncHandler,
  validate,
  type WebhookEvent,
} from "@kenchi/shared";

// ❌ WRONG - Local implementation
import { logger } from "./utils/logger";
import type { WebhookEvent } from "./types";
```

## Code Location Guidelines

### Decision Tree

```
Is the code used by multiple services?
├── YES → packages/shared/src/
└── NO → Is it service-specific?
    ├── YES → services/*/src/
    └── NO → Re-evaluate (might be shared)
```

### Examples

#### Example 1: Logging Utility

**Question**: Where should a logging utility go?

**Answer**: `packages/shared/src/logger.ts`

**Reason**: All services need logging.

**Usage**:

```typescript
// In any service
import { logger } from "@kenchi/shared";
```

#### Example 2: Slack Bot Command Handler

**Question**: Where should a Slack command handler go?

**Answer**: `services/slack-bot/src/index.ts`

**Reason**: Only Slack bot service needs it.

#### Example 3: API Request Validation

**Question**: Where should request validation go?

**Answer**: `packages/shared/src/validation.ts`

**Reason**: Multiple services (API, GitHub App) need validation.

#### Example 4: GitHub Webhook Handler

**Question**: Where should GitHub webhook handling go?

**Answer**: `services/github-app/src/index.ts`

**Reason**: Only GitHub App service handles GitHub webhooks.

## AI Tool Guidelines

### For Cursor AI

**See `.cursorrules` file for Cursor-specific guidelines.**

**Key points:**

- Always check `packages/shared/src/index.ts` first
- Never duplicate code
- Always import from `@kenchi/shared`
- Follow monorepo structure strictly

### For Claude AI

**See `.claude-config.md` file for Claude-specific guidelines.**

**Key points:**

- Understand the shared package is the single source of truth
- Check existing exports before creating new code
- Follow the zero-duplication policy
- Use the code generation checklist

### For Other AI Tools

**General guidelines:**

1. **Read architecture docs first**: `docs/ARCHITECTURE.md`
2. **Check shared package**: `packages/shared/src/index.ts`
3. **Follow patterns**: Look at existing code for patterns
4. **Ask before duplicating**: If unsure, check if similar code exists
5. **Update exports**: When adding to shared, update `index.ts`

## Detection and Enforcement

### Manual Checks

**Regular code review checklist:**

1. **Check for duplicate utilities:**

   ```bash
   find services -name "*.ts" -exec grep -l "function.*logger\|createLogger" {} \;
   ```

2. **Check for duplicate types:**

   ```bash
   find services -name "*.ts" -exec grep -l "interface.*Config\|type.*Config" {} \;
   ```

3. **Check for local utils:**
   ```bash
   find services -type d -name "utils" -o -name "helpers" -o -name "lib"
   ```

### Automated Checks

**Add to CI/CD pipeline:**

```yaml
# .github/workflows/check-duplication.yml
- name: Check for code duplication
  run: |
    npm install -g jscpd
    jscpd packages/shared/src services/*/src --min-lines 5 --min-tokens 50 --reporters console
```

### Linting Rules

**Add ESLint rules to prevent duplication:**

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "./utils",
            "message": "Use @kenchi/shared instead of local utils"
          },
          {
            "name": "./helpers",
            "message": "Use @kenchi/shared instead of local helpers"
          }
        ]
      }
    ]
  }
}
```

## Best Practices

### 1. Before Adding Code

1. ✅ Check `packages/shared/src/index.ts`
2. ✅ Search codebase for similar functionality
3. ✅ Check if it's used by multiple services
4. ✅ Add to shared package if shared
5. ✅ Import from `@kenchi/shared` in services

### 2. Code Review

1. ✅ Verify no duplicate utilities
2. ✅ Verify imports from `@kenchi/shared`
3. ✅ Verify no local type definitions
4. ✅ Verify shared package exports updated

### 3. Refactoring

1. ✅ Identify duplicated code
2. ✅ Move to shared package
3. ✅ Update all imports
4. ✅ Remove duplicate code
5. ✅ Update shared package exports

## Summary

**Key Principles:**

1. **Single Source of Truth**: `packages/shared/` contains all shared code
2. **Zero Duplication**: Never duplicate code across services
3. **Import, Don't Copy**: Always import from `@kenchi/shared`
4. **Check First**: Always check shared package before creating new code
5. **Update Exports**: Always update `packages/shared/src/index.ts` when adding shared code

**Remember**: The folder structure is a guide, but the shared package is the constraint. Always check it first, always use it, never duplicate.
