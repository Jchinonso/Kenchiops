# Full-Log CI Failure Analysis Pipeline

## Technical Specification Document

**Version:** 1.1  
**System Type:** Backend API  
**Target Audience:** DevOps Engineers, LLM Systems Engineers

---

## Table of Contents

1. Executive Summary
2. Problem Statement
3. Solution Architecture
4. Existing Infrastructure
5. Stage 0: Preprocessing
6. Stage 1: Smart Chunking
7. Stage 2: Cheap Extraction
8. Stage 3: Aggregation
9. Stage 4: Final Analysis
10. TypeScript Interfaces
11. Prompts
12. Configuration Defaults
13. Edge Case Handling
14. Example End-to-End Flow
15. Deliverables Checklist

---

## 1. Executive Summary

This document specifies a multi-stage pipeline for analyzing arbitrarily large CI logs (up to 10MB+) without exceeding LLM context limits or incurring excessive costs. The pipeline guarantees complete coverage through deterministic chunking, parallel extraction, and intelligent aggregation.

The system outputs stable JSON contracts for downstream consumers including Slack/GitHub renderers, storage systems, search indices, and analytics platforms. No UI logic, formatting, or markdown appears in outputs.

---

## 2. Problem Statement

### 2.1 Core Challenges

CI platforms present several fundamental challenges for comprehensive log analysis:

**Log Truncation:** CI platform UIs truncate logs, hiding critical failure information that may appear deep within build output.

**Context Limits:** Even when full logs are retrieved via APIs, they routinely exceed LLM context limits (often 10MB+ for complex builds).

**Naive Truncation Failures:** Simple truncation strategies miss critical failures that may appear anywhere in the log, not just at the end.

**Cost Explosion:** Sending everything to a large-context model is prohibitively expensive at scale.

### 2.2 Business Impact

Without comprehensive log analysis, development teams face extended debugging cycles as engineers manually search through truncated logs, missed root causes leading to repeated failures and wasted CI compute, inconsistent failure categorization making it difficult to track reliability metrics, and high operational costs from either manual analysis or expensive LLM calls.

---

## 3. Solution Architecture

### 3.1 Overview

The pipeline implements a deterministic, multi-stage approach that progressively distills raw logs into structured analysis:

| Stage | Name             | Cost               | Purpose                                          |
| ----- | ---------------- | ------------------ | ------------------------------------------------ |
| 0     | Preprocessing    | Free (local)       | Sanitize, compress, and build line mapping       |
| 1     | Smart Chunking   | Free (local)       | Split into bounded, context-preserving chunks    |
| 2     | Cheap Extraction | Low-cost LLM       | Extract structured facts in parallel             |
| 3     | Aggregation      | Free (local)       | Deduplicate, rank, and determine primary failure |
| 4     | Final Analysis   | Higher-quality LLM | Determine root cause and recommendations         |

### 3.2 Data Flow

The pipeline processes data through the following stages:

**Stage 0 - Local Preprocessing:** Strip ANSI codes and timestamps, redact secrets (mandatory), collapse repeated lines, remove progress indicators, and build line mapping table for annotation correction. Goal is 50-80% size reduction.

**Stage 1 - Smart Chunking:** Token estimation targeting approximately 3000 tokens per chunk, protected zone detection to preserve atomic units, natural boundary splitting at CI step transitions, and 40-line overlap between chunks.

**Stage 2 - Cheap Parallel Extraction:** Uses Haiku or GPT-4o-mini with 5 parallel requests to extract structured artifacts. Performs extraction only with no reasoning.

**Stage 3 - Deterministic Aggregation:** No LLM involved. Performs SHA-256 signature deduplication with optional discriminator, priority-weighted ranking, causality-aware primary failure determination, and selects top 25 artifacts.

**Stage 4 - Final Analysis:** Uses Sonnet or GPT-4o for root cause determination, actionable recommendations, and structured JSON output. Includes fallback mode for degraded operation.

---

## 4. Existing Infrastructure

The following functions already exist in the codebase and must be reused without modification.

### 4.1 Text Sanitization Module

**Location:** src/utils/textSanitization.ts

| Function               | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| stripAnsiCodes         | Remove ANSI escape sequences from log output  |
| stripCITimestamps      | Remove CI platform timestamp prefixes         |
| stripCIGroupMarkers    | Remove CI group formatting markers            |
| redactSecretsWithStats | Redact sensitive values and return statistics |

### 4.2 Anchor Selection Module

**Location:** src/analysis/anchorSelection.ts

| Function       | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| findBestAnchor | Locate the most relevant failure anchor point in logs |

### 4.3 Build Analysis Module

**Location:** src/analysis/buildAnalysis.ts

| Function            | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| buildAnalysisPrompt | Legacy prompt builder (maintain for backward compatibility) |

---

## 5. Stage 0: Preprocessing

**Location:** src/utils/textSanitization.ts  
**Cost:** Free (local execution)  
**Goal:** 50-80% size reduction while preserving semantic structure

### 5.1 Existing Functions (Keep As-Is)

The existing sanitization functions handle ANSI codes, timestamps, CI group markers, and secret redaction.

**CRITICAL:** The redactSecretsWithStats function is MANDATORY and must run before any LLM call or chunking operation to prevent sensitive data leakage.

### 5.2 New Functions to Add

#### 5.2.1 collapseRepeatedLines

**Purpose:** Collapse identical consecutive lines, keeping the first N occurrences and replacing subsequent repetitions with a marker.

**Parameters:**

| Parameter      | Type   | Default                         | Description                                       |
| -------------- | ------ | ------------------------------- | ------------------------------------------------- |
| input          | string | required                        | The log text to process                           |
| maxRepeats     | number | 3                               | Maximum identical lines to keep before collapsing |
| markerTemplate | string | "[repeated {count} more times]" | Template for collapse marker                      |

**Returns:**

| Field          | Type        | Description                                     |
| -------------- | ----------- | ----------------------------------------------- |
| output         | string      | Processed text with collapsed lines             |
| collapsedCount | number      | Number of collapse operations performed         |
| originalLines  | number      | Line count before processing                    |
| resultLines    | number      | Line count after processing                     |
| lineMapping    | LineMapping | Mapping from sanitized to original line numbers |

**Behavior:** Identifies sequences of identical consecutive lines, keeps the first maxRepeats occurrences, replaces remaining occurrences with a single marker line, preserves line structure and indentation, and builds line mapping table for annotation correction.

