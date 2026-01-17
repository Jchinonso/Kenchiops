# CI Log Chunking Pipeline

A multi-stage pipeline for analyzing arbitrarily large CI logs (10MB+) without exceeding LLM context limits or blowing up cost.

## Pipeline Overview

```
FULL LOG (raw, up to 10MB)
  → Stage 0: Local preprocessing (free, deterministic)
  → Stage 1: Smart chunking (free)
  → Stage 2: Cheap parallel extraction (low-cost LLM)
  → Stage 3: Deterministic aggregation (no LLM)
  → Stage 4: Final analysis (single higher-quality LLM call)
```

---

## Defaults Table

| Parameter                 | Default | Min  | Max   | Rationale                                             |
| ------------------------- | ------- | ---- | ----- | ----------------------------------------------------- |
| `target_tokens`           | 3000    | 1000 | 3500  | Balances context window usage with extraction quality |
| `max_tokens`              | 4000    | 2000 | 8000  | Hard limit prevents oversized chunks                  |
| `overlap_lines`           | 40      | 0    | 100   | Ensures context continuity at chunk boundaries        |
| `max_chunks`              | 100     | 10   | 500   | Safety cap prevents runaway processing on huge logs   |
| `max_artifacts_per_chunk` | 20      | 5    | 50    | Limits extraction noise from verbose logs             |
| `extraction_timeout_ms`   | 10000   | 5000 | 30000 | Allows for slow LLM responses without blocking        |
| `extraction_concurrency`  | 5       | 1    | 20    | Balances throughput with rate limits                  |
| `max_final_artifacts`     | 25      | 10   | 100   | Keeps final analysis prompt focused                   |
| `chunk_failure_threshold` | 0.5     | 0.1  | 0.9   | Abort if >50% chunks fail extraction                  |
| `small_log_threshold`     | 3500    | 1000 | 5000  | Skip chunking for logs that fit in one context        |

---

## Edge Cases (Mandatory Handling)

### 1. All chunk extractions fail

**Expected behavior:** Abort with error, do not attempt fallback analysis.

```typescript
// Pipeline returns:
{
  aborted: true,
  abortReason: "All chunk extractions failed",
  results: [...failedResults]
}
```

The caller should present a user-facing error indicating log analysis failed.

### 2. More than 50% of chunks fail

**Expected behavior:** Abort with error, return structured error response with failure counts.

```typescript
// checkAggregationViability returns:
"Chunk failure rate 60.0% exceeds threshold 50.0%";

// Pipeline should NOT proceed to final analysis
```

### 3. Zero artifacts extracted but chunks succeeded

**Expected behavior:** Proceed to final analysis with empty artifacts; analyzer returns category=unknown, confidence=low.

```typescript
// Aggregated evidence:
{
  artifacts: [],
  totalExtracted: 0,
  chunksProcessed: 10,
  chunksFailed: 0
}

// Final analysis returns:
{
  root_cause: {
    summary: "Build failed with exit code 1 but no specific errors were extracted",
    detail: "The log was processed successfully but contained no recognizable error patterns.",
    evidence_ids: []
  },
  confidence: "low",
  category: "unknown",
  phase: "unknown",
  annotations: [],
  next_steps: [
    { action: "Check full build logs manually", reason: "No errors were automatically detected", safe: true, priority: 1 },
    { action: "Verify log format is supported", reason: "Some CI platforms use non-standard formats", safe: true, priority: 2 }
  ]
}
```

### 4. Log is smaller than small_log_threshold tokens

**Expected behavior:** Skip stages 1-3, send sanitized log directly to a simplified final analyzer.

```typescript
const chunkingResult = chunkLog(sanitizedContent, options);

if (chunkingResult.skippedChunking) {
  // Single chunk returned, can send directly to final analyzer
  // or use existing buildAnalysisPrompt for backward compatibility
}
```

### 5. Single stack trace exceeds max_tokens

**Expected behavior:** Treat as protected zone; if still too large, truncate from middle keeping first 50 and last 50 lines.

The `truncateOversizedZone` function handles this automatically:

```typescript
// Input: 500-line stack trace
// Output: First 50 lines + "[200 lines truncated from middle of stack trace]" + Last 50 lines
```

### 6. Repeated identical test failures

**Expected behavior:** Deduplicate by signature, track occurrence_count, final analyzer notes the repetition.

```typescript
// 10 identical test failures across 5 chunks become:
{
  ...artifact,
  occurrenceCount: 10,  // Tracked for analytics
  firstOccurrenceChunk: 0  // Points to earliest occurrence
}

// Final analyzer can reference: "This test failed 10 times across multiple runs"
```

---

## Example End-to-End Flow

### 1. Sample pytest failure log chunk (~40 lines)

