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

## Stash + Commit Gotchas

- The `prettier --check` step runs globally on ALL files, not just staged ones. If unrelated dirty files have Prettier violations, the commit will fail even if your staged files are clean.
- For Prettier failures: run `npx prettier --write <file>` on offending files in-place (don't stage them).
- **lint-staged stash contamination**: When commits fail and lint-staged restores its backup stash, the staging area can be corrupted. Unrelated files may appear staged, and target files may become unstaged.
- **Phantom commits**: lint-staged stash/restore can pop old stashes, introducing changes from previous branches/sessions. These can result in phantom commits containing unrelated code.
- **After ANY failed commit**: run `git log --oneline -3` and `git diff --cached --stat` to verify no phantom commits were created and the staging area is correct.
- **Use `git add -v`**: Silent `git add` can fail after lint-staged contamination. Always use `-v` flag to confirm files are actually being added.
- **Remove dead code before committing**: If you delete callers of a function, also remove the function itself (and its now-unused imports) to avoid lint errors.
- **Partial staging**: Ensure target files have NO unstaged changes (the staged version = working tree version). If a file shows in both staged and unstaged, lint-staged's stash will corrupt it.
- After a successful commit, always verify with `git show --stat HEAD` that only the intended files were committed.

## Conventional Commit Style in This Repo

- Recent commits use: `refactor(scope):`, `feat(scope):`, `chore:`, `docs(scope):`
- Scopes seen: `llm`, `queue`, `shared`, `database`, `safety`, `github-app`, `api`, `slack`
- Body uses bullet lists with `-` prefix for multi-item changes
- Arrow notation (`->`) preferred over unicode arrows in commit bodies (commit-msg hook may interfere with special chars)

## ESLint Rules to Watch

- **`id-denylist`**: Single-letter identifiers like `e` are banned. Use descriptive names like `clickEvent`, `keyEvent` instead.
- **Intentional eslint-disable comments**: Do NOT remove eslint-disable comments for `no-console` (ErrorBoundary), `no-new` (Notification), or `@typescript-eslint/no-non-null-assertion` (main.tsx root element) -- these are legitimate exceptions that lint-staged will reject without the disables.
- **`@typescript-eslint/no-shadow`**: Inner callback params must not shadow outer function params (e.g., `event` inside `onClick` when component receives `event` prop).