#### 5.2.2 removeProgressIndicators

**Purpose:** Strip progress bars, spinners, download percentage lines, and similar noise that adds no diagnostic value.

**Parameters:**

| Parameter     | Type     | Default   | Description                           |
| ------------- | -------- | --------- | ------------------------------------- |
| input         | string   | required  | The log text to process               |
| patterns      | RegExp[] | see below | Additional custom patterns to match   |
| preserveFirst | boolean  | true      | Keep first occurrence of each pattern |
| preserveLast  | boolean  | true      | Keep last occurrence of each pattern  |

**Returns:**

| Field          | Type        | Description                                     |
| -------------- | ----------- | ----------------------------------------------- |
| output         | string      | Processed text with progress indicators removed |
| removedCount   | number      | Number of lines removed                         |
| patternMatches | Map         | Map of pattern names to match counts            |
| lineMapping    | LineMapping | Mapping from sanitized to original line numbers |

**Default Patterns Detected:** Progress bars like [=====> ] and ███████░░░, percentage indicators like "Downloading... 45%" and "Progress: 67/100", spinners with characters like ⠋ ⠙ ⠹ ⠸, download progress like "Receiving objects: 89% (1234/1385)", and npm/yarn progress like "[1/4] Resolving packages..."

### 5.3 Line Mapping Table (NEW)

**Purpose:** Track the relationship between sanitized line numbers and original raw log line numbers to ensure GitHub annotations point to correct locations.

**Problem Addressed:** After collapsing repeated lines and removing progress indicators, absolute line numbers no longer match raw logs. GitHub annotations may point to shifted locations.

#### 5.3.1 LineMapping Interface

The LineMapping object contains a sparse mapping from sanitized line numbers to original line numbers (sanitizedToOriginal), a reverse mapping where null indicates the line was removed (originalToSanitized), metadata including originalLineCount and sanitizedLineCount, and helper methods toOriginalLine and toSanitizedLine.

#### 5.3.2 Implementation Notes

Use sparse mapping to only store entries where transformation occurred. Compose mappings when multiple transformations are applied. Propagate mapping through chunking to final output. Apply mapping before generating GitHub annotations.

#### 5.3.3 Annotation Correction Process

When generating annotations for the AnalysisResponse, first extract line number from artifact evidence, then add chunk line_offset to get sanitized absolute line, then apply lineMapping.toOriginalLine() to get raw log line, and finally use raw log line in annotation output.

---

## 6. Stage 1: Smart Chunking

**Location:** src/analysis/chunking.ts  
**Cost:** Free (local execution)

### 6.1 Purpose

Split sanitized logs into chunks that fit within LLM context limits while preserving logical structure and maintaining traceability back to original line numbers.

### 6.2 Token Estimation

Token counting must be consistent across the entire pipeline to ensure reliable chunk sizing.

**Primary Method:** For OpenAI models use tiktoken with cl100k_base encoding. For Anthropic models use the Anthropic token counting API.

**Fallback Heuristic:** When token counting libraries are unavailable use characters divided by 3.5. Must log when fallback is used for debugging.

### 6.3 Chunking Parameters

| Parameter         | Value         | Rationale                                        |
| ----------------- | ------------- | ------------------------------------------------ |
| Target chunk size | ~3,000 tokens | Leaves headroom for extraction prompt overhead   |
| Hard maximum      | 4,000 tokens  | Prevents context overflow with safety margin     |
| Overlap           | 40 lines      | Captures context that spans chunk boundaries     |
| Safety cap        | 100 chunks    | Prevents runaway processing on pathological logs |

### 6.4 Protected Zone Detection

Protected zones are regions that must NEVER be split. The chunker must detect and preserve these atomic units.

#### 6.4.1 Stack Traces

Detection patterns include lines starting with "at " for JavaScript/Java stack frames, indented lines following "Error:" or "Exception:", Python tracebacks with "Traceback (most recent call last):" blocks, lines matching File "...", line \d+, Ruby backtraces matching from .+:\d+:in, and Go panics with goroutine \d+ [running]: blocks.

#### 6.4.2 Test Output Blocks

Detection patterns include content between "FAIL " markers and the next test or summary, Jest output with ● Test Suite › Test Name through assertion details, pytest output with FAILED tests/...::test_name through the next test marker, content between === FAILURES === and === short test summary ===, RSpec Failures: blocks, and JUnit Tests run: summary blocks.

#### 6.4.3 Compiler Error Blocks