```
============================= test session starts ==============================
platform linux -- Python 3.11.0, pytest-7.4.0, pluggy-1.0.0
rootdir: /home/runner/work/myapp/myapp
plugins: cov-4.1.0, asyncio-0.21.0
collected 45 items

tests/test_auth.py::test_login_success PASSED                            [  2%]
tests/test_auth.py::test_login_invalid_password PASSED                   [  4%]
tests/test_auth.py::test_login_expired_token FAILED                      [  6%]

=================================== FAILURES ===================================
_____________________________ test_login_expired_token _____________________________

    def test_login_expired_token():
        token = create_expired_token("user@example.com")
        response = client.post("/auth/verify", json={"token": token})
>       assert response.status_code == 401
E       AssertionError: assert 200 == 401
E        +  where 200 = <Response [200]>.status_code

tests/test_auth.py:45: AssertionError
=========================== short test summary info ============================
FAILED tests/test_auth.py::test_login_expired_token - AssertionError: assert 200 == 401
============================= 1 failed, 2 passed in 1.23s ==============================
```

### 2. Extractor output for that chunk (JSON)

```json
[
  {
    "evidence_id": "chunk#0:L10-L10",
    "type": "test_failure",
    "severity": "error",
    "file_path": "tests/test_auth.py",
    "line_number": 45,
    "test_name": "test_login_expired_token",
    "test_suite": "test_auth",
    "expected": "401",
    "actual": "200",
    "error_code": null,
    "error_message": "AssertionError: assert 200 == 401",
    "snippet": "E       AssertionError: assert 200 == 401\nE        +  where 200 = <Response [200]>.status_code",
    "snippet_line_start": 17,
    "framework": "pytest",
    "confidence": "high"
  },
  {
    "evidence_id": "chunk#0:L21-L21",
    "type": "ci_boundary",
    "severity": "error",
    "error_message": "FAILED tests/test_auth.py::test_login_expired_token",
    "snippet": "FAILED tests/test_auth.py::test_login_expired_token - AssertionError: assert 200 == 401",
    "snippet_line_start": 21,
    "confidence": "high"
  }
]
```

### 3. Aggregation processing (assuming 3 chunks with some duplicate errors)

**Input:** 3 chunks with these artifacts:

- Chunk 0: 2 artifacts (test_failure, ci_boundary)
- Chunk 1: 1 artifact (duplicate test_failure - same test, same assertion)
- Chunk 2: 1 artifact (generic_error from log noise)

**Deduplication:**

```typescript
// Signature for test_failure: "type:test_failure|file:tests/test_auth.py|line:45|test:test_login_expired_token"
// Hash: "a1b2c3d4e5f67890"

// Duplicate detected in chunk 1 - increment count instead of adding
```

**After deduplication:**

- 3 unique artifacts (test_failure with count=2, ci_boundary with count=1, generic_error with count=1)

**Ranking:**
| Artifact | Type | Priority | First Chunk | Final Order |
|----------|------|----------|-------------|-------------|
| ci_boundary | ci_boundary | 8 | 0 | 1 |
| test_failure | test_failure | 5 | 0 | 2 |
| generic_error | generic_error | 2 | 2 | 3 |

**Aggregated Evidence:**

```typescript
{
  artifacts: [rankedCiBoundary, rankedTestFailure, rankedGenericError],
  totalExtracted: 4,
  duplicatesRemoved: 1,
  chunksProcessed: 3,
  chunksFailed: 0,
  primaryFailureType: "ci_boundary",
  detectedFramework: "pytest",
  detectedCIPlatform: "github_actions"
}
```

### 4. Final analyzer output (JSON)

```json
{
  "root_cause": {
    "summary": "Test test_login_expired_token fails because expired token verification returns 200 instead of 401",
    "detail": "The authentication endpoint incorrectly accepts an expired JWT token, returning HTTP 200 OK when it should return HTTP 401 Unauthorized. This suggests the token expiration check in the verify endpoint is not working correctly.",
    "evidence_ids": ["chunk#0:L10-L10", "chunk#0:L21-L21"]
  },
  "confidence": "high",
  "category": "test",
  "phase": "test",
  "annotations": [
    {
      "file_path": "tests/test_auth.py",
      "line_number": 45,
      "message": "Assertion failed: expected 401 Unauthorized but got 200 OK for expired token",
      "evidence_id": "chunk#0:L10-L10",
      "severity": "error"
    }
  ],
  "next_steps": [
    {
      "action": "Check the token expiration validation logic in the /auth/verify endpoint",
      "reason": "The endpoint accepts tokens that should be rejected as expired",
      "safe": true,
      "priority": 1
    },
    {
      "action": "Verify the JWT library's exp claim validation is enabled",
      "reason": "Some JWT libraries require explicit expiration checking",
      "safe": true,
      "priority": 2
    },
    {
      "action": "Run pytest -xvs tests/test_auth.py::test_login_expired_token to reproduce locally",
      "reason": "Reproducing the failure locally will help debug the issue",
      "safe": true,
      "priority": 3
    }
  ],
  "secondary_findings": [],
  "test_failures": [
    {
      "test_name": "test_login_expired_token",
      "test_suite": "test_auth",
      "file_path": "tests/test_auth.py",
      "line_number": 45,
      "expected": "401",
      "actual": "200",
      "error_message": "AssertionError: assert 200 == 401",
      "evidence_id": "chunk#0:L10-L10"
    }
  ],
  "metadata": {
    "analysis_version": "2.0.0",
    "chunks_processed": 3,
    "artifacts_analyzed": 3,
    "model_used": "sonnet",
    "processing_time_ms": 1250
  }
}
```

