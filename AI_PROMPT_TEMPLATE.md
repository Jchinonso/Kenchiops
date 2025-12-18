# AI Prompt Template

Copy and paste this prompt at the start of conversations with AI tools to ensure they read the project documentation.

## For Claude / ChatGPT / Other AI Tools

```
I'm working on the Kenchi TypeScript monorepo project. Before writing any code, please:

1. Read and understand these files:
   - .claude/Claude.md - Senior-level TypeScript & Node.js coding standards (READ THIS FIRST!)
   - .cursorrules - Project architecture and rules
   - docs/CODE_ORGANIZATION.md - Code organization and duplication prevention rules
   - docs/AI_TOOL_GUIDELINES.md - Quick reference guide
   - packages/shared/src/index.ts - Available shared exports

2. Follow these critical rules:
   - ALWAYS check packages/shared/src/index.ts before creating new utilities
   - ALWAYS import from @kenchi/shared, NEVER duplicate code
   - NEVER create local utilities in services - use shared package
   - If functionality doesn't exist in shared package, add it there first
   - Update packages/shared/src/index.ts when adding new shared code

3. Architecture:
   - packages/shared/ contains ALL shared code (utilities, types, middleware, clients)
   - services/*/ contains ONLY service-specific code (routes, handlers, business logic)
   - Zero duplication policy - single source of truth is packages/shared/

Please confirm you've read and understood these rules before proceeding with any code generation.
```

## For Cursor AI (Optional - .cursorrules is auto-read)

Cursor AI automatically reads `.cursorrules`, but you can still reference it:

```
Before coding, please review:
- .cursorrules (already loaded automatically)
- docs/CODE_ORGANIZATION.md
- packages/shared/src/index.ts

Remember: Always import from @kenchi/shared, never duplicate code.
```

## Quick Reference Prompt

For shorter conversations:

```
Kenchi project rules:
- Check packages/shared/src/index.ts first
- Import from @kenchi/shared, never duplicate
- See docs/CODE_ORGANIZATION.md for details
```

## Verification Prompt

To verify the AI tool understands:

```
Can you confirm:
1. Where should shared utilities go? (packages/shared/)
2. Where should service-specific code go? (services/*/)
3. What should I do before creating a new utility? (Check packages/shared/src/index.ts)
4. What's the zero-duplication policy? (Always import from @kenchi/shared)
```