Detection patterns include contiguous lines matching file:line:column: error, contiguous lines matching file:line:column: warning, Rust compiler error[E####]: through the next blank line, TypeScript TS####: error blocks, and Go # package/path followed by error lines.

#### 6.4.4 CI Groups

Detection patterns include GitHub Actions content between ##[group] and ##[endgroup], GitLab CI content between section_start:timestamp:name and section_end:timestamp:name, Azure Pipelines ##[section] markers, and CircleCI #!/bin/bash script blocks.

### 6.5 Natural Boundary Detection

When splitting is necessary outside protected zones, the chunker prefers these natural boundaries in priority order.

**Priority 1 - CI Step Transitions:** GitHub Actions lines starting with "Run " and ##[group], GitLab CI section_start: and $ command, Jenkins [Pipeline] markers.

**Priority 2 - Test Suite Boundaries:** pytest === separator lines and collecting ... lines, Jest PASS/FAIL markers and Test Suites: summary, Generic lines matching ^-{3,}$ or ^={3,}$.

**Priority 3 - Blank Line Separators:** Multiple consecutive blank lines (2+), blank lines followed by indentation change.

**Priority 4 - Log Level Transitions:** Changes between INFO/WARN/ERROR levels, timestamp discontinuities (>1 second gap).

### 6.6 Functions to Implement

**detectProtectedZones:** Identify all protected zones in the log that must not be split. Takes log text and optional configuration. Returns array of ProtectedZone objects.

**findNaturalBoundaries:** Identify preferred split points in the log. Takes log text and previously detected protected zones. Returns array of line numbers representing safe split points sorted by preference.

**chunkLog:** Main chunking function that orchestrates the chunking process. Takes log text and ChunkingOptions object. Returns array of ChunkResult objects. Algorithm: detect all protected zones, identify natural boundaries, estimate total tokens, if under small_log_threshold return single chunk, otherwise iteratively split at boundaries respecting protected zones, add overlap regions between adjacent chunks, track absolute line offsets for each chunk, enforce safety cap on total chunks.

**estimateTokens:** Consistent token counting across the pipeline. Takes text and model/encoding configuration. Returns estimated token count as integer.

### 6.7 ChunkResult Output Interface

Each chunk must include:

| Field            | Type    | Description                                         |
| ---------------- | ------- | --------------------------------------------------- |
| chunk_id         | integer | Sequential identifier (0-indexed)                   |
| content          | string  | The chunk text                                      |
| line_offset      | integer | Absolute line number where chunk starts (1-indexed) |
| line_count       | integer | Number of lines in this chunk                       |
| estimated_tokens | integer | Token count for this chunk                          |
| protected_zones  | array   | Protected zones found within this chunk             |
| boundary_type    | enum    | One of: natural, forced, overlap                    |

---

## 7. Stage 2: Cheap Extraction

**Location:** src/analysis/chunkExtractor.ts  
**Cost:** Low-cost LLM (Claude Haiku or GPT-4o-mini class)

### 7.1 Purpose

Use a cheap, fast LLM to extract structured facts from each chunk. This stage performs extraction only—no reasoning, no conclusions, no speculation.

### 7.2 Model Selection

| Model          | Provider  | Use Case                          |
| -------------- | --------- | --------------------------------- |
| Claude 3 Haiku | Anthropic | Default for Anthropic deployments |
| GPT-4o-mini    | OpenAI    | Default for OpenAI deployments    |

Model selection should be configurable via environment variable or constructor parameter.

### 7.3 Artifact Types

The extractor must recognize and categorize the following artifact types:

| Type           | Priority | Description             | Example Patterns                                          |
| -------------- | -------- | ----------------------- | --------------------------------------------------------- |
| infra_killer   | 10       | Infrastructure failures | OOM, SIGKILL, timeout, disk full, network unreachable     |
| ci_boundary    | 8        | CI error markers        | ##[error], exit codes, "Process completed with exit code" |
| stack_trace    | 6        | Exceptions with frames  | Exception class + stack frames                            |
| test_failure   | 5        | Test assertions         | Assertion failures with test names                        |
| compiler_error | 5        | Compilation errors      | file:line:column errors from compilers                    |
| lint_error     | 4        | Linter output           | eslint, pylint, rubocop, etc.                             |
| generic_error  | 2        | Unclassified errors     | Lines containing "error"/"Error"/"ERROR"                  |

### 7.4 Extracted Artifact Fields

Each extracted artifact must include the following fields:

| Field              | Type    | Required | Description                                                      |
| ------------------ | ------- | -------- | ---------------------------------------------------------------- |
| evidence_id        | string  | Yes      | Format: chunk#[id]:L[start]-L[end]                               |
| type               | enum    | Yes      | One of the artifact types above                                  |
| severity           | enum    | Yes      | One of: fatal, error, warning                                    |
| file_path          | string  | No       | Only if explicitly present in log                                |
| line_number        | integer | No       | Only if explicitly present                                       |
| column             | integer | No       | Only if explicitly present                                       |
| test_name          | string  | No       | For test failures only                                           |
| test_suite         | string  | No       | For test failures only                                           |
| expected           | string  | No       | For assertion failures, null if ambiguous                        |
| actual             | string  | No       | For assertion failures, null if ambiguous                        |
| error_code         | string  | No       | If present (e.g., TS2304, E0001)                                 |
| error_message      | string  | Yes      | The error text                                                   |
| snippet            | string  | Yes      | Verbatim 1-3 lines from the chunk                                |
| snippet_line_start | integer | Yes      | Line number within chunk (1-indexed)                             |
| framework          | string  | No       | Only if explicitly detected                                      |
| confidence         | enum    | Yes      | high (explicit marker), medium (pattern), low (heuristic)        |
| assertion_hash     | string  | No       | NEW: Normalized hash of assertion text for high-confidence dedup |

### 7.5 Execution Rules

#### 7.5.1 Parallelization

Run extractions in parallel using Promise.allSettled (never fail fast). Default concurrency is 5 parallel requests. Configurable via extraction_concurrency parameter.

#### 7.5.2 Timeout Handling

Timeout per chunk is 10 seconds. On timeout retry once with 5-second delay. After retry failure mark chunk as failed and continue with remaining chunks.

#### 7.5.3 Failure Thresholds

If more than 50% of chunks fail, abort entire pipeline with error. Do NOT fall back to alternative analysis methods unless degraded mode is enabled. Return structured error response with failure counts.

#### 7.5.4 Extraction Discipline

Extract ONLY what is explicitly present in the text. No inference, no path guessing, no normalization. Line numbers are relative to the chunk (caller adds offset later). If nothing is found, return empty array (not an error). Maximum artifacts per chunk is 20 (configurable).

### 7.6 ExtractionResult Output Interface

| Field              | Type    | Description                  |
| ------------------ | ------- | ---------------------------- |
| chunk_id           | integer | Matches input chunk ID       |
| artifacts          | array   | Array of extracted artifacts |
| extraction_time_ms | integer | Processing time              |
| model_used         | string  | Model identifier used        |
| success            | boolean | Whether extraction completed |
| error              | string  | Error message if failed      |

---

## 8. Stage 3: Aggregation

**Location:** src/analysis/artifactAggregator.ts  
**Cost:** Free (no LLM calls)

### 8.1 Purpose

Deterministically merge and rank artifacts from all chunks. This stage uses pure algorithmic processing with no LLM involvement.

### 8.2 Signature Computation

Each artifact receives a unique signature for deduplication.

**Primary Hash Components:** type (artifact type), file_path (lowercased, if present), line_number (if present), error_code (if present), test_name (lowercased, if present).

**Optional Discriminator (NEW):** When confidence equals high, include additional discriminator to prevent over-merging. Use assertion_hash (normalized hash of assertion text). This handles edge cases where same test_name fails for different reasons in same file.

**Excluded from Hash:** snippet (too variable due to context differences), error_message (minor wording variations), confidence (metadata, not content).

**Algorithm:** Concatenate hash components with delimiter. If confidence equals high AND assertion_hash exists, append to components. Compute SHA-256 hash. Take first 16 characters as signature. Store original components for debugging.

### 8.3 Deduplication Rules

First, group all artifacts by signature hash. On collision (same signature), keep the artifact from the earliest chunk (first occurrence), increment occurrence_count on the kept artifact, and preserve the original chunk_id of first occurrence. Track total duplicates removed for statistics.

### 8.4 Priority Weights

Artifacts are ranked by type priority:

| Type           | Weight | Rationale                          |
| -------------- | ------ | ---------------------------------- |
| infra_killer   | 10     | Always the root cause when present |
| ci_boundary    | 8      | Official CI failure markers        |
| stack_trace    | 6      | Direct evidence of crashes         |
| compiler_error | 5      | Build-blocking errors              |
| test_failure   | 5      | Test-blocking errors               |
| lint_error     | 4      | Quality issues, rarely root cause  |
| generic_error  | 2      | Catch-all, lowest signal           |

### 8.5 Sorting Algorithm

Artifacts are sorted by primary key priority_score descending (highest priority first) and secondary key first_occurrence_chunk ascending (earlier chunks first, as they are more likely causal).

### 8.6 Selection

After sorting, select the top N artifacts. Default is 25 artifacts. Configurable via max_final_artifacts parameter. Include occurrence counts for duplicates.

### 8.7 Primary Failure Determination (ENHANCED)

**Problem Addressed:** Simple "highest priority type" can be misleading when infra OOM occurs after test failure spam, CI retries produce infra noise, or cascading failures obscure root cause.

**Solution:** Replace simple type with causality-aware primary failure object.

#### 8.7.1 PrimaryFailure Interface (NEW)

The PrimaryFailure object contains: type (ArtifactType), confidence (high, medium, or low), reason (string explaining determination), evidence_id (supporting evidence), and override_allowed (boolean indicating if final analyzer can override).

#### 8.7.2 Determination Algorithm

**Step 1 - Check for infra_killer in first 20% of chunks:** If found, set confidence to high and override_allowed to false with reason "Infrastructure failure in early pipeline stage".

**Step 2 - Check for infra_killer after test failures:** If infra_killer appears only in chunks AFTER test_failure chunks, set confidence to medium and override_allowed to true with reason "Infrastructure failure may be secondary to test issues".

**Step 3 - Check for causal ordering violations:** If dependency errors appear after build errors, flag as suspicious. Set confidence to low and override_allowed to true with reason "Causal ordering unclear; multiple failure types present".

**Step 4 - Default case:** Use highest priority type from earliest chunk. Set confidence to high if single failure type, medium if multiple. Set override_allowed to true for medium confidence.

### 8.8 AggregatedEvidence Output Interface (UPDATED)

| Field                | Type           | Description                                        |
| -------------------- | -------------- | -------------------------------------------------- |
| artifacts            | array          | Ranked array of RankedArtifact objects             |
| total_extracted      | integer        | Count before deduplication                         |
| duplicates_removed   | integer        | Count of duplicates merged                         |
| chunks_processed     | integer        | Total chunks that were processed                   |
| chunks_failed        | integer        | Chunks that failed extraction                      |
| primary_failure      | PrimaryFailure | NEW: Causality-aware primary failure determination |
| detected_framework   | string         | Framework if consistently detected                 |
| detected_ci_platform | string         | CI platform if detected                            |
| line_mapping         | LineMapping    | NEW: For annotation correction                     |

### 8.9 Determinism Guarantee

**CRITICAL:** Aggregation MUST be deterministic. Identical input must produce byte-for-byte identical output. This enables reproducible debugging, cached results, and test assertions.

---

## 9. Stage 4: Final Analysis

**Location:** src/analysis/buildAnalysis.ts  
**Cost:** Higher-quality LLM (Claude Sonnet or GPT-4o)

### 9.1 Purpose

Synthesize the aggregated artifacts into a coherent root cause analysis with actionable recommendations.

### 9.2 Backward Compatibility

Keep the existing buildAnalysisPrompt function unchanged for systems still using the legacy single-pass approach.

### 9.3 New Functions

#### 9.3.1 buildAnalysisFromArtifacts

**Purpose:** Construct the prompt for the final analyzer from aggregated evidence.

**Parameters:** evidence (AggregatedEvidence object from Stage 3), metadata (BuildMetadata object with CI context).

**Returns:** Formatted prompt string for the final analyzer.

#### 9.3.2 analyzeFromArtifacts

**Purpose:** Execute the final analysis and return structured results.

**Parameters:** evidence (AggregatedEvidence object), metadata (BuildMetadata object), options (model selection and timeout configuration).

**Returns:** AnalysisResponse object matching the schema below.

### 9.4 Build Metadata Interface

The BuildMetadata object provides CI context:

| Field            | Type    | Required | Description                                                   |
| ---------------- | ------- | -------- | ------------------------------------------------------------- |
| repo             | string  | Yes      | Repository name (e.g., owner/repo)                            |
| branch           | string  | Yes      | Branch name                                                   |
| commit_sha       | string  | Yes      | Full commit SHA (40 characters)                               |
| workflow_name    | string  | No       | CI workflow name                                              |
| job_name         | string  | No       | CI job name                                                   |
| ci_platform      | enum    | Yes      | One of: github_actions, gitlab_ci, jenkins, circleci, unknown |
| exit_code        | integer | Yes      | Process exit code                                             |
| duration_seconds | integer | No       | Build duration                                                |
| triggered_by     | string  | No       | Trigger type (push, PR, schedule, etc.)                       |
| run_url          | string  | No       | Link to CI run                                                |

### 9.5 Analysis Response Schema

The final analyzer must return JSON matching this exact schema. **DO NOT MODIFY THIS SCHEMA** as downstream consumers depend on it.

#### 9.5.1 Root Fields

| Field              | Type    | Description                                              |
| ------------------ | ------- | -------------------------------------------------------- |
| root_cause         | object  | Primary failure explanation                              |
| confidence         | enum    | high, medium, or low                                     |
| category           | enum    | dependency, build, test, deploy, runtime, infra, unknown |
| phase              | string  | Pipeline phase (e.g., "npm install", "pytest")           |
| annotations        | array   | File annotations for IDE/GitHub                          |
| next_steps         | array   | Recommended actions                                      |
| secondary_findings | array   | Additional issues found                                  |
| test_failures      | array   | Optional: detailed test failures                         |
| lint_errors        | array   | Optional: detailed lint errors                           |
| metadata           | object  | Analysis metadata                                        |
| degraded_mode      | boolean | NEW: True if fallback analysis was used                  |

#### 9.5.2 root_cause Object

| Field        | Type   | Description              |
| ------------ | ------ | ------------------------ |
| summary      | string | One sentence summary     |
| detail       | string | 2-3 sentence explanation |
| evidence_ids | array  | Referenced evidence IDs  |

#### 9.5.3 annotations Array Items

| Field                | Type    | Description                               |
| -------------------- | ------- | ----------------------------------------- |
| file_path            | string  | File to annotate                          |
| line_number          | integer | Line number in source file                |
| original_line_number | integer | NEW: Raw log line number for traceability |
| message              | string  | Annotation message                        |
| evidence_id          | string  | Supporting evidence                       |
| severity             | enum    | error or warning                          |

#### 9.5.4 next_steps Array Items

| Field    | Type    | Description                  |
| -------- | ------- | ---------------------------- |
| action   | string  | What to do                   |
| reason   | string  | Why it helps                 |
| safe     | boolean | Whether action is reversible |
| priority | integer | 1 (highest) to 5 (lowest)    |

#### 9.5.5 secondary_findings Array Items

| Field        | Type   | Description             |
| ------------ | ------ | ----------------------- |
| summary      | string | Finding description     |
| evidence_ids | array  | Supporting evidence     |
| severity     | enum   | error, warning, or info |

#### 9.5.6 test_failures Array Items (Optional)

| Field         | Type    | Description         |
| ------------- | ------- | ------------------- |
| test_name     | string  | Test name           |
| test_suite    | string  | Suite name          |
| file_path     | string  | Test file           |
| line_number   | integer | Line number         |
| expected      | string  | Expected value      |
| actual        | string  | Actual value        |
| error_message | string  | Failure message     |
| evidence_id   | string  | Supporting evidence |

#### 9.5.7 lint_errors Array Items (Optional)

| Field       | Type    | Description         |
| ----------- | ------- | ------------------- |
| file_path   | string  | File path           |
| line_number | integer | Line number         |
| column      | integer | Column number       |
| rule        | string  | Lint rule ID        |
| message     | string  | Error message       |
| evidence_id | string  | Supporting evidence |

#### 9.5.8 metadata Object

| Field              | Type    | Description                    |
| ------------------ | ------- | ------------------------------ |
| analysis_version   | string  | Pipeline version               |
| chunks_processed   | integer | Number of chunks               |
| artifacts_analyzed | integer | Number of artifacts            |
| model_used         | string  | Model identifier               |
| processing_time_ms | integer | Total processing time          |
| degraded_mode      | boolean | NEW: Whether fallback was used |

**CRITICAL:** All evidence_ids referenced in the response MUST exist in the provided artifacts. Never invent evidence.

---

## 10. TypeScript Interfaces

### 10.1 Chunking Interfaces

**ChunkingOptions:** targetTokens (default 3000), maxTokens (default 4000), overlapLines (default 40), maxChunks (default 100), smallLogThreshold (default 2000), model (openai or anthropic).

**ChunkResult:** chunk_id (number), content (string), line_offset (1-indexed number), line_count (number), estimated_tokens (number), protected_zones (ProtectedZone array), boundary_type (natural, forced, or overlap).

**ProtectedZone:** type (stack_trace, test_output, compiler_error, or ci_group), startLine (1-indexed number), endLine (1-indexed inclusive number), content (string), framework (optional string).

**LineMapping (NEW):** sanitizedToOriginal (Map of number to number), originalToSanitized (Map of number to number or null), originalLineCount (number), sanitizedLineCount (number), toOriginalLine method, toSanitizedLine method.

### 10.2 Extraction Interfaces

**ExtractedArtifact:** evidence_id (string), type (ArtifactType), severity (fatal, error, or warning), file_path (optional string), line_number (optional number), column (optional number), test_name (optional string), test_suite (optional string), expected (optional string), actual (optional string), error_code (optional string), error_message (string), snippet (string), snippet_line_start (number), framework (optional string), confidence (high, medium, or low), assertion_hash (NEW: optional string).

**ArtifactType:** infra_killer, ci_boundary, stack_trace, test_failure, compiler_error, lint_error, or generic_error.

**ExtractionResult:** chunk_id (number), artifacts (ExtractedArtifact array), extraction_time_ms (number), model_used (string), success (boolean), error (optional string).

**ExtractionOptions:** model (optional string), timeout (optional number), maxArtifactsPerChunk (optional number), concurrency (optional number).

### 10.3 Aggregation Interfaces

**ArtifactSignature:** hash (string), components object containing type (string), file_path (optional string), line_number (optional number), error_code (optional string), test_name (optional string), assertion_hash (NEW: optional string).

**RankedArtifact:** extends ExtractedArtifact with signature (ArtifactSignature), priority_score (number), occurrence_count (number), first_occurrence_chunk (number), absolute_line_start (number), absolute_line_end (number), original_line_start (NEW: number), original_line_end (NEW: number).

**PrimaryFailure (NEW):** type (ArtifactType), confidence (high, medium, or low), reason (string), evidence_id (string), override_allowed (boolean).

**AggregatedEvidence:** artifacts (RankedArtifact array), total_extracted (number), duplicates_removed (number), chunks_processed (number), chunks_failed (number), primary_failure (NEW: PrimaryFailure replacing primary_failure_type), detected_framework (optional string), detected_ci_platform (optional string), line_mapping (NEW: LineMapping).

### 10.4 Analysis Interfaces

**BuildMetadata:** repo (string), branch (string), commit_sha (string), workflow_name (optional string), job_name (optional string), ci_platform (github_actions, gitlab_ci, jenkins, circleci, or unknown), exit_code (number), duration_seconds (optional number), triggered_by (optional string), run_url (optional string).

**AnalysisResponse:** root_cause object with summary, detail, and evidence_ids. confidence (high, medium, or low). category (dependency, build, test, deploy, runtime, infra, or unknown). phase (string). annotations array with file_path, line_number, original_line_number (NEW), message, evidence_id, and severity. next_steps array with action, reason, safe, and priority. secondary_findings array with summary, evidence_ids, and severity. test_failures optional array. lint_errors optional array. metadata object with analysis_version, chunks_processed, artifacts_analyzed, model_used, processing_time_ms, and degraded_mode (NEW). degraded_mode top-level boolean (NEW).

---

## 11. Prompts

### 11.1 Chunk Extractor Prompt

**Target Model:** Claude 3 Haiku or GPT-4o-mini

The prompt instructs the model that it is a CI log artifact extractor whose ONLY job is to extract structured facts from the log chunk. It must NOT reason, conclude, or speculate.

The prompt provides chunk context including chunk ID, line offset in original log, optional detected framework hint, and optional CI platform hint.

The prompt defines the seven artifact types to extract: infra_killer for OOM/SIGKILL/timeout/disk full/network unreachable, ci_boundary for ##[error] and exit codes, stack_trace for exceptions with stack frames, test_failure for assertion failures with test names, compiler_error for file:line:column errors, lint_error for linter output, and generic_error for unclassified error lines.

For each artifact the prompt specifies extraction of evidence_id in format chunk#[id]:L[start]-L[end], type, severity (fatal/error/warning), file_path only if explicitly present, line_number only if explicitly present, column only if explicitly present, test_name for test_failure only, test_suite for test_failure only, expected and actual for assertions with null if ambiguous, error_code if present, error_message, snippet of verbatim 1-3 lines, snippet_line_start as 1-indexed line within chunk, framework only if explicitly detected, confidence level, and assertion_hash for test failures with clear assertion text.

Confidence levels are defined as high for explicit error markers like ##[error] or FAILED or Error:, medium for pattern matches like stack traces or file:line:col, and low for heuristic detection of generic "error" keywords.

Assertion_hash rules specify it is only for test_failure artifacts with clear assertion text, normalize by lowercase and removing whitespace and quotes, hash the normalized "expected != actual" pattern, which helps distinguish same test failing for different reasons.

The rules state to extract ONLY what is explicitly present, do NOT invent file paths or test names, do NOT guess or infer missing information, line numbers are relative to THIS CHUNK (1-indexed), return empty array if nothing found, maximum 20 artifacts per chunk, and output ONLY valid JSON array with no markdown and no explanation.

### 11.2 Final Analyzer Prompt

**Target Model:** Claude 3 Sonnet or GPT-4o

The prompt instructs the model that it is a senior DevOps engineer analyzing CI build failures and should synthesize the extracted artifacts into a root cause analysis.

The prompt provides build context including build metadata JSON, exit code, chunks processed count, chunks failed count, and degraded mode flag.

The prompt includes the primary failure determination with the PrimaryFailure JSON and notes that if override_allowed is true and the analyzer has strong evidence for a different root cause, it may override but must explain reasoning.

The prompt provides the extracted artifacts ranked by priority.

Analysis requirements specify six areas. For root cause determination: identify the single primary cause of failure, follow causal ordering of dependency then build then test then deploy then runtime, infrastructure killers ALWAYS override other causes UNLESS they appear late in the log after other failures, and cite evidence_ids that exist in the artifacts.

For category selection: dependency for package/module installation failures, build for compilation/transpilation/bundling failures, test for test assertion or test infrastructure failures, deploy for deployment step failures, runtime for application runtime errors, infra for infrastructure issues like OOM/network/disk, and unknown when cannot determine from evidence.

For confidence levels: high for clear evidence with single obvious cause, medium when evidence supports conclusion but some ambiguity exists, and low for limited evidence with multiple possible causes.

For annotations: only annotate files that appear in the artifacts, use exact file paths from evidence, include both line_number and original_line_number, and provide actionable messages.

For next steps: prioritize safe reversible actions, be specific and actionable, and order by priority where 1 is highest.

For secondary findings: report other issues that did not cause the failure, and include warnings and potential future problems.

The output schema specifies root_cause with summary (one sentence), detail (2-3 sentences), and evidence_ids array. confidence as high/medium/low. category as one of the defined values. phase as pipeline phase string. annotations array with file_path, line_number, original_line_number, message, evidence_id, and severity. next_steps array with action, reason, safe boolean, and priority 1-5. secondary_findings array with summary, evidence_ids, and severity. test_failures array if applicable. lint_errors array if applicable. metadata with analysis_version, chunks_processed, artifacts_analyzed, model_used, processing_time_ms, and degraded_mode. degraded_mode top-level boolean.

Rules state that ALL evidence_ids MUST exist in the provided artifacts, NEVER invent evidence or file paths, if artifacts array is empty set category to unknown and confidence to low, output ONLY valid JSON with no markdown and no explanation, respect causal ordering when multiple failure types present, and if overriding primary_failure determination explain reasoning in root_cause.detail.

---

## 12. Configuration Defaults

| Parameter               | Default | Min   | Max    | Rationale                                                     |
| ----------------------- | ------- | ----- | ------ | ------------------------------------------------------------- |
| target_tokens           | 3,000   | 1,000 | 3,500  | Leaves room for prompt overhead in extraction                 |
| max_tokens              | 4,000   | 2,000 | 8,000  | Hard limit prevents context overflow                          |
| overlap_lines           | 40      | 10    | 100    | Captures cross-boundary context without excessive duplication |
| max_chunks              | 100     | 20    | 500    | Safety cap prevents runaway on pathological logs              |
| max_artifacts_per_chunk | 20      | 5     | 50     | Limits extraction cost per chunk                              |
| extraction_timeout_ms   | 10,000  | 5,000 | 30,000 | Balances reliability with responsiveness                      |
| extraction_concurrency  | 5       | 1     | 20     | Balances throughput with rate limits                          |
| max_final_artifacts     | 25      | 10    | 100    | Keeps final analysis focused                                  |
| chunk_failure_threshold | 0.5     | 0.3   | 0.8    | 50% failure triggers abort                                    |
| small_log_threshold     | 2,000   | 500   | 5,000  | Logs below this skip chunking                                 |
| enable_degraded_mode    | true    | -     | -      | NEW: Allow fallback analysis on total failure                 |
| degraded_mode_lines     | 500     | 100   | 1000   | NEW: Lines to sample in degraded mode                         |

---

## 13. Edge Case Handling

### 13.1 All Chunk Extractions Fail

**Scenario:** Every chunk extraction times out or returns an error.

**Expected Behavior (UPDATED with Degraded Mode):**

If enable_degraded_mode is false: Abort pipeline immediately, do NOT attempt fallback analysis, return structured error response with error "extraction_failed", message "All chunk extractions failed", chunks_attempted count, chunks_failed count, and failure_rate of 1.0.

If enable_degraded_mode is true (NEW): Activate degraded fallback mode. Skip chunking entirely. Extract top N lines and bottom N lines from sanitized log where N equals degraded_mode_lines divided by 2. Send directly to final analyzer with degraded_mode flag set to true. Mark confidence as low. Explicitly flag in response that this is degraded mode analysis.

**Rationale for Degraded Mode:** One bad vendor outage should not kill all insight. The sanitized logs still exist. Preserving some value is better than returning nothing, as long as the degraded status is clearly communicated.

### 13.2 More Than 50% of Chunks Fail

**Scenario:** 8 out of 15 chunks fail extraction.

**Expected Behavior:**

Abort pipeline (failure rate exceeds threshold). Return structured error response with error "excessive_failures", message "Chunk failure rate exceeded threshold", chunks_attempted count, chunks_succeeded count, chunks_failed count, failure_rate, threshold, and partial_artifacts array.

### 13.3 Zero Artifacts Extracted (Chunks Succeeded)

**Scenario:** All chunks processed successfully but no artifacts found.

**Expected Behavior:**

Proceed to final analysis with empty artifacts array. Analyzer returns category as unknown, confidence as low, root_cause.summary as "No explicit errors found in logs", and next_steps with generic debugging suggestions.

### 13.4 Log Smaller Than small_log_threshold

**Scenario:** Sanitized log is only 1,500 tokens.

**Expected Behavior:**

Skip Stages 1-3 entirely. Send sanitized log directly to simplified final analyzer. Use single-pass analysis prompt. Preserve all response schema guarantees.

### 13.5 Single Stack Trace Exceeds max_tokens

**Scenario:** A Python traceback with deep recursion is 5,000 tokens.

**Expected Behavior:**

Treat entire stack trace as protected zone. If still exceeds limit after protection: keep first 50 lines (error message + top frames), keep last 50 lines (bottom frames + final error), insert marker [... truncated N lines ...]. Log warning about truncation.

### 13.6 Repeated Identical Test Failures

**Scenario:** Same test fails 10 times across different chunks (e.g., retry logic).

**Expected Behavior:**

Deduplication merges by signature. Single artifact retained with occurrence_count of 10. Final analyzer notes "Test failed 10 times across multiple retries". Only one entry in test_failures array.

### 13.7 Same Test Fails for Different Reasons (NEW)

**Scenario:** test_user_creation fails with "duplicate key" in chunk 2 and "timeout" in chunk 5.

**Expected Behavior:**

With enhanced signature including assertion_hash, these are treated as distinct artifacts. Both artifacts appear in final output. Final analyzer can identify that the same test has multiple failure modes. This prevents over-merging that would lose diagnostic information.

---

## 14. Example End-to-End Flow

### 14.1 Sample pytest Failure Log Chunk

The sample log shows a FAILURES section with test_user_creation failing due to AssertionError where user.id is None instead of not None at tests/test_users.py line 42. Captured stdout shows "Creating user with email: test@example.com", "Database connection established", "ERROR: Duplicate key violation on users.email", and "Rolling back transaction". A second test test_user_deletion fails with AssertionError "User should exist" at tests/test_users.py line 58. The short test summary shows both tests as FAILED with 2 failed total.

### 14.2 Extractor Output for This Chunk

The extractor produces three artifacts.

First artifact has evidence_id "chunk#3:L5-L12", type "test_failure", severity "error", file_path "tests/test_users.py", line_number 42, test_name "test_user_creation", test_suite "tests/test_users.py", expected "not None", actual "None", error_message "AssertionError: assert None is not None", snippet showing the assert line and error, snippet_line_start 7, framework "pytest", confidence "high", and assertion_hash "a7f3b2c1" for the normalized assertion.

Second artifact has evidence_id "chunk#3:L14-L15", type "generic_error", severity "error", error_message "Duplicate key violation on users.email", snippet "ERROR: Duplicate key violation on users.email", snippet_line_start 14, and confidence "medium".

Third artifact has evidence_id "chunk#3:L19-L24", type "test_failure", severity "error", file_path "tests/test_users.py", line_number 58, test_name "test_user_deletion", test_suite "tests/test_users.py", expected "not None", actual "None", error_message "AssertionError: User should exist", snippet showing assert and error, snippet_line_start 21, framework "pytest", confidence "high", and assertion_hash "b8e4c3d2" for the normalized assertion.

### 14.3 Aggregation (Assuming 3 Chunks with Duplicates)

**Input:** 3 chunks with 6 total artifacts. Chunk 1 has 2 artifacts (infra setup errors). Chunk 2 has 1 artifact (same duplicate key error). Chunk 3 has 3 artifacts (shown above).

**Aggregation Process:** Total artifacts is 6. Signature computation identifies duplicate key error in chunks 2 and 3. Duplicate merged keeping chunk 2 occurrence (earlier). Priority sorting applied. Primary failure determination runs. Top 25 selected (all 5 unique in this case).

**Primary Failure Determination:** test_failure artifacts appear in chunks 1 and 3. No infra_killer in first 20% of chunks. Single failure type dominates. Result: type is test_failure, confidence is high, reason is "Test failures are the primary failure type with no preceding infrastructure issues", evidence_id is "chunk#3:L5-L12", override_allowed is true.

**Output:** artifacts array contains 5 ranked artifacts. total_extracted is 6. duplicates_removed is 1. chunks_processed is 3. chunks_failed is 0. primary_failure contains the PrimaryFailure object. detected_framework is "pytest". detected_ci_platform is "github_actions". line_mapping contains the LineMapping object.

### 14.4 Final Analyzer Output

The response has root_cause with summary "Database duplicate key constraint violation causing user creation test to fail", detail explaining the test_user_creation failure due to duplicate email constraint violation indicating test isolation issues or missing database reset with test_user_deletion failing as cascading effect, and evidence_ids referencing chunk#2:L8-L9 and chunk#3:L5-L12.

confidence is "high". category is "test". phase is "pytest". degraded_mode is false.

annotations array has two entries. First for tests/test_users.py line 42 with original_line_number 242 (via line mapping), message "User creation failed - check database state and test isolation", evidence_id chunk#3:L5-L12, severity error. Second for tests/test_users.py line 58 with original_line_number 258, message "Cascading failure - user not found due to creation failure", evidence_id chunk#3:L19-L24, severity error.

next_steps array has three entries. First with priority 1: action "Add database cleanup in test fixtures using @pytest.fixture with scope='function'", reason "Ensures each test starts with a clean database state", safe true. Second with priority 2: action "Check if test database is being properly reset between CI runs", reason "Persistent test data across runs causes duplicate key violations", safe true. Third with priority 3: action "Consider using unique email generation in tests (e.g., UUID-based)", reason "Prevents collisions even if cleanup fails", safe true.

secondary_findings array has one entry with summary "test_user_deletion depends on test_user_creation succeeding", evidence_ids referencing chunk#3:L19-L24, severity warning.

test_failures array has two entries matching the test failures with all fields populated including evidence_ids.

metadata has analysis_version "1.1", chunks_processed 3, artifacts_analyzed 5, model_used "claude-3-sonnet-20240229", processing_time_ms 1847, degraded_mode false.

---

## 15. Deliverables Checklist

### 15.1 TypeScript Interfaces

| Interface          | Location                           | Status                                                         |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| ChunkingOptions    | src/analysis/chunking.ts           | Required                                                       |
| ChunkResult        | src/analysis/chunking.ts           | Required                                                       |
| ProtectedZone      | src/analysis/chunking.ts           | Required                                                       |
| LineMapping        | src/analysis/chunking.ts           | NEW Required                                                   |
| ExtractedArtifact  | src/analysis/chunkExtractor.ts     | Required (updated with assertion_hash)                         |
| ExtractionResult   | src/analysis/chunkExtractor.ts     | Required                                                       |
| ExtractionOptions  | src/analysis/chunkExtractor.ts     | Required                                                       |
| ArtifactSignature  | src/analysis/artifactAggregator.ts | Required (updated with assertion_hash)                         |
| RankedArtifact     | src/analysis/artifactAggregator.ts | Required (updated with original line numbers)                  |
| PrimaryFailure     | src/analysis/artifactAggregator.ts | NEW Required                                                   |
| AggregatedEvidence | src/analysis/artifactAggregator.ts | Required (updated with primary_failure and line_mapping)       |
| BuildMetadata      | src/analysis/buildAnalysis.ts      | Required                                                       |
| AnalysisResponse   | src/analysis/buildAnalysis.ts      | Required (updated with degraded_mode and original_line_number) |

### 15.2 Function Signatures

**Stage 0 (src/utils/textSanitization.ts):**

- collapseRepeatedLines(input, options) returns CollapseResult with lineMapping
- removeProgressIndicators(input, options) returns ProgressRemovalResult with lineMapping
- composeLineMappings(mappings) returns combined LineMapping (NEW)

**Stage 1 (src/analysis/chunking.ts):**

- detectProtectedZones(log) returns ProtectedZone array
- findNaturalBoundaries(log, protectedZones) returns number array
- chunkLog(log, options) returns ChunkResult array
- estimateTokens(text, options) returns number

**Stage 2 (src/analysis/chunkExtractor.ts):**

- extractArtifacts(chunk, options) returns Promise of ExtractionResult
- extractAllChunks(chunks, options) returns Promise of ExtractionResult array

**Stage 3 (src/analysis/artifactAggregator.ts):**

- computeSignature(artifact) returns ArtifactSignature (updated with optional discriminator)
- determinePrimaryFailure(artifacts, chunks) returns PrimaryFailure (NEW)
- aggregateArtifacts(results, chunks, lineMapping) returns AggregatedEvidence

**Stage 4 (src/analysis/buildAnalysis.ts):**

- buildAnalysisFromArtifacts(evidence, metadata) returns string
- analyzeFromArtifacts(evidence, metadata, options) returns Promise of AnalysisResponse
- analyzeDegradedMode(sanitizedLog, metadata, options) returns Promise of AnalysisResponse (NEW)

### 15.3 Prompts

| Prompt                 | Target Model        | Status                                                                    |
| ---------------------- | ------------------- | ------------------------------------------------------------------------- |
| CHUNK_EXTRACTOR_PROMPT | Haiku / GPT-4o-mini | Provided in Section 11.1 (updated with assertion_hash)                    |
| FINAL_ANALYZER_PROMPT  | Sonnet / GPT-4o     | Provided in Section 11.2 (updated with primary_failure and degraded_mode) |
| DEGRADED_MODE_PROMPT   | Sonnet / GPT-4o     | NEW Required for fallback analysis                                        |

### 15.4 Documentation

| Document                | Status                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Defaults table          | Provided in Section 12 (updated with degraded mode params)                          |
| Edge case handling      | Provided in Section 13 (updated with degraded mode and same-test-different-reasons) |
| Example end-to-end flow | Provided in Section 14 (updated with line mapping and primary_failure)              |

---

## Appendix A: CI Platform Detection Patterns

**GitHub Actions:** ##[group], ##[endgroup], ##[error], ##[warning], Run [command], Process completed with exit code.

**GitLab CI:** section_start:[timestamp]:[n], section_end:[timestamp]:[n], $ [command], ERROR: Job failed.

**Jenkins:** [Pipeline] {, [Pipeline] }, [Pipeline] stage, ERROR: script returned exit code.

**CircleCI:** #!/bin/bash -eo pipefail, Exited with code exit status.

---

## Appendix B: Severity Classification Rules

| Severity | Criteria                                                      |
| -------- | ------------------------------------------------------------- |
| fatal    | Process termination (SIGKILL, OOM), unrecoverable errors      |
| error    | Failed assertions, compilation errors, explicit error markers |
| warning  | Non-blocking issues, deprecation notices, potential problems  |

---

## Appendix C: Framework Detection Patterns

| Framework | Detection Pattern                |
| --------- | -------------------------------- |
| pytest    | ===, FAILED, test\_, conftest.py |
| Jest      | ●, PASS, FAIL, Test Suites:      |
| Mocha     | passing, failing, ✓, ✗           |
| RSpec     | examples, failures, Finished in  |
| JUnit     | Tests run:, Failures:, BUILD     |
| Go test   | --- FAIL:, --- PASS:, FAIL\t     |

---

## Appendix D: Review Adjustments Summary (v1.1)

This version incorporates four key improvements from technical review:

**1. Causality-Aware Primary Failure (Section 8.7):** Replaced simple primary_failure_type string with PrimaryFailure object containing type, confidence, reason, evidence_id, and override_allowed. Implements algorithm to detect when infra failures may be secondary to other issues.

**2. Line Mapping Table (Section 5.3):** Added LineMapping interface to track relationship between sanitized and original line numbers. Ensures GitHub annotations point to correct raw log locations after line collapse and progress indicator removal.

**3. Enhanced Signature Deduplication (Section 8.2):** Added optional assertion_hash discriminator for high-confidence artifacts. Prevents over-merging when same test fails for different reasons in same file.

**4. Degraded Mode Fallback (Section 13.1):** Added optional degraded mode that activates when all chunk extractions fail. Samples top and bottom lines from sanitized log for last-ditch analysis. Clearly flags degraded status in response.

---
