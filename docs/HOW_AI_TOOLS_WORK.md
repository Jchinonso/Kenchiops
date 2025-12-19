# How AI Tools Discover and Use Documentation

This document explains how different AI tools (Cursor AI, Claude, GitHub Copilot, etc.) discover and use the Kenchi project documentation and rules.

## Overview

Different AI tools have different mechanisms for discovering project context:

1. **Cursor AI**: Automatically reads `.cursorrules` file
2. **Claude**: Can reference documentation files when provided context
3. **GitHub Copilot**: May use certain files as context
4. **Other tools**: Manual reference or configuration needed

## Cursor AI

### How It Works

**Cursor AI automatically reads `.cursorrules` file** in the project root. This happens:

- ✅ When you open the project in Cursor
- ✅ When you use Cursor's AI features (Composer, Chat, inline suggestions)
- ✅ When generating code with Cursor
- ✅ Automatically - no manual setup needed

### What Gets Included

The `.cursorrules` file is **always included in the AI context** when:

- You use Cursor's chat feature
- You use Cursor's Composer (code generation)
- You use inline code suggestions
- You ask Cursor to modify code

### Best Practices for `.cursorrules`

1. **Put critical rules at the top** - Cursor reads the entire file, but important rules should be prominent
2. **Reference other docs** - You can reference other documentation files in `.cursorrules`
3. **Keep it updated** - As the project evolves, update `.cursorrules` to reflect current architecture
4. **Be specific** - Clear, actionable rules work better than vague guidelines

### Example from Our Project

Our `.cursorrules` file:

- ✅ References `docs/CODE_ORGANIZATION.md`
- ✅ References `packages/shared/src/index.ts`
- ✅ Lists all available shared exports
- ✅ Provides code examples
- ✅ Includes a checklist for code generation

## Claude AI

### How It Works

**Claude does NOT automatically read project files.** You need to:

1. **Provide context manually** - Copy/paste relevant docs into the conversation
2. **Reference files** - Tell Claude to read specific files
3. **Use `.claude-config.md`** - This is a reference file, not automatically read

### Methods to Use Documentation with Claude

#### Method 1: Direct Reference

```
"Before coding, please read:
- docs/CODE_ORGANIZATION.md
- packages/shared/src/index.ts
- .claude-config.md"
```

#### Method 2: Copy Documentation

Copy relevant sections from:

- `docs/CODE_ORGANIZATION.md`
- `docs/AI_TOOL_GUIDELINES.md`
- `.claude-config.md`

#### Method 3: Use Claude's File Reading

If Claude has file access:

```
"Please read the .claude-config.md file in the project root"
```

### Best Practices for Claude

1. **Start conversations with context** - Provide the relevant docs at the start
2. **Reference `.claude-config.md`** - This file is designed for Claude
3. **Remind Claude periodically** - If working on a long task, remind it of the rules
4. **Use the guidelines** - Reference `docs/AI_TOOL_GUIDELINES.md` for quick reference

## GitHub Copilot

### How It Works

**GitHub Copilot may use certain files as context**, but it's less reliable than Cursor:

- May read `.cursorrules` if present
- May use nearby files as context
- May use comments in code
- **Not guaranteed** to read documentation files

### Best Practices for Copilot

1. **Add comments in code** - Copilot uses code comments as context
2. **Keep `.cursorrules`** - Copilot may reference it
3. **Use inline documentation** - Document architecture in code comments
4. **Provide context in prompts** - When using Copilot Chat, provide context

### Example Code Comments

```typescript
// IMPORTANT: Always import from @kenchi/shared
// See docs/CODE_ORGANIZATION.md for rules
// Available exports: packages/shared/src/index.ts
import { logger, config } from "@kenchi/shared";
```

## Other AI Tools

### General Approach

Most AI tools **do NOT automatically read documentation**. You need to:

1. **Manually provide context** - Copy/paste relevant docs
2. **Reference files** - Tell the tool to read specific files
3. **Use system prompts** - Some tools allow system prompts that can reference docs

