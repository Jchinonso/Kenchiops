# Language-Agnostic Hardening Plan

## Purpose

Make the CI analysis pipeline language-agnostic end-to-end while keeping current product behavior stable. This plan identifies language-specific assumptions, proposes a configuration-driven approach, and defines phases, acceptance criteria, and tests.

## Scope

In scope:

- Evidence collection and parsing (logs, test failures, file references)
- Prompt inputs and output parsing
- PR comment and Slack formatting
- Configuration for language-specific heuristics

Out of scope:

- GitHub/Slack integrations and auth
- Core LLM provider selection
- RAG ingestion beyond CI failure analysis

## Current State (Inventory)

Language-specific or framework-specific heuristics exist in these areas:

1. Log parsing and test failure extraction

- `services/github-app/src/services/context/logParser.ts`
  - `UNIVERSAL_FAILURE_PATTERNS` includes pytest/Go/Rust/Jest style patterns.
  - `ERROR_END_MARKERS` includes Jest and Go markers.
  - `normalizeTestFailure()` assumes pytest/Jest path formats.
  - `extractFileReferenceFromText()` patterns include Python traceback style.

2. Shared test failure normalization

- `packages/shared/src/formatting/ciFormatters.ts`
  - `normalizeTestFailure()` includes pytest/Jest/Go/Rust style parsing.

3. File reference extraction and exclusions

- `packages/shared/src/constants/github.ts`
  - `FILE_REFERENCE_PATTERNS` include TS/C# and Python traceback patterns.
  - `EXCLUDED_PATH_PATTERNS` uses JS-specific test file filters (`.test.`, `.spec.`).

4. Formatters and display assumptions

- `services/github-app/src/formatters/prCommentFormatter.ts`
- `services/github-app/src/formatters/slackContentBlocks.ts`
  - Rely on normalized test failure formats and file path extraction.

## Goals

- Language neutrality: no implicit preference or bias toward a single language or framework.
- Correctness: avoid false negatives/positives caused by hard-coded patterns.
- Stability: keep outputs usable during migration.
- Configurability: support per-tenant/per-repo heuristics if needed.

## Non-Goals

- Removing all heuristics immediately (migration must be incremental).
- Perfect extraction without LLM (LLM remains primary extractor).

## Design Principles

1. LLM-first extraction; heuristics are optional and additive.
2. Preserve raw evidence. Do not discard information that the LLM could use.
3. Make heuristics configurable per tenant/repo.
4. Never hard-code test naming conventions into UX copy or formatting.
5. Fail safe: if no deterministic parse, show clean fallback without fake data.

## Proposed Architecture

### A) Language-Agnostic Configuration Layer

Introduce a shared config object (per tenant/repo) that controls heuristics:

- `excludedPathPatterns`: list of substrings/regexes
- `fileReferencePatterns`: optional list of regexes
- `testFailurePatterns`: optional list of regexes
- `errorEndMarkers`: optional list of regexes
- `testFileFilters`: allowlist or blocklist for test files

Location:

- Define in `packages/shared/src/config` and expose via `@kenchi/shared`.
- Store per-tenant overrides in DB if needed.

### B) Extraction Pipeline Refactor

Current: regex -> parsed test failures -> LLM analysis
Target: raw evidence -> LLM analysis, plus optional heuristic extraction

Proposed flow:

1. Keep raw logs/diff snippets (already done).
2. Run optional heuristic extraction if enabled by config.
3. Merge heuristic results with LLM output (LLM is authoritative; heuristics are hints).

### C) Formatter Neutrality

- Formatters should not assume specific test naming patterns.
- Avoid labels that imply framework-specific outcomes.
- Ensure location display is conditional (only show path/line when present).

## Phased Rollout

Phase 0: Inventory and instrumentation

- Add telemetry counters for extraction source (heuristic vs LLM).
- Capture false-positive rates from formatters (unknown file/line).

Phase 1: Config layer

- Add config with defaults matching current behavior.
- Allow overrides per tenant/repo.

Phase 2: Heuristic isolation

- Move regex patterns into config.
- Make `normalizeTestFailure` optional; only apply when enabled.

Phase 3: LLM-first enforcement

- Prefer LLM-provided structured data.
- Use heuristics only when LLM fails to provide a field.

Phase 4: UI consistency

- Align GitHub/Slack formatting to the same canonical fields.
- Remove any test-framework-specific phrasing.

Phase 5: Deprecation

- Deprecate language-specific defaults as confidence grows.
- Keep optional presets for popular stacks (opt-in).

## Risks

- Reduced extraction quality if heuristics are removed without strong LLM parsing.
- Increased token usage if raw logs are sent without trimming.
- Inconsistent behavior across tenants if configuration is mismanaged.

## Mitigations

- Keep safe defaults, but allow overrides.
- Add guardrails in prompt to request missing evidence.
- Maintain telemetry and evaluation tests with multi-language fixtures.

## Acceptance Criteria

- No hard-coded language-specific filters in the default path (optional only).
- All language-specific patterns are behind configuration.
- Formatters only display locations when present (no "unknown" placeholders).
- Multi-language fixtures produce consistent output across GitHub and Slack.

## Test Plan

- Add fixtures for:
  - Python (pytest, traceback)
  - Go (go test)
  - Rust (panic)
  - Java (JUnit stack trace)
  - JS/TS (Jest)
- Verify:
  - Evidence IDs are correct and cited.
  - No "unknown" locations when logs include file/line.
  - Consistent formatting across PR comments and Slack.

## Open Questions

- Do we want per-repo language presets or fully custom config?
- How much raw log content should be sent to LLM by default?
- Should we allow test files in source fetch by default?

## Next Actions

1. Implement config scaffolding in `@kenchi/shared`.
2. Move patterns from constants into config.
3. Update log parser to read from config.
4. Add multi-language fixtures and evaluation tests.
