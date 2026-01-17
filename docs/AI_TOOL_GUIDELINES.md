# AI Tool Guidelines

This document provides guidelines for AI tools (Cursor AI, Claude, GitHub Copilot, etc.) to understand the Kenchi codebase architecture and prevent code duplication.

## Quick Reference

**Before writing ANY code:**

1. ✅ Check `packages/shared/src/index.ts` for existing utilities
2. ✅ Search codebase for similar functionality
3. ✅ Import from `@kenchi/shared` instead of creating new code
4. ✅ Add to shared package if it's used by multiple services

## Architecture Overview

```
kenchi/
├── packages/shared/     ← ALL shared code (utilities, types, clients)
│   └── src/
│       └── index.ts     ← CHECK THIS FIRST for available exports
├── services/            ← Service-specific code ONLY
│   ├── api/
│   ├── slack-bot/
│   └── github-app/
└── docs/                ← Documentation
```

## Zero Duplication Policy

**NEVER duplicate code. ALWAYS use `@kenchi/shared`.**

### Available Shared Exports

**Check `packages/shared/src/index.ts` for complete list:**

- **Config**: `config`, `Config`
- **Logging**: `logger`, `createLogger`, `LogLevel`
- **Errors**: `AppError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`, `isAppError`, `getErrorMessage`, `formatErrorForLog`, `wrapError`
- **Middleware**: `errorHandler`, `asyncHandler`, `requestLogger`
- **Validation**: `validate`, `validators`, `ValidationSchema`
- **Rate Limiting**: `createRateLimiter`, `defaultRateLimiter`
- **AI/ML**: `OpenAIClient`
- **Safety**: `calculateConfidenceScore`, `determineActionGating`, `confidenceScore`, `shouldActOnResult`
- **Security**: `redactSecrets`, `redactSecretsWithStats`, `redactObject`, `isForbiddenField`, `containsSecrets`, `detectSecretTypes`, `createCustomRedactor`, `RedactionResult`
- **Prompts**: `buildSystemPrompt`, `buildAnalysisPrompt`, `formatEvent`, `formatEvidence`, `formatLogs`, `formatMetrics`, `formatGitHistory`, `formatKnowledgeDocs`, `estimateTokens`, `truncateEvidence`
- **UI Helpers**: `getConfidenceLabel`, `getConfidenceLabelParenthesized`, `getConfidenceColor`, `getConfidenceEmoji`, `truncateText`
- **Array Utils**: `deduplicateByKey`, `containsAny`, `startsWithAny`, `shouldExcludePath`, `groupBy`, `takeMatching`
- **CI Formatters**: `collectCIErrors`, `formatDependencyChange`, `formatDependencyChanges`, `CIAnnotation`, `CITestFailure`, `DependencyChange`
- **Types**: All event, evidence, LLM analysis, action proposal, and validation types (see `packages/shared/src/index.ts` for complete list)
- **Constants**: All constants exported from `constants.ts` (error codes, thresholds, patterns, etc.)

## Code Generation Rules

### ✅ DO

- Check `packages/shared/src/index.ts` first
- Import from `@kenchi/shared`
- Add shared code to `packages/shared/src/`
- Update `packages/shared/src/index.ts` when adding exports
- Follow existing patterns

### ❌ DON'T

- Create local utilities in services
- Duplicate types or interfaces
- Copy-paste code between services
- Create local error classes
- Re-implement existing functionality

## File-Specific Guidelines

### For Cursor AI

**See `.cursor/rules/kenchi-standards.mdc` file** - Cursor automatically reads this file for Kenchi-specific coding standards and rules.

### For Claude AI

**See `.claude/CLAUDE.md` file** - Reference this when working with Claude for project context and coding standards.

### For Codex AI

**See `.codex/CODEX.md` file** - Codex reads these rules for Kenchi-specific constraints and guidelines.

### For Other AI Tools

**See `docs/CODE_ORGANIZATION.md`** - Comprehensive code organization guide for understanding the codebase structure.

## Detection Tools

### Run Duplication Check

```bash
npm run check:duplication
```

This script detects:

- Duplicate logger creation
- Duplicate type definitions
- Duplicate error classes
- Local utils/helpers imports
- Other duplication patterns

### Manual Checks

```bash
# Check for duplicate loggers
grep -r "createLogger" services/ --exclude-dir=node_modules

# Check for duplicate types
grep -r "interface.*Config" services/ --exclude-dir=node_modules

# Check for local utils
find services -type d -name "utils" -o -name "helpers"
```

## Common Patterns

### ✅ Correct Pattern

```typescript
import { logger, config, errorHandler, asyncHandler, type WebhookEvent } from "@kenchi/shared";

app.post(
  "/endpoint",
  asyncHandler(async (req, res) => {
    logger.info("Processing request");
    // Service logic
  })
);
```

### ❌ Incorrect Pattern

```typescript
// DON'T create local logger
const logger = createLogger('service');

// DON'T duplicate types
interface WebhookEvent { ... }

// DON'T import from local utils
import { logger } from './utils/logger';
```

## Decision Tree

```
Need to add functionality?
│
├─ Is it used by multiple services?
│  ├─ YES → Add to packages/shared/src/
│  └─ NO → Is it service-specific?
│     ├─ YES → Add to services/*/src/
│     └─ NO → Re-evaluate (might be shared)
│
└─ Does similar code exist?
   ├─ YES → Import from @kenchi/shared
   └─ NO → Add to shared package first
```

## Resources

- **Architecture**: `docs/ARCHITECTURE.md`
- **System Design**: `docs/SYSTEM_ARCHITECTURE.md`
- **Code Organization**: `docs/CODE_ORGANIZATION.md`
- **Shared Exports**: `packages/shared/src/index.ts`

## Summary

**Key Principles:**

1. **Single Source of Truth**: `packages/shared/` contains all shared code
2. **Zero Duplication**: Never duplicate code across services
3. **Check First**: Always check shared package before creating new code
4. **Import, Don't Copy**: Always import from `@kenchi/shared`
5. **Update Exports**: Always update `packages/shared/src/index.ts` when adding shared code

**Remember**: The folder structure is a guide, but the shared package is the constraint. Always check it first, always use it, never duplicate.
