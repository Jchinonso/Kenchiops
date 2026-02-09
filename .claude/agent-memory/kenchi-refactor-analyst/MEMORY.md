# Kenchi Refactor Analyst Memory

## Audit: Function Size & File Size (2026-02-09)

### Key Findings

- 30 functions exceed 50 lines across packages/shared/src/
- 18 of those 30 have deep nesting (3+ levels)
- Worst offenders: `createQueue` (156 lines), `parseTestFailures` (146 lines), `middleware` (101 lines)
- 50+ implementation files exceed 300 lines; see `function-size-audit.md` for details

### Patterns Observed

- Validation functions are consistently oversized (storeValidation.ts, riskRules/validation.ts) due to repetitive field-by-field validation -- could use schema-based validation or validation rule arrays
- RAG module (`rag/`) has the highest density of oversized functions (search, ingestion, driftDetection, testCaseSeeding, governance)
- Rate limiting module (`rateLimit/`) has significant complexity with deep nesting in middleware and geo restriction
- Queue processing (`messageQueue.ts`) has the single largest function -- `createQueue` at 156 lines -- which is a factory returning an object with multiple inner functions
- Types files are very large (rag/types.ts at 1492 lines, rateLimit/types.ts at 1331 lines) -- consider splitting by subdomain

### Recurring Anti-patterns

1. Try/catch blocks adding 1-2 levels of nesting to already-nested code
2. Functions that build return objects with many similar branches (repeated result shapes in slackResolutionDetector, prFixCommentDetector)
3. Sequential recursive patterns used in place of simple for-of loops (testCaseSeeding, driftDetection)
4. Factory functions that define many inner functions instead of extracting them to module scope

See `function-size-audit.md` for the full detailed report.