---

## Prompts

### CHUNK_EXTRACTOR_PROMPT (copy-ready)

```
You are a CI log artifact extractor. Your ONLY job is to extract structured error information from log chunks.

RULES:
1. Extract ONLY what is explicitly present in the text
2. NO reasoning, NO speculation, NO guessing
3. Return a JSON array of artifacts (NOT wrapped in an object)
4. Return empty array [] if nothing found
5. Line numbers are relative to the chunk (1-indexed)
6. Never invent file paths or test names not present in the text

ARTIFACT TYPES TO EXTRACT:
- infra_killer: OOM, SIGKILL, timeout, disk full, network unreachable
- ci_boundary: ##[error], exit code lines, "Process completed with exit code"
- stack_trace: Exceptions with stack frames
- test_failure: Assertion failures with test names
- compiler_error: file:line:column errors from compilers
- lint_error: Linter output (eslint, pylint, rubocop, etc.)
- generic_error: Unclassified lines containing "error"/"Error"/"ERROR"

REQUIRED FIELDS FOR EACH ARTIFACT:
{
  "evidence_id": "chunk#{{chunk_id}}:L<start>-L<end>",
  "type": "<artifact_type>",
  "severity": "fatal|error|warning",
  "error_message": "<the error text>",
  "snippet": "<verbatim 1-3 lines>",
  "snippet_line_start": <line number in chunk, 1-indexed>,
  "confidence": "high|medium|low"
}

OPTIONAL FIELDS (include ONLY if explicitly present):
- file_path: Only if a file path appears in the text
- line_number: Only if a line number appears
- column: Only if a column number appears
- test_name: For test failures only
- test_suite: For test failures only
- expected: For assertion failures
- actual: For assertion failures
- error_code: If an error code is present
- framework: Only if explicitly detected

CONFIDENCE LEVELS:
- high: Explicit error marker (##[error], Error:, FAIL, etc.)
- medium: Pattern match (file:line:col format, stack frame)
- low: Heuristic (contains "error" word)

INPUT VARIABLES:
- {{chunk_id}}: Integer chunk identifier
- {{line_offset}}: Absolute line number where chunk starts
- {{chunk_text}}: The sanitized chunk content
- {{framework_hint}}: Optional detected framework
- {{ci_platform_hint}}: Optional detected CI platform

OUTPUT: JSON array only. No markdown, no backticks, no explanation.
```

### FINAL_ANALYZER_PROMPT (copy-ready)

```
You are an expert CI/CD failure analyst. You analyze pre-extracted error artifacts from CI logs to determine root cause.

Your job is to:
1. Identify the ROOT CAUSE - the earliest causal error that explains subsequent failures
2. Cite ONLY evidence IDs that exist in the provided artifacts
3. Follow causal ordering: dependency > build > test > deploy > runtime
4. Infrastructure killers (OOM, SIGKILL, timeout) ALWAYS override other root causes
5. Provide safe, actionable next steps

CRITICAL RULES:
- ONLY cite evidence_ids from the provided artifacts - NEVER invent IDs
- Infra killers are ALWAYS root cause when present
- Empty artifacts = category "unknown", confidence "low"
- Output ONLY valid JSON - no markdown, no backticks, no prose

INPUT VARIABLES:
- {{aggregated_artifacts_json}}: JSON array of ranked artifacts
- {{build_metadata_json}}: JSON object with build context
- {{exit_code}}: The process exit code
- {{total_chunks}}: Number of chunks processed
- {{failed_chunks}}: Number of chunks that failed extraction

OUTPUT SCHEMA:
{
  "root_cause": {
    "summary": "One sentence describing the earliest causal error",
    "detail": "2-3 sentences explaining why this is the root cause",
    "evidence_ids": ["chunk#0:L15-L20", "chunk#1:L5-L10"]
  },
  "confidence": "high|medium|low",
  "category": "dependency|build|test|deploy|runtime|infra|unknown",
  "phase": "dependency|build|test|deploy|runtime|unknown",
  "annotations": [...],
  "next_steps": [...],
  "secondary_findings": [...],
  "test_failures": [...],
  "lint_errors": [...],
  "metadata": {...}
}

CAUSAL ORDERING (respect this priority):
1. infra_killer (priority 10): OOM, SIGKILL, timeout - ALWAYS root cause
2. ci_boundary (priority 8): Exit codes, ##[error] markers
3. stack_trace (priority 6): Exceptions with frames
4. compiler_error (priority 5): Build/compile failures
5. test_failure (priority 5): Test assertions
6. lint_error (priority 4): Linter violations
7. generic_error (priority 2): Unclassified errors

EMPTY ARTIFACTS:
If no artifacts provided, set:
- category: "unknown"
- confidence: "low"
- root_cause: Describe what is known from metadata
- annotations: []
- next_steps: Suggest checking full logs
```