### Tools That May Support Auto-Discovery

- **Continue.dev**: May read `.cursorrules` or similar
- **Codeium**: May use project context
- **Tabnine**: May use nearby files

**Check each tool's documentation** for how it handles project context.

## Ensuring Documentation is Read

### Strategy 1: Put Critical Info in `.cursorrules`

Since Cursor automatically reads this, put the most important rules here:

```markdown
# .cursorrules

## MANDATORY: Read These First

1. packages/shared/src/index.ts - Available exports
2. docs/CODE_ORGANIZATION.md - Code organization rules
3. docs/AI_TOOL_GUIDELINES.md - Quick reference
```

### Strategy 2: Reference Docs in Code Comments

Add comments that reference documentation:

```typescript
/**
 * IMPORTANT: Before modifying this file, read:
 * - docs/CODE_ORGANIZATION.md
 * - packages/shared/src/index.ts
 *
 * Always import from @kenchi/shared, never duplicate code.
 */
```

### Strategy 3: Create a README for AI Tools

Create `AI_README.md` in the root that AI tools might discover:

```markdown
# AI Assistant Instructions

Before writing code, read:

1. docs/CODE_ORGANIZATION.md
2. packages/shared/src/index.ts
3. .cursorrules

Rules:

- Always import from @kenchi/shared
- Never duplicate code
- Check shared package first
```

### Strategy 4: Use Project-Specific Prompts

When starting a conversation with an AI tool, provide this prompt:

```
"I'm working on the Kenchi project. Before writing any code, please:
1. Read docs/CODE_ORGANIZATION.md
2. Check packages/shared/src/index.ts for available exports
3. Follow the zero-duplication policy
4. Always import from @kenchi/shared"
```

## Current Project Setup

### What We Have

1. **`.cursorrules`** ✅
   - Automatically read by Cursor AI
   - Contains critical rules and references to docs

2. **`.claude-config.md`** ✅
   - Reference file for Claude
   - Needs to be manually referenced

3. **`docs/CODE_ORGANIZATION.md`** ✅
   - Comprehensive guide
   - Referenced in `.cursorrules`

4. **`docs/AI_TOOL_GUIDELINES.md`** ✅
   - Quick reference
   - Referenced in `.cursorrules`

### How Each Tool Uses Them

| Tool      | .cursorrules | .claude-config.md | docs/         | Auto-Read? |
| --------- | ------------ | ----------------- | ------------- | ---------- |
| Cursor AI | ✅ Yes       | ❌ No             | ✅ Referenced | ✅ Yes     |
| Claude    | ⚠️ Maybe     | ✅ Reference      | ⚠️ Manual     | ❌ No      |
| Copilot   | ⚠️ Maybe     | ❌ No             | ❌ No         | ⚠️ Partial |
| Others    | ⚠️ Maybe     | ❌ No             | ❌ No         | ❌ No      |

## Recommendations

### For Cursor AI Users

✅ **You're all set!** Cursor automatically reads `.cursorrules`, which references all the important docs.

### For Claude Users

1. **Start conversations with context:**

   ```
   "I'm working on the Kenchi project. Please read:
   - .claude-config.md
   - docs/CODE_ORGANIZATION.md
   - packages/shared/src/index.ts"
   ```

2. **Reference docs periodically** during long conversations

3. **Use the guidelines** from `docs/AI_TOOL_GUIDELINES.md`

### For Other AI Tools

1. **Manually provide context** at the start of conversations
2. **Copy relevant sections** from documentation
3. **Reference files** explicitly
4. **Use code comments** to provide context

## Summary

- **Cursor AI**: ✅ Automatically reads `.cursorrules` - you're covered!
- **Claude**: ⚠️ Needs manual reference to `.claude-config.md` and docs
- **Other tools**: ⚠️ Need manual context or configuration

**Best practice**: Always start AI conversations with a reference to the relevant documentation, even if the tool claims to auto-read files.
