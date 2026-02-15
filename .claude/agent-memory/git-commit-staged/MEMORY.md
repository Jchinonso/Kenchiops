# Git Commit Agent Memory

## Commit-msg Hook Rules

- The repo has a commit-msg hook that rejects messages containing "Claude" (case-insensitive).
- File paths like `.claude/CLAUDE.md` are explicitly allowed by the hook, but references like "CLAUDE.md compliance" in prose text are NOT -- the hook does a broad match.
- Workaround: reference the rule by number (e.g., "project Rule 2") instead of mentioning the config file by name.

## Pre-commit Hook Pipeline

The pre-commit hook runs in this order:

1. `tsc --build --force` (type check)
2. `check-duplication.ts` (shared package usage)
3. `check-standards.js` (coding standards)
4. `prettier --check` (formatting)
5. `lint-staged` (eslint --fix + prettier --write on staged files)

If prettier's `--check` fails, fix with `npx prettier --write <file>` before re-committing.

## Conventional Commit Style in This Repo

- Recent commits use: `refactor(scope):`, `feat(scope):`, `chore:`, `docs(scope):`
- Scopes seen: `llm`, `queue`, `shared`, `database`, `safety`, `github-app`, `api`, `slack`
- Body uses bullet lists with `-` prefix for multi-item changes
- Arrow notation (`->`) preferred over unicode arrows in commit bodies (commit-msg hook may interfere with special chars)