---

## Modification Summary

### Existing Functions Modified

1. **logPreprocessor.ts** - Added imports for new constants
   - Added `LINE_COLLAPSE_CONFIG` and `PROGRESS_INDICATOR_PATTERNS` imports
   - All changes are additive, no existing behavior modified

2. **prompts.ts** - Added new chunking pipeline functions
   - Added imports for `AggregatedEvidence`, `BuildMetadata`, `RankedArtifact` types
   - Added `buildAnalysisFromArtifacts` function (new, does not modify existing)
   - Added `FINAL_ANALYZER_PROMPT_TEMPLATE` constant (new)
   - Added `validateAnalysisEvidenceIds` function (new)
   - Added `extractValidEvidenceIds` function (new)
   - **Existing `buildAnalysisPrompt` is unchanged** for backward compatibility

### New Functions Created

**Stage 0 (logPreprocessor.ts):**

- `collapseRepeatedLines(text, options?)` - Collapses identical consecutive lines
- `removeProgressIndicators(text, options?)` - Strips progress bars and spinners
- `sanitizeForChunking(rawLogs)` - Full sanitization pipeline for chunking

**Stage 1 (logChunking.ts):**

- `estimateTokens(text)` - Token count estimation
- `estimateTokensForLines(lines)` - Token count for line array
- `detectCIPlatform(content)` - CI platform detection
- `detectProtectedZones(lines)` - Protected zone detection
- `findNaturalBoundaries(lines, platform)` - Natural split point detection
- `chunkLog(content, options?)` - Main chunking function
- `normalizeChunkingOptions(options?)` - Options normalization

**Stage 2 (chunkExtractor.ts):**

- `buildChunkExtractorSystemPrompt()` - System prompt builder
- `buildChunkExtractorPrompt(chunk, frameworkHint?, ciPlatformHint?)` - User prompt builder
- `parseExtractionResponse(response, chunkId, maxArtifacts?)` - Response parser
- `normalizeExtractionOptions(options?)` - Options normalization
- `extractFromChunk(chunk, extractor, options)` - Single chunk extraction
- `extractFromAllChunks(chunks, extractor, options?)` - Batch extraction

**Stage 3 (artifactAggregator.ts):**

- `computeArtifactSignature(artifact)` - Async signature computation
- `computeArtifactSignatureSync(artifact)` - Sync signature computation
- `computeAbsoluteEvidenceId(artifact, chunkLineOffset)` - Line offset computation
- `computePriorityScore(type)` - Priority score lookup
- `createRankedArtifact(artifact, chunkId, chunkLineOffset, occurrenceCount)` - Ranked artifact creation
- `deduplicateArtifacts(extractionResults, chunkLineOffsets)` - Deduplication
- `sortArtifactsByPriority(artifacts)` - Priority sorting
- `detectCommonFramework(artifacts)` - Framework detection
- `aggregateArtifacts(batchResult, chunks, maxArtifacts?, detectedPlatform?)` - Main aggregation
- `checkAggregationViability(batchResult, threshold?)` - Viability check
- `createEmptyAggregatedEvidence(chunksProcessed?, chunksFailed?, detectedPlatform?)` - Empty result creator

### Backward Compatibility Confirmation

All changes are **100% backward compatible**:

1. **No existing function signatures changed** - All existing functions work identically
2. **No existing exports removed** - All existing exports remain available
3. **No existing return types changed** - All existing functions return the same types
4. **New functions use optional parameters** - Default values maintain existing behavior
5. **New types are additive** - No existing type definitions modified

### New Exports Added

**constants/index.ts:**

- All chunking pipeline constants and types

**formatting/index.ts:**

- All Stage 0, 1, 2, 3 functions and types

**integrations/index.ts:**

- `buildAnalysisFromArtifacts`
- `FINAL_ANALYZER_PROMPT_TEMPLATE`
- `validateAnalysisEvidenceIds`
- `extractValidEvidenceIds`
