# KenchiOps CI/CD Log Analysis

# AST Enhancement Layer — Implementation Specification

## Version 3.1 (Production-Ready)

**Expert Review Status:** Architecture validated. Core design locked in.

---

# Part I: Foundation

---

## 1. Executive Summary

### 1.1 Purpose

The AST (Abstract Syntax Tree) Enhancement Layer provides **source code ground truth** for CI/CD log analysis. It activates after the existing chunking and extraction pipeline to enrich log-derived artifacts with actual code context, enabling:

- Precise error localization (file, line, column)
- Language-aware context enrichment
- Mechanical patch candidates for limited transformations
- Cross-reference validation between log claims and actual code

### 1.2 What This System Is

> **A grounded reasoning substrate for CI/CD analysis — not "AI log analysis".**

This distinction matters. The AST layer ensures:

- Log-derived claims (Class A) are never conflated with code reality (Class B)
- The LLM cannot "upgrade" log noise into truth
- All findings are traceable to verifiable evidence
- Confidence is probabilistic, not binary

### 1.2 Upstream Dependencies

The AST layer consumes output from the existing pipeline:

| Stage         | Output               | Status            |
| ------------- | -------------------- | ----------------- |
| Stage 0-1     | Chunking             | ✅ Implemented    |
| Stage 2       | ExtractedArtifact[]  | ✅ Implemented    |
| Stage 3       | AggregatedEvidence   | ✅ Implemented    |
| **Stage 3.5** | **EnrichedEvidence** | **This Document** |
| Stage 4       | AnalysisResponse     | Downstream        |

### 1.3 Core Principles

**Principle 1: Deterministic Processing**

> AST parsing is deterministic. The same source code always produces the same AST. AST-derived facts are ground truth evidence.

**Principle 2: LLM as Narrator Only**

> The LLM is never a source of truth. The LLM is never a producer of facts. The LLM is only a narrator of verified evidence.

**Principle 3: Demand-Driven Analysis**

> Parse only files reachable from artifacts, not the entire repository. The AST layer is not a code indexer.

**Principle 4: Graceful Degradation**

> If AST analysis fails, the pipeline proceeds with log-only evidence. AST enrichment is additive, never blocking.

**Principle 5: Hermetic Execution**

> Tool versions are pinned. External network calls are controlled. Environment differences must not affect output.

### 1.4 Interface Contract

| Contract     | Description                                           |
| ------------ | ----------------------------------------------------- |
| Input        | `AggregatedEvidence` + repo metadata (SHAs, PR files) |
| Output       | `EnrichedEvidence` (extends AggregatedEvidence)       |
| Isolation    | Does not modify upstream schemas                      |
| Independence | Does not require raw logs                             |
| Bypass       | Pipeline works without AST layer                      |

### 1.5 Coupling Prevention Rules

| Rule                   | Description                                           | Enforcement       |
| ---------------------- | ----------------------------------------------------- | ----------------- |
| No raw log access      | AST consumes only artifacts + repo                    | Input validation  |
| No ID mutation         | Only append `ast_evidence_ids`, never modify existing | Schema validation |
| Schema isolation       | AggregatedEvidence unchanged                          | Type checking     |
| Graceful bypass        | On failure, emit AggregatedEvidence as-is             | Try-catch wrapper |
| No upstream dependency | Chunking works without AST                            | Integration test  |

### 1.6 Upstream Artifact Requirements

The AST layer depends on artifacts carrying certain fields. If missing, AST enrichment is limited.

**Required Fields (must exist):**

| Field                | Description                | Used By        |
| -------------------- | -------------------------- | -------------- |
| artifact.evidence_id | Unique artifact identifier | All stages     |
| artifact.type        | Artifact type              | Mode selection |
| artifact.severity    | Error severity             | Mode selection |

**Expected Fields (should exist for full enrichment):**

| Field                  | Description           | Used By              | Fallback if Missing  |
| ---------------------- | --------------------- | -------------------- | -------------------- |
| artifact.file_path     | File reference        | File resolution      | Skip file context    |
| artifact.line_number   | Line reference        | Validation, snippets | Skip line validation |
| artifact.column_number | Column reference      | Precise location     | Use line only        |
| artifact.symbol_name   | Function/class name   | Symbol validation    | Skip symbol check    |
| artifact.snippet       | Code snippet from log | Fuzzy matching       | Skip content match   |

**Upstream Enhancement (if not present):**

If current ExtractedArtifact schema lacks reliable location fields, consider adding heuristic location extraction in Stage 2:

| Heuristic      | Pattern                   | Extracts                   |
| -------------- | ------------------------- | -------------------------- |
| Compiler error | `file.ts(10,5): error`    | file, line, column         |
| Stack frame    | `at func (file.js:42:10)` | file, line, column, symbol |
| Test failure   | `FAIL tests/foo.test.ts`  | file                       |
| ESLint         | `file.ts:10:5 error`      | file, line, column         |

---

## 2. Architecture

### 2.1 AST Layer in Pipeline Context

```
        ┌─────────────────────────────────────────┐
        │   EXISTING PIPELINE (Already Built)     │
        │                                         │
        │   Stage 0-1: Chunking                   │
        │   Stage 2: Cheap Extraction             │
        │   Stage 3: Aggregation                  │
        │                                         │
        │   Output: AggregatedEvidence            │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │   NEW: AST ENHANCEMENT LAYER            │
        │   Stage 3.5 (This Document)             │
        │                                         │
        │   3.5a: File Resolution                 │
        │   3.5b: AST Parsing                     │
        │   3.5c: Deep AST Analysis               │
        │   3.5d: Context Enrichment              │
        │   3.5e: Cross-Reference Validation      │
        │                                         │
        │   Output: EnrichedEvidence              │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │   EXISTING PIPELINE (Downstream)        │
        │                                         │
        │   Stage 4: Final Analysis               │
        │   Stage 5: Output & Dispatch            │
        └─────────────────────────────────────────┘
```

### 2.2 AST Layer Internal Architecture

```
                    ┌──────────────────────────┐
                    │   AggregatedEvidence     │
                    │   + BuildMetadata        │
                    │   + PR Context           │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   MODE SELECTOR          │
                    │  • Evaluate severity     │
                    │  • Check file count      │
                    │  • Apply tenant settings │
                    │  → fast/full/full_seed   │
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────────┐
│  FAST MODE    │    │  FULL MODE        │    │  FULL_SEED_ONLY   │
│  6s budget    │    │  20s budget       │    │  12s budget       │
└───────┬───────┘    └─────────┬─────────┘    └─────────┬─────────┘
        │                      │                        │
        └──────────────────────┼────────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   STAGE 3.5a         │
                    │   FILE RESOLVER      │
                    │  • Extract seed paths│
                    │  • Normalize paths   │
                    │  • Base/head resolve │
                    │  • Fuzzy path match  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   STAGE 3.5b         │
                    │   AST PARSER         │
                    │  • Tree-sitter parse │
                    │  • Symbol extraction │
                    │  • Budget enforcement│
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   STAGE 3.5c         │
                    │   DEEP AST           │
                    │  • ts-morph (TS/JS)  │
                    │  • go/packages (Go)  │
                    │  • Type resolution   │
                    │  • Import graphs     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   STAGE 3.5d         │
                    │   CONTEXT ENRICHER   │
                    │  • Code snippets     │
                    │  • Symbol context    │
                    │  • Related symbols   │
                    │  • Import chains     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   STAGE 3.5e         │
                    │   CROSS-REF VALIDATOR│
                    │  • File exists       │
                    │  • Line bounds       │
                    │  • Fuzzy content     │
                    │  • Symbol exists     │
                    │  • Confidence adjust │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   PATCH GENERATOR    │
                    │  (Optional)          │
                    │  • Missing imports   │
                    │  • Unused imports    │
                    │  • Type-only imports │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   EVIDENCE CATALOG   │
                    │  • Compile all AST-* │
                    │  • Link to artifacts │
                    │  • Record limits     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   EnrichedEvidence   │
                    │   (to Stage 4)       │
                    └──────────────────────┘
```

---

## 3. Determinism Contract

### 3.1 The Problem

Tree-sitter parsing is deterministic given identical bytes, but **deep analysis tools are environment-sensitive**:

| Tool        | Environment Sensitivity                                                   |
| ----------- | ------------------------------------------------------------------------- |
| ts-morph    | tsconfig.json, TypeScript version, module resolution, node_modules layout |
| go/packages | go.mod, Go version, GOPROXY, module cache, network availability           |
| jedi        | Python version, virtualenv, installed packages                            |

Without controls, identical source code can produce different analysis results.

### 3.2 Hermetic Execution Requirements

**Requirement 1: Pin Tool Versions**

| Tool        | Version Lock          | Configuration                  |
| ----------- | --------------------- | ------------------------------ |
| Tree-sitter | Lock grammar versions | Package.json / go.mod          |
| TypeScript  | Pin exact version     | `AST_TYPESCRIPT_VERSION=5.3.3` |
| ts-morph    | Pin exact version     | Package.json                   |
| Go          | Pin major.minor       | `AST_GO_VERSION=1.21`          |
| Jedi        | Pin exact version     | requirements.txt               |

**Requirement 2: Control External Access**

| Tool        | Network Control     | Configuration                     |
| ----------- | ------------------- | --------------------------------- |
| ts-morph    | No network needed   | Analyze local files only          |
| go/packages | Control via GOPROXY | `GOPROXY=off` or controlled proxy |
| Jedi        | No network needed   | Local analysis only               |

**Requirement 3: Explicit Fallbacks**

| Scenario                      | Fallback                     | Record             |
| ----------------------------- | ---------------------------- | ------------------ |
| tsconfig.json missing         | Use default compiler options | AST-ENV evidence   |
| go.mod missing                | Generate minimal go.mod      | AST-ENV evidence   |
| Type resolution fails         | Fall back to Tree-sitter     | AST-ENV evidence   |
| Network required but disabled | Skip deep analysis           | AST-LIMIT evidence |

### 3.3 AST-ENV Evidence

Record environment details for reproducibility:

| Field               | Type                | Description                    |
| ------------------- | ------------------- | ------------------------------ |
| id                  | string              | AST-ENV-{hash}                 |
| tree_sitter_version | string              | Tree-sitter library version    |
| grammar_versions    | Map<string, string> | Language → grammar version     |
| typescript_version  | string \| null      | TypeScript version used        |
| go_version          | string \| null      | Go version used                |
| network_used        | boolean             | Was external network accessed? |
| fallbacks_applied   | string[]            | Which fallbacks were triggered |
| tsconfig_source     | enum                | found, generated, default      |
| gomod_source        | enum                | found, generated, none         |

### 3.4 Determinism Verification

To verify determinism, the same inputs should produce:

| Must Be Identical        | May Vary           |
| ------------------------ | ------------------ |
| All AST-SYM evidence IDs | Timing metrics     |
| All validation statuses  | Cache hit/miss     |
| All extracted symbols    | AST-ENV timestamps |
| All patch candidates     |                    |

**Test Strategy:** Run AST analysis twice on same input, compare evidence catalogs (excluding timing).

---

## 4. Fact Class Hierarchy

### 4.1 Class Definitions

The AST layer extends (does not replace) existing fact classes:

**Class A — Log-Derived Facts** (existing, from chunking)

| Attribute       | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Produced By     | Chunk extractor (Stage 2)                                           |
| Examples        | Error messages, stack traces, test failures, file paths from logs   |
| Properties      | Extracted from CI logs, may contain stale/incorrect paths           |
| Trust Level     | Medium — logs reflect CI runtime state, may drift from current code |
| Evidence Prefix | FND-_, ERR-_, TST-\*                                                |

**Class B — AST-Derived Facts** (NEW)

| Attribute       | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Produced By     | Tree-sitter, ts-morph, go/packages                                          |
| Examples        | Function signatures, import statements, class definitions, symbol locations |
| Properties      | Deterministic given same source, verifiable, current state of code          |
| Trust Level     | High — ground truth for code structure at analyzed commit                   |
| Evidence Prefix | AST-FILE-_, AST-SYM-_, AST-IMP-_, AST-TYPE-_                                |

**Class C — Cross-Referenced Facts** (NEW)

| Attribute       | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Produced By     | Cross-reference validator                                             |
| Examples        | "Error at line 45 refers to function `processPayment` at lines 42-67" |
| Properties      | Links Class A to Class B, validates or invalidates log claims         |
| Trust Level     | Derived — confidence depends on match quality                         |
| Evidence Prefix | AST-XREF-\*                                                           |

**Class D — Enrichment Context** (NEW)

| Attribute       | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| Produced By     | Context enricher                                                     |
| Examples        | Surrounding code, related functions, import chains, type definitions |
| Properties      | Additional context for LLM, all traceable to AST                     |
| Trust Level     | High — directly derived from Class B                                 |
| Evidence Prefix | AST-CTX-\*                                                           |

**Class E — Budget/Limit Facts** (NEW)

| Attribute       | Value                                                     |
| --------------- | --------------------------------------------------------- |
| Produced By     | Budget controller                                         |
| Examples        | "Import expansion stopped at depth 2", "15 files skipped" |
| Properties      | Explains incomplete analysis, citable by LLM              |
| Trust Level     | Metadata — factual about the analysis process             |
| Evidence Prefix | AST-LIMIT-\*                                              |

### 3.2 Provenance Principle

> AST facts are deterministic and verifiable, therefore "ground truth evidence," but remain a distinct class (Class B) to preserve provenance clarity.

**Never conflate Class A (log-derived) with Class B (AST-derived).**

---

## 4. Deterministic Input Definition

### 4.1 Code Snapshot Policy

AST analysis must define exactly which code snapshot it analyzes.

**Primary Inputs:**

| Input     | Source         | Description                 |
| --------- | -------------- | --------------------------- |
| head_sha  | PR metadata    | Current state of PR branch  |
| base_sha  | PR metadata    | Target branch before merge  |
| pr_files  | GitHub API     | List of files changed in PR |
| repo_root | Build metadata | Repository root path        |

### 4.2 Ref Resolution Policy

| Scenario                             | Ref Used                   | Rationale                   |
| ------------------------------------ | -------------------------- | --------------------------- |
| Default                              | head_sha                   | Analyze current state of PR |
| File deleted in PR                   | base_sha                   | File exists only in base    |
| File added in PR                     | head_sha                   | File exists only in head    |
| Artifact references pre-change lines | head_sha + drift detection | Log may show old lines      |
| Explicit base analysis requested     | base_sha                   | For debugging/comparison    |
| File unchanged in PR                 | head_sha                   | Consistent with default     |

### 4.3 ResolvedFile Ref Fields

Every resolved file must include:

| Field             | Type             | Description                            |
| ----------------- | ---------------- | -------------------------------------- |
| ref_sha           | string           | The commit SHA used to fetch this file |
| ref_side          | "base" \| "head" | Which side of the PR                   |
| is_from_pr_change | boolean          | Was this file modified in the PR?      |

---

# Part II: Stage Specifications

---

## 5. Stage 3.5a: File Resolution

### 5.1 Purpose

Map file paths from extracted artifacts to actual files in the repository with base/head awareness and fuzzy matching fallback.

### 5.2 Input

| Field     | Source             | Description                      |
| --------- | ------------------ | -------------------------------- |
| artifacts | AggregatedEvidence | Ranked artifacts with file paths |
| repo      | Build metadata     | owner/repo                       |
| head_sha  | Build metadata     | PR head commit                   |
| base_sha  | Build metadata     | PR base commit                   |
| pr_files  | GitHub API         | Files changed in PR (optional)   |

### 5.3 Resolution Steps

**Step 1: Extract Seed Paths**

Collect file paths from artifacts (demand-driven):

| Source           | Field              | Example                                 |
| ---------------- | ------------------ | --------------------------------------- |
| Direct reference | artifact.file_path | `src/utils/parser.ts`                   |
| Stack trace      | artifact.snippet   | `at parseJSON (src/utils/parser.ts:42)` |
| Compiler error   | artifact.file_path | `src/models/user.ts(10,5)`              |
| Test failure     | artifact.test_file | `tests/unit/parser.test.ts`             |

**Step 2: Normalize Paths**

| Normalization           | Before                                    | After                              |
| ----------------------- | ----------------------------------------- | ---------------------------------- |
| Remove CI prefixes      | `/home/runner/work/repo/repo/src/file.ts` | `src/file.ts`                      |
| Remove Windows prefixes | `D:\a\repo\repo\src\file.ts`              | `src/file.ts`                      |
| Remove GitLab prefixes  | `/builds/group/repo/src/file.ts`          | `src/file.ts`                      |
| Unify separators        | `src\utils\file.ts`                       | `src/utils/file.ts`                |
| Resolve relative        | `./src/../lib/file.ts`                    | `lib/file.ts`                      |
| Strip build outputs     | `dist/src/file.js`                        | `src/file.ts` (with extension map) |

**Known CI Prefix Patterns:**

| CI Platform              | Prefix Pattern                          |
| ------------------------ | --------------------------------------- |
| GitHub Actions           | `/home/runner/work/{repo}/{repo}/`      |
| GitHub Actions (Windows) | `D:\a\{repo}\{repo}\`                   |
| GitLab CI                | `/builds/{group}/{repo}/`               |
| CircleCI                 | `/home/circleci/project/`               |
| Jenkins                  | `/var/jenkins_home/workspace/{job}/`    |
| Azure DevOps             | `/home/vsts/work/1/s/`                  |
| Bitbucket                | `/opt/atlassian/pipelines/agent/build/` |
| Travis CI                | `/home/travis/build/{owner}/{repo}/`    |

**Step 3: Determine Ref Side**

| Condition                              | Ref Decision    | ref_side |
| -------------------------------------- | --------------- | -------- |
| File in pr_files AND exists in head    | Use head_sha    | head     |
| File in pr_files AND deleted in head   | Use base_sha    | base     |
| File NOT in pr_files                   | Use head_sha    | head     |
| File not found in head, exists in base | Use base_sha    | base     |
| File not found in either               | Mark unresolved | —        |

**Step 4: Fetch File Content**

| Source          | Method                                                | Priority | Latency |
| --------------- | ----------------------------------------------------- | -------- | ------- |
| Local checkout  | `fs.readFile()`                                       | 1        | <1ms    |
| GitHub API      | `GET /repos/{owner}/{repo}/contents/{path}?ref={sha}` | 2        | ~100ms  |
| PR diff payload | Extract from cached diff                              | 3        | <1ms    |

**Concurrency:** Max 5 parallel GitHub API calls (rate limit protection)

**Step 5: Path Fuzzy Matching (if exact resolution fails)**

### 5.4 Path Fuzzy Match Policy

When exact path resolution fails, apply deterministic fuzzy matching:

**Fuzzy Step 1: Extended Normalization**

| Action                      | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| Strip all known CI prefixes | See table above                                                |
| Strip build output paths    | `dist/`, `build/`, `out/`, `.next/`, `target/`, `__pycache__/` |
| Strip source map references | Remove `.map` suffix                                           |
| Handle transpilation        | `.js` → `.ts`, `.jsx` → `.tsx` (configurable)                  |

**Fuzzy Step 1.5: Obtain Repo File Index**

Fuzzy suffix matching requires a list of files in the repo. This can be expensive.

| Method               | When to Use                | Cost            | Determinism   |
| -------------------- | -------------------------- | --------------- | ------------- |
| `git ls-files`       | Local checkout available   | Fast (<100ms)   | Deterministic |
| GitHub Git Trees API | No local checkout          | Single API call | Deterministic |
| PR files only        | Fallback if tree too large | Already cached  | Deterministic |

**File Index Strategy:**

| Condition                                      | Strategy                                    |
| ---------------------------------------------- | ------------------------------------------- |
| Local checkout exists                          | Use `git ls-files` (preferred)              |
| Tree size < AST_MAX_TREE_FILES (default 10000) | Fetch via GitHub Trees API, cache 24h       |
| Tree size ≥ AST_MAX_TREE_FILES                 | Use PR files only for fuzzy (limited scope) |
| GitHub Trees API fails                         | Fall back to PR files only                  |

**Configuration:**

| Parameter                | Default | Description                   |
| ------------------------ | ------- | ----------------------------- |
| AST_MAX_TREE_FILES       | 10000   | Max repo files for full fuzzy |
| AST_TREE_CACHE_TTL_HOURS | 24      | Cache TTL for file tree       |
| AST_FUZZY_PR_FILES_ONLY  | false   | Force PR-files-only fuzzy     |

**Fuzzy Step 2: Suffix Match**

| Action                | Description                                      |
| --------------------- | ------------------------------------------------ |
| Extract file suffix   | Last 2-3 path segments (e.g., `utils/parser.ts`) |
| Search repo file list | Find all files ending with suffix                |
| Filter by extension   | Must match original or mapped extension          |

**Fuzzy Step 3: Disambiguation (if multiple matches)**

| Priority | Rule                                          | Rationale                  |
| -------- | --------------------------------------------- | -------------------------- |
| 1        | Exact suffix match (all segments)             | Most specific              |
| 2        | Same directory as other resolved stack frames | Locality principle         |
| 3        | Shortest absolute path                        | Prefer shallower files     |
| 4        | Most recently changed in PR                   | Likely relevant to failure |
| 5        | Alphabetically first                          | Deterministic tiebreaker   |

**Fuzzy Step 4: Confidence Assignment**

| Resolution Method           | Confidence |
| --------------------------- | ---------- |
| exact                       | 1.0        |
| suffix_match (all segments) | 0.9        |
| suffix_match (partial)      | 0.7        |
| fuzzy_directory             | 0.6        |
| unresolved                  | 0.0        |

### 5.5 Output: ResolvedFile

| Field                 | Type           | Description                                      |
| --------------------- | -------------- | ------------------------------------------------ |
| original_path         | string         | Path from artifact (as logged)                   |
| resolved_path         | string \| null | Canonical path in repo                           |
| resolution_status     | enum           | resolved, deleted_in_head, unresolved, ambiguous |
| resolution_method     | enum           | exact, suffix_match, fuzzy_directory, unresolved |
| resolution_confidence | number         | 0.0-1.0                                          |
| fuzzy_candidates      | string[]       | Other candidates (for debugging)                 |
| content               | string \| null | File content (if resolved)                       |
| content_sha           | string \| null | SHA-256 of content (for caching)                 |
| line_count            | number \| null | Total lines                                      |
| ref_sha               | string         | Commit SHA used                                  |
| ref_side              | enum           | base, head                                       |
| is_from_pr_change     | boolean        | Modified in PR?                                  |
| source                | enum           | local, github_api, pr_diff, cache                |
| fetch_time_ms         | number         | Fetch latency                                    |

### 5.6 Error Handling

| Error                   | Behavior                                | Impact             |
| ----------------------- | --------------------------------------- | ------------------ |
| GitHub API 404          | Try base_sha, then mark unresolved      | Artifact flagged   |
| GitHub API rate limit   | Queue for retry, continue with resolved | Partial results    |
| GitHub API 500          | Retry 3x with backoff, then skip        | Partial results    |
| File too large (>500KB) | Skip                                    | AST-LIMIT evidence |
| Encoding error          | Try UTF-8, Latin-1, then skip           | Partial results    |

---

## 6. Stage 3.5b: AST Parsing (Tree-sitter)

### 6.1 Purpose

Parse resolved files into Abstract Syntax Trees using Tree-sitter. **Demand-driven**: parse only files reachable from artifacts.

### 6.2 Demand-Driven Parsing Policy

**Seed Files:** Always parse files directly referenced by artifacts.

**Expansion:** Conditionally parse imports/dependencies based on mode.

| Parameter       | Default                | Description                        |
| --------------- | ---------------------- | ---------------------------------- |
| seed_files      | artifact.file_path set | Starting files (always parsed)     |
| max_parse_files | 100                    | Hard cap on total files            |
| max_graph_depth | 2                      | Import/callee expansion depth      |
| expand_imports  | mode-dependent         | Whether to follow imports          |
| stop_on_budget  | true                   | Stop expanding when budget reached |

**Expansion Algorithm:**

```
1. Initialize parse_queue = seed_files
2. Initialize parsed_set = {}
3. Initialize depth_map = {seed: 0 for seed in seed_files}

4. While parse_queue not empty AND parsed_set.size < max_parse_files:
   a. file = parse_queue.dequeue()
   b. If file in parsed_set: continue
   c. parsed_file = tree_sitter_parse(file)
   d. parsed_set.add(file, parsed_file)
   e. If expand_imports AND depth_map[file] < max_graph_depth:
      i. For each import in parsed_file.imports:
         - resolved_import = resolve_import(import, file)
         - If resolved_import not in parsed_set:
           - parse_queue.enqueue(resolved_import)
           - depth_map[resolved_import] = depth_map[file] + 1

5. If parse_queue not empty:
   a. Record AST-LIMIT evidence with skipped files
```

### 6.3 AST Modes

| Mode           | Trigger                  | Seed Parse | Expansion | Deep AST    | Time Budget |
| -------------- | ------------------------ | ---------- | --------- | ----------- | ----------- |
| fast           | Build passed, or default | Yes        | No        | No          | 6s          |
| full           | Failed AND seed ≤ 50     | Yes        | Yes       | Yes         | 20s         |
| full_seed_only | Failed AND seed > 50     | Yes        | No        | Yes (top K) | 12s         |

**Mode Selection Logic:**

```
1. If tenant_override exists: return tenant_override
2. If build_status = passed: return "fast"
3. If seed_file_count > full_seed_only_threshold (default 50): return "full_seed_only"
4. return "full"
```

**Enhanced Mode Selection (Recommended):**

Beyond basic logic, consider these factors for smarter mode selection:

| Factor                   | Fast | Full | Full-Seed-Only |
| ------------------------ | ---- | ---- | -------------- |
| Build passed             | ✓    |      |                |
| Warnings only            | ✓    |      |                |
| Compiler errors present  |      | ✓    |                |
| Fatal/infra errors       |      | ✓    |                |
| Flaky test failures only | ✓    |      |                |
| Seed files > 50          |      |      | ✓              |
| Repo file count > 10000  | ✓    |      |                |
| Tenant budget tier = low | ✓    |      |                |

**Mode Selection Algorithm (Enhanced):**

```
1. If tenant_override exists: return tenant_override
2. If build_status = passed: return "fast"

3. Compute severity_score:
   - Count artifacts by severity (fatal=10, error=5, warning=1)
   - If only warnings: return "fast"
   - If only flaky test failures: return "fast"

4. Compute cost_score:
   - seed_file_count
   - repo_file_count (from metadata)
   - tenant_budget_tier

5. If seed_file_count > 50 OR cost_score > threshold:
   return "full_seed_only"

6. If severity_score > error_threshold:
   return "full"

7. return "fast"
```

**Configuration:**

| Parameter                   | Default | Description                 |
| --------------------------- | ------- | --------------------------- |
| AST_MODE_SEVERITY_THRESHOLD | 5       | Min severity score for full |
| AST_MODE_COST_THRESHOLD     | 100     | Max cost score for full     |
| AST_MODE_REPO_SIZE_LIMIT    | 10000   | Repo files triggering fast  |

**Full-Seed-Only Mode Behavior:**

| Behavior               | full              | full_seed_only       |
| ---------------------- | ----------------- | -------------------- |
| Parse seed files       | All               | All                  |
| Deep AST on seed files | All (up to limit) | Top K by error count |
| Expand imports         | Yes               | No                   |
| Parse expanded files   | Yes               | No                   |
| Deep AST on expanded   | Yes               | No                   |
| max_deep_ast_files     | 50                | 20                   |

### 6.4 Supported Languages

**Tier 1 — Full Support (Deep AST Available)**

| Language   | Tree-sitter Grammar    | Deep AST Tool          | Phase       |
| ---------- | ---------------------- | ---------------------- | ----------- |
| TypeScript | tree-sitter-typescript | ts-morph               | 1           |
| JavaScript | tree-sitter-javascript | ts-morph               | 1           |
| TSX        | tree-sitter-typescript | ts-morph               | 1           |
| JSX        | tree-sitter-javascript | ts-morph               | 1           |
| Python     | tree-sitter-python     | ast + jedi (optional)  | 1           |
| Go         | tree-sitter-go         | go/packages + go/types | 1           |
| Java       | tree-sitter-java       | JavaParser             | 2           |
| Rust       | tree-sitter-rust       | (Phase 3+)             | 1 (shallow) |

**Tier 2 — Standard Support (Tree-sitter + Symbol Extraction)**

| Language    | Tree-sitter Grammar | Notes            |
| ----------- | ------------------- | ---------------- |
| C           | tree-sitter-c       | Header parsing   |
| C++         | tree-sitter-cpp     | Template support |
| C#          | tree-sitter-c-sharp | .NET ecosystem   |
| Ruby        | tree-sitter-ruby    | Rails support    |
| PHP         | tree-sitter-php     | Laravel, Symfony |
| Kotlin      | tree-sitter-kotlin  | Android, JVM     |
| Swift       | tree-sitter-swift   | iOS, macOS       |
| Scala       | tree-sitter-scala   | JVM, Spark       |
| Objective-C | tree-sitter-objc    | iOS legacy       |

**Tier 3 — Basic Support (Tree-sitter Parsing Only)**

| Language   | Tree-sitter Grammar    |
| ---------- | ---------------------- |
| Dart       | tree-sitter-dart       |
| Elixir     | tree-sitter-elixir     |
| Erlang     | tree-sitter-erlang     |
| Haskell    | tree-sitter-haskell    |
| Clojure    | tree-sitter-clojure    |
| F#         | tree-sitter-fsharp     |
| Lua        | tree-sitter-lua        |
| Perl       | tree-sitter-perl       |
| R          | tree-sitter-r          |
| Julia      | tree-sitter-julia      |
| Groovy     | tree-sitter-groovy     |
| PowerShell | tree-sitter-powershell |
| Bash/Shell | tree-sitter-bash       |
| Zig        | tree-sitter-zig        |
| Nim        | tree-sitter-nim        |
| Crystal    | tree-sitter-crystal    |
| V          | tree-sitter-v          |
| Odin       | tree-sitter-odin       |

**Tier 4 — Markup/Config**

| Language   | Tree-sitter Grammar    | Notes        |
| ---------- | ---------------------- | ------------ |
| HTML       | tree-sitter-html       | Web          |
| CSS        | tree-sitter-css        | Styling      |
| SCSS/Sass  | tree-sitter-scss       | Preprocessor |
| JSON       | tree-sitter-json       | Config       |
| YAML       | tree-sitter-yaml       | CI configs   |
| TOML       | tree-sitter-toml       | Rust config  |
| XML        | tree-sitter-xml        | Config       |
| Markdown   | tree-sitter-markdown   | Docs         |
| SQL        | tree-sitter-sql        | Database     |
| GraphQL    | tree-sitter-graphql    | API          |
| Protobuf   | tree-sitter-protobuf   | gRPC         |
| Dockerfile | tree-sitter-dockerfile | Containers   |
| HCL        | tree-sitter-hcl        | Terraform    |
| Nix        | tree-sitter-nix        | NixOS        |

**Tier 5 — Specialized/Legacy**

| Language | Tree-sitter Grammar  | Notes           |
| -------- | -------------------- | --------------- |
| Solidity | tree-sitter-solidity | Smart contracts |
| COBOL    | tree-sitter-cobol    | Enterprise      |
| Fortran  | tree-sitter-fortran  | Scientific      |
| VHDL     | tree-sitter-vhdl     | Hardware        |
| Verilog  | tree-sitter-verilog  | Hardware        |
| Pascal   | tree-sitter-pascal   | Legacy          |
| Ada      | tree-sitter-ada      | Aerospace       |

**Tier 6 — Framework DSLs**

| Language | Tree-sitter Grammar  | Notes             |
| -------- | -------------------- | ----------------- |
| Vue      | tree-sitter-vue      | Vue SFCs          |
| Svelte   | tree-sitter-svelte   | Svelte components |
| Astro    | tree-sitter-astro    | Astro components  |
| MDX      | tree-sitter-mdx      | Markdown + JSX    |
| Prisma   | tree-sitter-prisma   | Database schema   |
| Starlark | tree-sitter-starlark | Bazel             |

### 6.5 Language Detection

| Method             | Priority | Example                          |
| ------------------ | -------- | -------------------------------- |
| File extension     | 1        | `.ts` → TypeScript               |
| Shebang            | 2        | `#!/usr/bin/env python` → Python |
| Package manifest   | 3        | `package.json` nearby → JS/TS    |
| Content heuristics | 4        | `<?php` → PHP                    |

**Extension Map:**

| Extension                  | Language   |
| -------------------------- | ---------- |
| .ts, .tsx                  | TypeScript |
| .js, .jsx, .mjs, .cjs      | JavaScript |
| .py, .pyi                  | Python     |
| .go                        | Go         |
| .rs                        | Rust       |
| .java                      | Java       |
| .kt, .kts                  | Kotlin     |
| .swift                     | Swift      |
| .rb                        | Ruby       |
| .php                       | PHP        |
| .cs                        | C#         |
| .c, .h                     | C          |
| .cpp, .cc, .cxx, .hpp, .hh | C++        |
| .scala, .sc                | Scala      |
| .ex, .exs                  | Elixir     |
| .erl, .hrl                 | Erlang     |
| .hs, .lhs                  | Haskell    |
| .clj, .cljs, .cljc         | Clojure    |
| .fs, .fsx                  | F#         |
| .lua                       | Lua        |
| .pl, .pm                   | Perl       |
| .r, .R                     | R          |
| .jl                        | Julia      |
| .groovy, .gvy              | Groovy     |
| .ps1, .psm1                | PowerShell |
| .sh, .bash, .zsh           | Shell      |
| .zig                       | Zig        |
| .nim                       | Nim        |
| .cr                        | Crystal    |

### 6.6 Parsing Configuration

| Parameter            | Default | Description                 |
| -------------------- | ------- | --------------------------- |
| timeout_ms           | 5000    | Max parse time per file     |
| max_file_size_kb     | 500     | Skip files larger than this |
| error_tolerance      | true    | Continue on parse errors    |
| include_comments     | true    | Parse comments for context  |
| max_symbols_per_file | 500     | Cap symbol extraction       |

### 6.7 Symbol Extraction

From each parsed file, extract:

| Symbol Kind | Description           | Fields Extracted                                          |
| ----------- | --------------------- | --------------------------------------------------------- |
| function    | Function declarations | name, params, return_type, async, line_range              |
| class       | Class declarations    | name, extends, implements, line_range                     |
| method      | Class methods         | name, params, return_type, static, visibility, line_range |
| variable    | Top-level variables   | name, type, const, line_range                             |
| type        | Type definitions      | name, kind (interface/type/enum), line_range              |
| import      | Import statements     | module, symbols, is_type_only, line                       |
| export      | Export statements     | symbols, is_default, line                                 |

### 6.8 Output: ParsedFile

| Field          | Type              | Description             |
| -------------- | ----------------- | ----------------------- |
| file_path      | string            | Resolved path           |
| language       | string            | Detected language       |
| tree           | TreeSitterTree    | Opaque tree reference   |
| root_node      | ASTNode           | Root node               |
| error_nodes    | ASTNode[]         | Syntax errors (if any)  |
| symbols        | ExtractedSymbol[] | Extracted symbols       |
| imports        | ImportStatement[] | Import statements       |
| exports        | ExportStatement[] | Export statements       |
| parse_time_ms  | number            | Parse duration          |
| parse_mode     | enum              | seed, expanded, skipped |
| parser_version | string            | Tree-sitter version     |

### 6.9 Output: ExtractedSymbol

| Field           | Type           | Description                                             |
| --------------- | -------------- | ------------------------------------------------------- |
| id              | string         | AST-SYM-{hash}                                          |
| display_label   | string         | file:kind:name:line                                     |
| name            | string         | Symbol name                                             |
| kind            | enum           | function, class, method, variable, type, import, export |
| file_path       | string         | Source file                                             |
| line_start      | number         | Start line (1-indexed)                                  |
| line_end        | number         | End line                                                |
| column_start    | number         | Start column                                            |
| column_end      | number         | End column                                              |
| signature       | string \| null | Full signature (functions/methods)                      |
| parent_id       | string \| null | Parent symbol (for nesting)                             |
| modifiers       | string[]       | public, private, async, static, etc.                    |
| type_annotation | string \| null | Type hint (TS/Python)                                   |
| jsdoc           | string \| null | JSDoc comment                                           |
| docstring       | string \| null | Python docstring                                        |

---

## 7. Stage 3.5c: Deep AST Analysis

### 7.1 Purpose

For languages with rich type systems, use language-specific tools for deeper analysis including type resolution, import chains, and semantic understanding.

### 7.2 Activation Criteria

| Condition                               | Deep AST?            |
| --------------------------------------- | -------------------- |
| Mode = fast                             | No                   |
| Mode = full AND language in Tier 1      | Yes                  |
| Mode = full_seed_only AND file in top K | Yes                  |
| Error involves type mismatch            | Yes (if TS/JS/Go)    |
| Error involves imports/exports          | Yes (if TS/JS)       |
| File count > deep_ast_file_limit        | No (budget exceeded) |

### 7.3 TypeScript/JavaScript: ts-morph

**Capabilities:**

| Capability        | Description                                  |
| ----------------- | -------------------------------------------- |
| Type inference    | Inferred types for variables and expressions |
| Import resolution | Resolve import paths to actual files         |
| Symbol navigation | Find references, go to definition            |
| Call hierarchy    | Who calls this function, what does it call   |
| Type hierarchy    | Inheritance chains, implemented interfaces   |
| Diagnostics       | TypeScript compiler errors/warnings          |

**Configuration:**

| Setting             | Value       | Notes                  |
| ------------------- | ----------- | ---------------------- |
| tsconfig discovery  | Auto-detect | Look for tsconfig.json |
| skipLibCheck        | true        | Performance            |
| skipDefaultLibCheck | true        | Performance            |
| noEmit              | true        | Analysis only          |

**Limitations:**

| Limitation              | Mitigation                         |
| ----------------------- | ---------------------------------- |
| Requires tsconfig.json  | Generate minimal config if missing |
| Slow on large projects  | File count limits                  |
| Memory-intensive        | Single-threaded, sequential        |
| node_modules resolution | Skip node_modules content          |

### 7.4 Python: ast + jedi

**Standard Library ast (Always Available):**

| Capability        | Description                  |
| ----------------- | ---------------------------- |
| Full AST          | Complete Python syntax tree  |
| Symbol extraction | Functions, classes, imports  |
| Type annotations  | PEP 484 type hints           |
| Docstrings        | Function/class documentation |

**Jedi (Optional, Gated by AST_ENABLE_JEDI):**

| Capability        | Description           |
| ----------------- | --------------------- |
| Type inference    | Runtime type analysis |
| Import resolution | Virtual env aware     |
| Completions       | IDE-like completions  |
| References        | Find all references   |

**Jedi Gating:**

| Condition                        | Enable Jedi? |
| -------------------------------- | ------------ |
| AST_ENABLE_JEDI = false          | No           |
| Mode = fast                      | No           |
| Type-related error in artifact   | Yes          |
| Import-related error in artifact | Yes          |
| Time budget remaining            | Yes          |

### 7.5 Go: go/packages + go/types

**Capabilities:**

| Capability                | Description                        |
| ------------------------- | ---------------------------------- |
| Type checking             | Full type information via go/types |
| Import resolution         | Module-aware (go.mod)              |
| Interface satisfaction    | Which types implement interfaces   |
| Build constraint handling | Respects build tags                |

**Configuration:**

| Setting | Value                   | Notes                                           |
| ------- | ----------------------- | ----------------------------------------------- |
| Mode    | NeedTypes \| NeedSyntax | Full analysis                                   |
| Tests   | false                   | Skip test files unless artifact references them |
| Dir     | repo_root               | Working directory                               |

**Limitations:**

| Limitation             | Mitigation                      |
| ---------------------- | ------------------------------- |
| Requires go.mod        | Generate minimal if missing     |
| Downloads dependencies | Use GOPROXY, cache aggressively |
| CGo not supported      | Skip CGo files                  |
| vendor/ directory      | Exclude from analysis           |

### 7.6 Rust: Deferred to Phase 3+

**Current Behavior (Phase 1-2):** Tree-sitter only (shallow AST)

**Future (Phase 3+):** rust-analyzer integration

| Challenge                   | Notes                                |
| --------------------------- | ------------------------------------ |
| rust-analyzer is LSP server | Requires server lifecycle management |
| Macro expansion             | Complex, performance-intensive       |
| Build system integration    | Cargo workspace support needed       |

### 7.7 Java: JavaParser (Phase 2)

**Capabilities:**

| Capability            | Description           |
| --------------------- | --------------------- |
| Full AST              | Complete Java syntax  |
| Symbol resolution     | With classpath        |
| Type resolution       | Requires dependencies |
| Annotation processing | Extract annotations   |

**Limitations:**

| Limitation             | Mitigation                  |
| ---------------------- | --------------------------- |
| Requires classpath     | Use Maven/Gradle to resolve |
| Slow on large projects | File limits                 |

### 7.8 Output: DeepAnalysisResult

| Field              | Type                         | Description                 |
| ------------------ | ---------------------------- | --------------------------- |
| resolved_types     | Map<symbol_id, ResolvedType> | Type information            |
| type_errors        | TypeDiagnostic[]             | Type-related issues         |
| import_graph       | ImportGraph                  | Import dependency graph     |
| unresolved_imports | UnresolvedImport[]           | Failed imports              |
| circular_imports   | CircularImport[]             | Circular dependencies       |
| call_graph         | CallGraph \| null            | Function call relationships |
| analysis_mode      | enum                         | full, partial, skipped      |
| files_analyzed     | number                       | Count                       |
| analysis_time_ms   | number                       | Duration                    |
| budget_exhausted   | boolean                      | Hit limits?                 |
| tool_version       | string                       | Tool version used           |

### 7.9 Performance Constraints

| Constraint                  | Value                          | Rationale               |
| --------------------------- | ------------------------------ | ----------------------- |
| Max files for deep analysis | 50 (full), 20 (full_seed_only) | Memory/time             |
| Timeout per project         | 30000ms                        | Prevent runaway         |
| Skip node_modules           | Always                         | Too large               |
| Skip vendor/                | Always                         | Go vendor               |
| Cache TTL                   | 1 hour                         | Project context changes |

---

## 8. Stage 3.5d: Context Enrichment

### 8.1 Purpose

Add code context to extracted artifacts so the LLM has actual code, not just error messages.

### 8.2 Enrichment Types

**8.2.1 Code Snippet**

For each artifact with file_path and line_number:

| Field                | Type     | Description                       |
| -------------------- | -------- | --------------------------------- |
| snippet              | string   | Lines around the error            |
| snippet_start        | number   | First line of snippet (1-indexed) |
| snippet_end          | number   | Last line of snippet              |
| highlight_lines      | number[] | Error line(s) to highlight        |
| snippet_with_numbers | string   | Formatted with line numbers       |

**Configuration:**

| Parameter                 | Default | Description                         |
| ------------------------- | ------- | ----------------------------------- |
| context_before            | 5       | Lines before error                  |
| context_after             | 5       | Lines after error                   |
| max_snippet_lines         | 20      | Cap total lines                     |
| include_containing_symbol | true    | Expand to symbol boundary if nearby |

**8.2.2 Symbol Context**

If error line is within a symbol:

| Field                | Type   | Description                    |
| -------------------- | ------ | ------------------------------ |
| containing_symbol_id | string | Symbol ID containing the error |
| symbol_signature     | string | Full signature                 |
| symbol_kind          | string | function, class, method, etc.  |
| symbol_start         | number | Symbol start line              |
| symbol_end           | number | Symbol end line                |

**8.2.3 Related Symbols**

Symbols referenced near the error (budget-limited):

| Field                | Type                | Description                    |
| -------------------- | ------------------- | ------------------------------ |
| called_functions     | string[]            | Symbol IDs of functions called |
| referenced_variables | string[]            | Symbol IDs of variables used   |
| imported_from        | Map<string, string> | name → source module           |
| type_of_expression   | string \| null      | Type (if deep AST available)   |

**Budget:** Max 10 related symbols per artifact

**8.2.4 Import Context**

For import-related errors:

| Field             | Type              | Description                 |
| ----------------- | ----------------- | --------------------------- |
| import_chain      | ImportChainLink[] | Path from entry to error    |
| chain_depth       | number            | Number of hops              |
| missing_export    | string \| null    | What's missing              |
| available_exports | string[] \| null  | What module exports         |
| suggested_import  | string \| null    | Correction (if unambiguous) |

### 8.3 Output: EnrichedArtifact

Extends RankedArtifact (from AggregatedEvidence) with:

| Field             | Type                   | Description         |
| ----------------- | ---------------------- | ------------------- |
| code_context      | CodeContext \| null    | Code snippet        |
| symbol_context    | SymbolContext \| null  | Containing symbol   |
| related_symbols   | RelatedSymbols \| null | Referenced symbols  |
| import_context    | ImportContext \| null  | Import chain        |
| ast_evidence_ids  | string[]               | AST-\* evidence IDs |
| validation_status | ValidationStatus       | See Stage 3.5e      |

---

## 9. Stage 3.5e: Cross-Reference Validation

### 9.1 Purpose

Validate that log-derived claims match actual code state using fuzzy matching to handle line drift.

### 9.2 Validation Rules

**Rule 1: File Exists**

| Check                   | Pass                         | Fail             |
| ----------------------- | ---------------------------- | ---------------- |
| File path from artifact | Found in repo (head or base) | `file_not_found` |

**Rule 2: Line Bounds**

| Check                     | Pass              | Fail                 |
| ------------------------- | ----------------- | -------------------- |
| Line number from artifact | ≤ file.line_count | `line_out_of_bounds` |

**Rule 3: Symbol Exists**

| Check                          | Pass         | Fail               |
| ------------------------------ | ------------ | ------------------ |
| Function/class name from error | Found in AST | `symbol_not_found` |

**Rule 4: Line Content Match (2-Tier Fuzzy)**

| Check               | Pass          | Fail               |
| ------------------- | ------------- | ------------------ |
| Log snippet content | Found in file | `content_no_match` |

**Rule 5: Type Consistency (TypeScript/Go only)**

| Check                   | Pass             | Fail            |
| ----------------------- | ---------------- | --------------- |
| Type from error message | Matches deep AST | `type_mismatch` |

### 9.3 Fuzzy Line Matching (Rule 4)

**9.3.1 Canonical Needle Extraction**

CI log snippets contain noise that must be stripped before matching.

**Needle Extraction Pipeline:**

| Step | Action                | Example                                    |
| ---- | --------------------- | ------------------------------------------ |
| 1    | Remove ANSI sequences | (should be done upstream, but defensive)   |
| 2    | Remove timestamps     | `[2024-01-15T10:30:00Z]`, `10:30:00`, etc. |
| 3    | Remove line numbers   | Leading `42:`, `L42`, etc.                 |
| 4    | Remove log prefixes   | `ERROR:`, `[error]`, `E `, etc.            |
| 5    | Trim whitespace       | Leading/trailing spaces                    |
| 6    | Tokenize              | Split on whitespace and punctuation        |
| 7    | Filter short tokens   | Remove tokens < 3 characters               |
| 8    | Filter noise tokens   | Remove common noise (see below)            |

**Noise Token List:**

| Category         | Tokens to Filter                          |
| ---------------- | ----------------------------------------- |
| Log levels       | error, warn, info, debug, trace           |
| Timestamps       | AM, PM, UTC, ISO date components          |
| Stack prefixes   | at, in, from, line, col, column           |
| Punctuation-only | tokens that are only punctuation          |
| Pure numbers     | Unless they look like error codes (E1234) |

**Configuration:**

| Parameter                   | Default | Description                |
| --------------------------- | ------- | -------------------------- |
| AST_NEEDLE_MIN_TOKEN_LENGTH | 3       | Min token length           |
| AST_NEEDLE_FILTER_NUMBERS   | true    | Filter pure numeric tokens |
| AST_NEEDLE_MAX_TOKENS       | 50      | Max tokens to use          |

**Needle Extraction Output:**

| Field                 | Type     | Description                 |
| --------------------- | -------- | --------------------------- |
| original_snippet      | string   | Raw snippet from artifact   |
| extracted_tokens      | string[] | Filtered token list         |
| tokens_removed        | string[] | Tokens filtered out         |
| extraction_confidence | number   | Quality of extraction (0-1) |

**Record in FuzzyMatchResult:** Store `tokens_needle` for auditability alongside `tokens_matched`.

**9.3.2 Tier A: Window Search**

| Step | Action                                                  |
| ---- | ------------------------------------------------------- |
| 1    | Extract needle using canonical extractor                |
| 2    | For each line in window [line - 25, line + 25]:         |
| 3    | Tokenize line content                                   |
| 4    | Compute token overlap: (matched tokens / needle tokens) |
| 5    | If overlap ≥ AST_FUZZY_MIN_TOKEN_OVERLAP: record match  |
| 6    | Return best match (highest overlap)                     |

**9.3.3 Tier B: Whole-File Fallback**

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | If Tier A fails AND file.line_count < AST_FUZZY_MAX_FILE_LINES |
| 2    | Extract key tokens from needle (identifiers, string literals)  |
| 3    | Search entire file for lines containing key tokens             |
| 4    | Cap search time at AST_FUZZY_FALLBACK_TIMEOUT_MS               |
| 5    | If match: return with match_type = fallback                    |

**Match Types:**

| Type           | Criteria                   | Confidence Impact |
| -------------- | -------------------------- | ----------------- |
| match_exact    | Found at exact line        | +0.10             |
| match_nearby   | Found within ±10 lines     | +0.05             |
| match_drift    | Found within ±25 lines     | +0.00             |
| match_fallback | Found via Tier B           | -0.05             |
| no_match       | Not found after both tiers | -0.20             |

**Configuration:**

| Parameter                     | Default | Description              |
| ----------------------------- | ------- | ------------------------ |
| AST_FUZZY_WINDOW              | 25      | Tier A search window     |
| AST_FUZZY_FALLBACK_WHOLE_FILE | true    | Enable Tier B            |
| AST_FUZZY_MAX_FILE_LINES      | 5000    | Max file size for Tier B |
| AST_FUZZY_FALLBACK_TIMEOUT_MS | 100     | Tier B timeout           |
| AST_FUZZY_MIN_TOKEN_OVERLAP   | 0.6     | Similarity threshold     |

### 9.4 Definitive vs Non-Definitive Failures

**Definitive Failures (→ status: invalid):**

| Failure            | Criteria                             | Why Definitive                |
| ------------------ | ------------------------------------ | ----------------------------- |
| file_not_found     | Searched both refs + fuzzy path      | File genuinely doesn't exist  |
| line_out_of_bounds | Line > line_count AND no fuzzy match | Impossible line reference     |
| content_no_match   | Both Tier A + Tier B failed          | Content genuinely not present |

**Non-Definitive Failures (→ status: partially_validated):**

| Failure          | Criteria                      | Why Non-Definitive              |
| ---------------- | ----------------------------- | ------------------------------- |
| symbol_not_found | Symbol name not in AST        | May be minified/aliased/dynamic |
| type_mismatch    | Deep AST type differs         | Deep AST may be partial         |
| parse_error      | File couldn't be fully parsed | Syntax error in file            |

### 9.5 Validation Status

| Status              | Criteria                                                 |
| ------------------- | -------------------------------------------------------- |
| validated           | All applicable checks pass                               |
| partially_validated | No definitive failures, may have non-definitive failures |
| invalid             | One or more definitive failures                          |
| unvalidatable       | Cannot check (no path, file unresolved, no AST)          |

### 9.6 Confidence Adjustment

**Positive Adjustments:**

| Result                    | Adjustment |
| ------------------------- | ---------- |
| All pass (exact match)    | +0.10      |
| All pass (nearby match)   | +0.05      |
| All pass (drift match)    | +0.00      |
| All pass (fallback match) | -0.05      |

**Negative Adjustments (definitive failures):**

| Result             | Adjustment |
| ------------------ | ---------- |
| file_not_found     | -0.30      |
| line_out_of_bounds | -0.30      |
| content_no_match   | -0.20      |

**Negative Adjustments (non-definitive failures):**

| Result           | Adjustment |
| ---------------- | ---------- |
| symbol_not_found | -0.05      |
| type_mismatch    | -0.05      |
| parse_error      | +0.00      |

### 9.7 Output: ValidationResult

| Field                 | Type                     | Description                                            |
| --------------------- | ------------------------ | ------------------------------------------------------ |
| artifact_id           | string                   | Artifact being validated                               |
| checks_performed      | string[]                 | Which rules applied                                    |
| checks_passed         | CheckResult[]            | Passed checks                                          |
| checks_failed         | CheckResult[]            | Failed checks                                          |
| fuzzy_match           | FuzzyMatchResult \| null | Rule 4 details                                         |
| overall_status        | enum                     | validated, partially_validated, invalid, unvalidatable |
| confidence_adjustment | number                   | Total adjustment                                       |
| evidence_id           | string                   | AST-XREF-{hash}                                        |

**CheckResult:**

| Field      | Type    | Description                 |
| ---------- | ------- | --------------------------- |
| rule       | string  | Rule name                   |
| passed     | boolean | Pass/fail                   |
| details    | string  | Explanation                 |
| definitive | boolean | Is this a definitive check? |

**FuzzyMatchResult:**

| Field          | Type             | Description                              |
| -------------- | ---------------- | ---------------------------------------- |
| original_line  | number           | Line from artifact                       |
| matched_line   | number \| null   | Actual line found                        |
| match_type     | enum             | exact, nearby, drift, fallback, no_match |
| match_tier     | enum             | tier_a, tier_b, none                     |
| match_score    | number           | 0.0-1.0 similarity                       |
| line_drift     | number           | Difference                               |
| tokens_needle  | string[]         | Tokens extracted from needle (for audit) |
| tokens_matched | string[] \| null | Tokens that matched                      |
| tokens_removed | string[] \| null | Tokens filtered as noise                 |

---

## 10. Mechanical Patch Candidates

### 10.1 Scope

> AST enables deterministic _patch candidates_ only for a limited set of mechanical transformations; otherwise it provides grounding context for LLM suggestions.

**This is NOT general-purpose fix generation.**

### 10.2 Patch Levels

**Level 1: Tool-Verified Fixes**

| Source       | Description       |
| ------------ | ----------------- |
| ESLint --fix | Linter auto-fixes |
| rustfmt      | Formatter fixes   |
| gofmt        | Formatter fixes   |
| prettier     | Code formatting   |

Only available if CI tool explicitly outputs fix suggestions.

**Level 2: AST-Safe Mechanical Edits**

| Transformation              | Criteria                         | Example                         |
| --------------------------- | -------------------------------- | ------------------------------- |
| Missing import insertion    | Symbol is unambiguous (see 10.3) | `import { foo } from './utils'` |
| Type-only import correction | TypeScript, provable from AST    | `import type { Type }`          |
| Unused import removal       | Symbol not referenced in file    | Remove unused import            |

**Level 3: LLM Suggested (Unverified)**

| Description        | Constraint            |
| ------------------ | --------------------- |
| LLM proposes fix   | Must cite evidence    |
| Labeled unverified | Clear UI distinction  |
| Not auto-applied   | Human review required |

### 10.3 Unambiguous Symbol Definition

For missing import insertion, a symbol is "unambiguous" if and only if:

| Condition          | Requirement                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| Unique export      | Exactly ONE exported symbol with that name exists in analyzed import graph |
| OR namespace match | Exactly one candidate in same package/module scope                         |
| AND not shadowed   | No local variable/parameter shadows the name in target scope               |
| AND resolvable     | Import path is valid (not circular, not private)                           |

**If ambiguous:**

| Scenario            | Action                                                |
| ------------------- | ----------------------------------------------------- |
| Multiple candidates | Do NOT generate patch; pass candidates to LLM as hint |
| Zero candidates     | Do NOT generate patch; report as "unknown symbol"     |
| Shadowing detected  | Do NOT generate patch; report conflict                |

### 10.4 Patch Safety Checks (Strict Mode)

Additional checks required for `auto_apply_eligible = true`:

**10.4.1 Import-Specific Checks**

| Check                           | Requirement                                              | Rationale                                    |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| No path aliases unless resolved | If tsconfig `paths` used, must resolve unambiguously     | Path aliases can be misconfigured            |
| No conflicting import style     | No existing import from same module with different style | Avoid format conflicts                       |
| No barrel export ambiguity      | If module is a barrel (index.ts), verify specific export | Barrel exports can re-export conflicts       |
| No side-effect import conflict  | If module has side effects, warn                         | Side-effect imports have different semantics |

**10.4.2 Formatting Checks**

| Check                    | Requirement                                 | Rationale                           |
| ------------------------ | ------------------------------------------- | ----------------------------------- |
| Formatter available      | Only run formatter if configured in project | Don't assume prettier/eslint exists |
| Formatter config exists  | Respect .prettierrc, .eslintrc if present   | Match project style                 |
| No formatting-only patch | Patch must have semantic change             | Don't generate noise                |

**10.4.3 Merge Safety**

| Check                             | Requirement                           | Rationale      |
| --------------------------------- | ------------------------------------- | -------------- |
| No conflict with existing imports | New import doesn't duplicate existing | Clean merge    |
| Insertion point deterministic     | Always insert at same location        | Reproducible   |
| Whitespace normalized             | Consistent newlines                   | Cross-platform |

### 10.5 Patch Verification

**10.5.1 Verification Strategy**

| Mode   | When                            | Description              |
| ------ | ------------------------------- | ------------------------ |
| Off    | Default                         | No verification          |
| On     | Tenant opt-in OR CI environment | Run compile check        |
| Strict | High-confidence patches only    | Must pass to be eligible |

**Recommended:** Enable verification in CI environments if `tsc --noEmit` completes in < 3 seconds.

**10.5.2 Verification Process**

| Step | Description                                      |
| ---- | ------------------------------------------------ |
| 1    | Generate patch                                   |
| 2    | Apply to temporary copy of file                  |
| 3    | Run verification command                         |
| 4    | Check for new errors introduced                  |
| 5    | If passes: mark `verified = true`                |
| 6    | If fails: mark `verified = false`, record output |

**10.5.3 Verification Commands**

| Language   | Command                                                     | Timeout |
| ---------- | ----------------------------------------------------------- | ------- |
| TypeScript | `tsc --noEmit --skipLibCheck`                               | 5s      |
| JavaScript | `eslint --no-eslintrc --rule 'import/no-unresolved: error'` | 2s      |
| Go         | `go build ./...`                                            | 10s     |
| Python     | `python -m py_compile {file}`                               | 1s      |

**Configuration:**

| Parameter                   | Default     | Description          |
| --------------------------- | ----------- | -------------------- |
| AST_PATCH_VERIFY_ENABLED    | false       | Enable verification  |
| AST_PATCH_VERIFY_TIMEOUT_MS | 5000        | Verification timeout |
| AST_PATCH_VERIFY_COMMAND    | auto-detect | Override command     |
| AST_PATCH_VERIFY_IN_CI      | true        | Auto-enable in CI    |

### 10.6 Safety Rules Summary

| Rule                         | Description                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| Never auto-apply             | Unless: validated + reversible + minimal diff + explicit tenant opt-in |
| Verification recommended     | Enable in CI environments                                              |
| Label clearly                | "Verified Fix" vs "Suggested Fix (unverified)"                         |
| Diff preview                 | Show exact changes before any application                              |
| Audit trail                  | Record who/what generated the patch                                    |
| Strict checks for auto-apply | All 10.4 checks must pass                                              |

### 10.7 Output: PatchCandidate

| Field               | Type            | Description                              |
| ------------------- | --------------- | ---------------------------------------- |
| patch_id            | string          | AST-PATCH-{hash}                         |
| level               | enum            | tool_verified, mechanical, llm_suggested |
| transformation      | string          | e.g., "missing_import"                   |
| file_path           | string          | File to modify                           |
| line_start          | number          | Start line of change                     |
| line_end            | number          | End line of change                       |
| original_content    | string          | Lines being replaced                     |
| replacement_content | string          | New content                              |
| confidence          | number          | 0.0-1.0                                  |
| evidence_ids        | string[]        | Supporting evidence                      |
| reversible          | boolean         | Can be undone?                           |
| auto_apply_eligible | boolean         | Safe for auto-apply?                     |
| verified            | boolean \| null | Verification result                      |
| verification_output | string \| null  | Verification details                     |

---

## 11. Evidence Catalog

### 11.1 Evidence ID Scheme

**Format:** `{PREFIX}-{HASH}`

| Component | Description                    |
| --------- | ------------------------------ |
| PREFIX    | Evidence type identifier       |
| HASH      | First 12 characters of SHA-256 |

### 11.2 Evidence Types

| Prefix    | Type      | Description              |
| --------- | --------- | ------------------------ |
| AST-FILE  | File      | Resolved file            |
| AST-SYM   | Symbol    | Extracted symbol         |
| AST-IMP   | Import    | Import statement         |
| AST-TYPE  | Type      | Resolved type            |
| AST-CTX   | Context   | Code context snippet     |
| AST-XREF  | Cross-ref | Validation result        |
| AST-LIMIT | Limit     | Budget exhaustion record |
| AST-PATCH | Patch     | Patch candidate          |

### 11.3 Hash Computation

**AST-FILE:**

```
SHA256(resolved_path + ref_sha)
```

**AST-SYM:**

```
SHA256(file_path + kind + name + line_start + signature)
```

**AST-IMP:**

```
SHA256(source_file + import_path + sorted(imported_symbols).join(","))
```

**AST-CTX:**

```
SHA256(artifact_id + snippet_start + snippet_end)
```

**AST-XREF:**

```
SHA256(artifact_id + overall_status + sorted(checks_performed).join(","))
```

**AST-LIMIT:**

```
SHA256(limit_type + mode_used + budget_name + budget_value)
```

**AST-PATCH:**

```
SHA256(file_path + line_start + transformation + replacement_content)
```

### 11.4 AST-LIMIT Evidence

Records budget exhaustion for LLM citation:

| Field              | Type     | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| id                 | string   | AST-LIMIT-{hash}                                         |
| display_label      | string   | "limit:files_skipped:15"                                 |
| limit_type         | enum     | files_skipped, depth_exceeded, timeout, deep_ast_skipped |
| mode_used          | enum     | fast, full, full_seed_only                               |
| budget_name        | string   | e.g., "max_parse_files"                                  |
| budget_value       | number   | Configured limit                                         |
| actual_value       | number   | What was reached                                         |
| skipped_items      | string[] | First N skipped items                                    |
| skipped_count      | number   | Total skipped                                            |
| affected_artifacts | string[] | Artifact IDs impacted                                    |

**LLM Usage Examples:**

> "Import chain analysis was limited to depth 2 due to budget constraints [AST-LIMIT-abc123]."

> "Deep type analysis was skipped for 15 files [AST-LIMIT-def456]. Type-related findings may be incomplete."

### 11.5 Evidence Record Structure

| Field         | Type             | Description                                                       |
| ------------- | ---------------- | ----------------------------------------------------------------- |
| id            | string           | AST-\*-{hash}                                                     |
| display_label | string           | Human-readable label                                              |
| type          | enum             | file, symbol, import, type, context, cross_ref, limit, patch, env |
| source        | enum             | tree_sitter, ts_morph, go_packages, validator, enricher, budget   |
| deterministic | boolean          | Always true for AST evidence                                      |
| payload       | object           | Type-specific data                                                |
| derived_from  | string[] \| null | Parent evidence IDs (MANDATORY for some types)                    |
| created_at    | string           | ISO timestamp                                                     |

### 11.6 Evidence Linking Rules

Every evidence record must maintain proper provenance through `derived_from` links.

**Mandatory Linking Requirements:**

| Evidence Type | Must Link To                 | Rationale                      |
| ------------- | ---------------------------- | ------------------------------ |
| AST-SYM       | AST-FILE                     | Symbol exists in a file        |
| AST-CTX       | AST-FILE                     | Context extracted from file    |
| AST-CTX       | AST-XREF (if validated)      | Context supports validation    |
| AST-XREF      | AST-FILE (if file resolved)  | Validation references file     |
| AST-XREF      | AST-SYM (if symbol checked)  | Validation references symbol   |
| AST-PATCH     | AST-SYM (for import patches) | Patch based on symbol analysis |
| AST-PATCH     | AST-IMP (for import patches) | Patch modifies imports         |
| AST-TYPE      | AST-SYM                      | Type derived from symbol       |
| AST-IMP       | AST-FILE                     | Import exists in file          |

**Example Evidence Chain:**

```
AST-FILE-abc123 (src/utils/parser.ts)
  └── AST-SYM-def456 (function:parseValue:38)
       └── AST-TYPE-ghi789 (number)
  └── AST-CTX-jkl012 (snippet lines 38-44)
       └── derived_from: [AST-FILE-abc123, AST-XREF-mno345]
  └── AST-XREF-mno345 (validated)
       └── derived_from: [AST-FILE-abc123, AST-SYM-def456]
```

**Linking Enforcement:**

| Violation                               | Action                 |
| --------------------------------------- | ---------------------- |
| AST-CTX without AST-FILE link           | Reject evidence        |
| AST-PATCH without supporting evidence   | Mark as unverified     |
| Circular derived_from                   | Reject (indicates bug) |
| derived_from references non-existent ID | Warn, proceed          |

**Cache Key Optimization:**

To avoid duplicate entries, use `content_sha` as join key:

| Cache        | Primary Key    | Join Key    |
| ------------ | -------------- | ----------- |
| File content | path + ref_sha | content_sha |
| Parsed AST   | content_sha    | content_sha |
| Symbol index | content_sha    | content_sha |

This ensures that identical file content (even at different paths) shares parsed AST cache.

---

# Part III: Output & Integration

---

## 12. Output: EnrichedEvidence

### 12.1 Structure

EnrichedEvidence extends AggregatedEvidence with:

| Field                | Type                          | Description                        |
| -------------------- | ----------------------------- | ---------------------------------- |
| artifacts            | EnrichedArtifact[]            | Artifacts with AST enrichment      |
| resolved_files       | Map<string, ResolvedFile>     | Path → ResolvedFile                |
| parsed_files         | Map<string, ParsedFile>       | Path → ParsedFile                  |
| symbol_index         | Map<string, ExtractedSymbol>  | Symbol ID → Symbol                 |
| import_graph         | ImportGraph \| null           | Import dependencies (if mode=full) |
| call_graph           | CallGraph \| null             | Call relationships (if computed)   |
| validation_results   | Map<string, ValidationResult> | Artifact ID → Validation           |
| patch_candidates     | PatchCandidate[]              | Mechanical patches                 |
| limit_evidence       | ASTLimitEvidence[]            | Budget exhaustion records          |
| ast_evidence_catalog | Map<string, EvidenceRecord>   | All AST evidence                   |
| enrichment_stats     | EnrichmentStats               | Processing statistics              |
| mode_used            | enum                          | fast, full, full_seed_only         |

### 12.2 EnrichmentStats

| Field                         | Type    | Description                  |
| ----------------------------- | ------- | ---------------------------- |
| mode                          | enum    | fast, full, full_seed_only   |
| files_requested               | number  | Seed files from artifacts    |
| files_resolved                | number  | Successfully resolved        |
| files_unresolved              | number  | Failed to resolve            |
| files_expanded                | number  | From import expansion        |
| files_parsed                  | number  | Successfully parsed          |
| files_deep_analyzed           | number  | With deep AST                |
| files_skipped_budget          | number  | Skipped due to limits        |
| symbols_extracted             | number  | Total symbols                |
| artifacts_total               | number  | Input artifact count         |
| artifacts_enriched            | number  | With code context            |
| artifacts_validated           | number  | With validation status       |
| artifacts_validated_pass      | number  | Status = validated           |
| artifacts_partially_validated | number  | Status = partially_validated |
| artifacts_validated_fail      | number  | Status = invalid             |
| fuzzy_exact                   | number  | Exact line matches           |
| fuzzy_nearby                  | number  | Nearby matches               |
| fuzzy_drift                   | number  | Drift matches                |
| fuzzy_fallback                | number  | Tier B matches               |
| fuzzy_no_match                | number  | No match found               |
| patch_candidates_generated    | number  | Patches created              |
| patch_candidates_verified     | number  | Patches verified             |
| limit_evidence_count          | number  | AST-LIMIT records            |
| total_time_ms                 | number  | Total AST layer time         |
| file_resolution_time_ms       | number  | Stage 3.5a time              |
| parsing_time_ms               | number  | Stage 3.5b time              |
| deep_analysis_time_ms         | number  | Stage 3.5c time              |
| enrichment_time_ms            | number  | Stage 3.5d time              |
| validation_time_ms            | number  | Stage 3.5e time              |
| budget_exhausted              | boolean | Any budget hit?              |

---

## 13. Integration with Stage 4

### 13.1 Enhanced Evidence Packet

Stage 4 (Final Analysis) receives an enhanced prompt with AST context:

**Section 1: Artifacts with Code Context**

````
## ARTIFACT: FND-tsc-TS2322-1
Type: compiler_error
Severity: error
File: src/utils/parser.ts
Line: 42

### Error Message:
Type 'string' is not assignable to type 'number'.

### Code Context [AST-CTX-abc123]:
```typescript
38 | function parseValue(input: string): number {
39 |   const trimmed = input.trim();
40 |   if (!trimmed) {
41 |     return null;  // ← Error here
42 |   }
43 |   return parseInt(trimmed, 10);
44 | }
````

### Containing Symbol [AST-SYM-def456]:

function parseValue(input: string): number
Lines: 38-44

### Validation [AST-XREF-ghi789]:

Status: validated
Match: exact (line 42)

```

**Section 2: Symbol Index**

```

## RELEVANT SYMBOLS

AST-SYM-def456: src/utils/parser.ts:function:parseValue:38
Signature: function parseValue(input: string): number

AST-SYM-jkl012: src/utils/parser.ts:function:formatOutput:46
Signature: function formatOutput(value: number): string
Calls: parseValue

```

**Section 3: Import Graph (if available)**

```

## IMPORT CHAIN

src/index.ts
└── src/utils/parser.ts (parseValue)
└── src/types/index.ts (ValueType) [UNRESOLVED]

```

**Section 4: Budget Limits**

```

## ANALYSIS LIMITS

[AST-LIMIT-mno345]: Import expansion stopped at depth 2.
[AST-LIMIT-pqr678]: 15 files skipped due to budget (max_parse_files=100).

```

**Section 5: Patch Candidates**

```

## AVAILABLE PATCHES

[AST-PATCH-stu901]: Missing import
File: src/index.ts
Level: mechanical
Confidence: 0.95
Change: Add `import { ValueType } from './types'`

```

### 13.2 LLM Narrator Rules (Extended for AST)

| Rule | Description |
| ---- | ----------- |
| MUST cite AST evidence | When referencing code, cite AST-SYM, AST-CTX IDs |
| MUST cite AST-LIMIT | When analysis incomplete, explain with AST-LIMIT IDs |
| MUST NOT claim | If validation = invalid, don't claim file/line/symbol exists |
| SHOULD prefer | Validated artifacts over unvalidated in root cause |
| SHOULD use | Code snippets in explanations |
| MUST NOT invent | Code not present in evidence |
| MUST distinguish | "Verified Fix" vs "Suggested Fix (unverified)" for patches |

### 13.3 Stage 4 Output Enforcement

To ensure "LLM as narrator only" is enforced, not just a guideline:

**13.3.1 Output Schema Validation**

Stage 4 must produce structured output (AnalysisResponse) that is validated:

| Field | Validation |
| ----- | ---------- |
| root_cause.evidence_ids | Must reference valid evidence IDs |
| annotations[].file_path | Must match artifact.file_path or resolved_path |
| annotations[].line_number | Must match artifact.line or fuzzy_match.matched_line |
| suggested_fixes[].evidence_ids | Must reference supporting evidence |

**13.3.2 Citation Enforcement**

| Check | Action on Failure |
| ----- | ----------------- |
| File/line claim without AST-XREF | Warn in output, downgrade confidence |
| Code snippet not from AST-CTX | Reject claim, ask for regeneration |
| Symbol reference without AST-SYM | Flag as unverified |
| Fix suggestion without evidence | Label as "LLM-suggested (unverified)" |

**13.3.3 Hallucination Detection**

| Pattern | Detection | Response |
| ------- | --------- | -------- |
| Claims file exists but validation=invalid | Compare claim vs validation_status | Reject claim |
| Quotes code not in any AST-CTX | Search all code_context snippets | Flag as hallucination |
| References line outside file bounds | Check line vs line_count | Reject |
| Claims symbol exists but symbol_not_found | Check AST-SYM index | Downgrade |

**13.3.4 Enforcement Implementation**

```

Post-Stage-4 Validator:

1. Parse AnalysisResponse
2. For each claim referencing file/line/symbol:
   a. Check if AST evidence exists for this claim
   b. If AST exists but claim doesn't cite it: flag
   c. If AST contradicts claim: reject
3. For each code snippet in output:
   a. Verify it appears in an AST-CTX
   b. If not found: flag as potential hallucination
4. Output validation report
5. If critical violations: request regeneration OR downgrade confidence

```

**13.3.5 Enforcement Severity Tiers**

Not all violations are equal. Use graduated responses:

| Severity | Condition | Action |
| -------- | --------- | ------ |
| Minor | Single citation miss, claim otherwise plausible | Warn, downgrade confidence by 0.1 |
| Moderate | Repeated citation misses (2-3) | Downgrade confidence by 0.3, flag for review |
| Major | Claim contradicts AST evidence | Hard reject claim |
| Critical | Fabricated code snippet | Request regeneration |

**Escalation Logic:**

```

1. Count violations by severity
2. If critical > 0: regenerate
3. If major > 0: reject specific claims, proceed with remainder
4. If moderate > AST_HALLUCINATION_THRESHOLD: regenerate
5. If minor only: warn, adjust confidence, proceed

```

This avoids unnecessary regenerations for trivial misses while blocking real hallucinations.

**Configuration:**

| Parameter | Default | Description |
| --------- | ------- | ----------- |
| AST_ENFORCE_CITATIONS | true | Require AST citations |
| AST_REJECT_UNCITED_CLAIMS | false | Hard reject vs soft warn |
| AST_HALLUCINATION_THRESHOLD | 2 | Max moderate violations before rejection |
| AST_MINOR_CONFIDENCE_PENALTY | 0.1 | Confidence reduction for minor violations |
| AST_MODERATE_CONFIDENCE_PENALTY | 0.3 | Confidence reduction for moderate violations |

### 13.4 Annotation Enhancement

| Field | Without AST | With AST |
| ----- | ----------- | -------- |
| file_path | From log (may drift) | Validated against repo |
| line_number | From log (may drift) | Fuzzy-corrected |
| message | Generic | With code context |
| evidence_id | Log-only | + AST-XREF |
| suggested_fix | LLM only | May include mechanical patch |

---

## 14. Performance Budget

### 14.1 Time Budgets by Mode

**Fast Mode:**

| Stage | Budget | Notes |
| ----- | ------ | ----- |
| File Resolution | 2s | Seed files only |
| Tree-sitter Parsing | 2s | Seed files only |
| Deep AST | 0s | Skipped |
| Context Enrichment | 1s | Basic snippets |
| Cross-Reference | 1s | Validation |
| **Total** | **6s** | |

**Full Mode:**

| Stage | Budget | Notes |
| ----- | ------ | ----- |
| File Resolution | 3s | + expanded files |
| Tree-sitter Parsing | 4s | + imports |
| Deep AST | 10s | ts-morph/go/packages |
| Context Enrichment | 2s | Full context |
| Cross-Reference | 1s | Validation |
| **Total** | **20s** | |

**Full-Seed-Only Mode:**

| Stage | Budget | Notes |
| ----- | ------ | ----- |
| File Resolution | 2s | Seed only |
| Tree-sitter Parsing | 3s | Seed only |
| Deep AST | 5s | Top K files only |
| Context Enrichment | 1s | Seed only |
| Cross-Reference | 1s | Validation |
| **Total** | **12s** | |

### 14.2 Resource Limits

| Resource | Limit | Rationale |
| -------- | ----- | --------- |
| Max seed files | 100 | Prevent explosion |
| Max expanded files | 100 | Not a code indexer |
| Max deep AST files | 50 (full), 20 (seed_only) | Memory |
| Max symbols per file | 500 | Reasonable cap |
| Max snippet lines | 20 | Context window |
| Max import depth | 3 | Prevent loops |
| GitHub API concurrency | 5 | Rate limits |
| File size limit | 500KB | Memory |

### 14.3 Caching Strategy

| Cache | Key | TTL | Storage |
| ----- | --- | --- | ------- |
| File content | SHA256(path + ref_sha) | 24h | Redis |
| Parsed AST | SHA256(content) | 24h | Redis |
| Symbol index | SHA256(content) | 24h | Redis |
| Deep analysis | SHA256(project_files + ref_sha) | 1h | Redis |

**Cache Invalidation:**

| Trigger | Action |
| ------- | ------ |
| New commit pushed | Deep analysis cache invalidated |
| File content changed | All caches for that file invalidated |
| TTL expiry | Entry evicted |
| Manual purge | Tenant-initiated clear |

### 14.4 Concurrency Configuration

| Operation | Concurrency | Notes |
| --------- | ----------- | ----- |
| GitHub file fetches | 5 parallel | Rate limit safe |
| Tree-sitter parsing | 10 parallel | Per-language queues |
| Deep AST analysis | 1 sequential | ts-morph not thread-safe |

---

## 15. Error Handling

### 15.1 Graceful Degradation Matrix

| Failure | Behavior | Output |
| ------- | -------- | ------ |
| File resolution (partial) | Continue with resolved | Partial ResolvedFile map |
| File resolution (all fail) | Skip AST layer | AggregatedEvidence as-is |
| Parse error (single file) | Continue | Partial AST, error_nodes populated |
| Parse error (all files) | Skip AST layer | AggregatedEvidence as-is |
| ts-morph fails | Fallback | Tree-sitter only for TS/JS |
| go/packages fails | Fallback | Tree-sitter only for Go |
| Timeout (single file) | Skip file | AST-LIMIT evidence |
| Timeout (entire stage) | Return partial | AST-LIMIT evidence |
| GitHub API rate limit | Retry/partial | Queue, continue with resolved |
| GitHub API 500 | Retry 3x, then skip | Partial results |

### 15.2 Error Recording

| Field | Type | Description |
| ----- | ---- | ----------- |
| stage | enum | resolution, parsing, deep_ast, enrichment, validation |
| file_path | string \| null | Which file (if applicable) |
| error_type | enum | timeout, parse_error, api_error, budget, unknown |
| error_message | string | Details |
| fallback_used | string \| null | What fallback applied |
| affected_artifacts | string[] | Impacted artifact IDs |
| timestamp | string | ISO timestamp |

---

# Part IV: Implementation

---

## 16. Implementation Phases

### Phase 1: File Resolution + Tree-sitter (Weeks 1-2)

**Goal:** File resolution with base/head awareness, Tree-sitter parsing for Tier 1 languages

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 1.1 | Path normalizer | Handles all CI platforms |
| 1.2 | Ref resolver | Correct base/head selection |
| 1.3 | GitHub file fetcher | Works with ref parameter |
| 1.4 | Fuzzy path matcher | Suffix + disambiguation |
| 1.5 | Tree-sitter setup | Tier 1 grammars installed |
| 1.6 | Language detector | Extension + shebang |
| 1.7 | Parser wrapper | Unified interface |
| 1.8 | Symbol extractor | All symbol types |
| 1.9 | Budget controller | Seed + limits enforced |
| 1.10 | Redis caching | File + AST cache working |

**Exit Criteria:**
- 90% path resolution rate
- Tier 1 languages parse correctly
- Budget limits enforced
- Cache hit rate > 50%

### Phase 2: Validation + Enrichment (Weeks 3-4)

**Goal:** Fuzzy cross-reference validation, code context enrichment

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 2.1 | File exists check | Correct status assignment |
| 2.2 | Line bounds check | Marks out-of-bounds |
| 2.3 | Fuzzy line matcher | 2-tier search working |
| 2.4 | Symbol exists check | Links to AST symbols |
| 2.5 | Confidence adjuster | Per specification |
| 2.6 | Snippet extractor | With line numbers |
| 2.7 | Symbol context | Containing symbol linked |
| 2.8 | Evidence ID generator | Hash-based, stable |
| 2.9 | Evidence catalog | Full schema populated |

**Exit Criteria:**
- 85% fuzzy match success rate
- All artifacts have validation status
- Evidence IDs stable and unique

### Phase 3: Deep AST — TypeScript/JavaScript (Week 5)

**Goal:** ts-morph integration for TS/JS projects

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 3.1 | ts-morph project setup | Auto-detects tsconfig |
| 3.2 | Type resolver | Returns resolved types |
| 3.3 | Import resolver | Handles node_modules |
| 3.4 | Call graph builder | Finds callers/callees |
| 3.5 | Performance limiter | 30s timeout enforced |
| 3.6 | Mode controller | Fast/full/seed_only working |

**Exit Criteria:**
- Types resolved for TS projects
- Import chains traced
- Within time budget

### Phase 4: Deep AST — Go + Python (Week 6)

**Goal:** go/packages for Go, optional jedi for Python

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 4.1 | go/packages setup | Handles go.mod |
| 4.2 | Go type resolver | Via go/types |
| 4.3 | Go import resolver | Module-aware |
| 4.4 | Python stdlib ast | Basic AST working |
| 4.5 | Jedi integration | Gated, optional |

**Exit Criteria:**
- Go projects analyzed correctly
- Python basic analysis works
- Jedi properly gated

### Phase 5: Mechanical Patches (Week 7)

**Goal:** Generate safe mechanical patch candidates

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 5.1 | Missing import detector | Finds candidates |
| 5.2 | Import generator | Correct syntax |
| 5.3 | Unused import detector | Accurate detection |
| 5.4 | Patch builder | Full schema |
| 5.5 | Safety classifier | Conservative rules |
| 5.6 | Optional verifier | Dry-run check |

**Exit Criteria:**
- Patches generated for import issues
- 90% apply cleanly
- Safety rules enforced

### Phase 6: Integration + Polish (Week 8)

**Goal:** Full integration with Stage 4, metrics, documentation

| Task | Description | Acceptance Criteria |
| ---- | ----------- | ------------------- |
| 6.1 | Evidence packet builder | Formats for Stage 4 |
| 6.2 | Prompt enhancement | Uses code context |
| 6.3 | Annotation enrichment | Fuzzy-corrected locations |
| 6.4 | Metrics collection | All stats tracked |
| 6.5 | Error monitoring | Alerts configured |
| 6.6 | E2E testing | All scenarios pass |
| 6.7 | Documentation | Complete |

**Exit Criteria:**
- Full pipeline works end-to-end
- All metrics tracked in dashboard
- Documentation complete

### Future Phases

| Phase | Content | Timeline |
| ----- | ------- | -------- |
| 7 | Rust deep AST (rust-analyzer) | TBD |
| 8 | Java deep AST (JavaParser) | TBD |
| 9 | C/C++ semantic analysis | TBD |
| 10 | Additional Tier 2 deep AST | TBD |

---

## 17. Success Metrics

### 17.1 Operational Metrics

| Metric | Target | Measurement |
| ------ | ------ | ----------- |
| File resolution rate | > 90% | resolved / requested |
| Parse success rate | > 95% | parsed / resolved |
| Validation rate | > 80% | artifacts with status |
| Validation pass rate | > 70% | validated + partial |
| Fuzzy match success | > 85% | found / attempted |
| Enrichment coverage | > 70% | with code context |
| Fast mode p95 latency | < 6s | end-to-end |
| Full mode p95 latency | < 20s | end-to-end |
| Cache hit rate | > 60% | after warmup |
| Annotation accuracy | > 95% | correct file:line |
| Patch precision | > 90% | apply cleanly |

### 17.2 Trust & Safety Metrics

| Metric | Target | Measurement | Why It Matters |
| ------ | ------ | ----------- | -------------- |
| **Hallucination catch rate** | > 95% | invalid claims caught / total invalid claims | Headline metric — proves AST value |
| Citation compliance | > 90% | claims with valid citations / total claims | LLM following narrator rules |
| False positive rate | < 5% | valid claims rejected / total claims | Enforcement not too aggressive |
| Regeneration rate | < 10% | regenerations triggered / total analyses | Enforcement efficiency |

**Hallucination Catch Rate Calculation:**

```

hallucination_catch_rate = (
claims_rejected_by_ast_contradiction +
claims_flagged_as_fabricated
) / (
total_claims_that_would_have_been_hallucinations_without_ast
)

```

This metric:
- Differentiates KenchiOps from every "AI assistant" competitor
- Quantifies the value of the AST layer
- Becomes a headline number for marketing and trust-building

---

## 18. Configuration Reference

### 18.1 Environment Variables

**Core Settings:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_MODE | auto | fast, full, full_seed_only, auto |
| AST_MAX_SEED_FILES | 100 | Max seed files |
| AST_MAX_EXPANDED_FILES | 100 | Max total files |
| AST_MAX_DEEP_FILES | 50 | Max deep analysis files |
| AST_FULL_SEED_ONLY_THRESHOLD | 50 | Trigger for full_seed_only |
| AST_FULL_SEED_ONLY_DEEP_LIMIT | 20 | Deep limit in seed_only mode |
| AST_EXPAND_IMPORTS | false | Enable import expansion |
| AST_MAX_GRAPH_DEPTH | 2 | Import chain depth |

**Fuzzy Matching:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_FUZZY_WINDOW | 25 | Tier A search window |
| AST_FUZZY_FALLBACK_WHOLE_FILE | true | Enable Tier B |
| AST_FUZZY_MAX_FILE_LINES | 5000 | Max file size for Tier B |
| AST_FUZZY_FALLBACK_TIMEOUT_MS | 100 | Tier B timeout |
| AST_FUZZY_MIN_TOKEN_OVERLAP | 0.6 | Similarity threshold |
| AST_NEEDLE_MIN_TOKEN_LENGTH | 3 | Min token length in needle |
| AST_NEEDLE_FILTER_NUMBERS | true | Filter pure numeric tokens |
| AST_NEEDLE_MAX_TOKENS | 50 | Max tokens in needle |

**File Resolution:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_MAX_TREE_FILES | 10000 | Max repo files for full fuzzy |
| AST_TREE_CACHE_TTL_HOURS | 24 | Cache TTL for file tree |
| AST_FUZZY_PR_FILES_ONLY | false | Force PR-files-only fuzzy |
| AST_MAX_FILE_SIZE_KB | 500 | Max file size to parse |

**Context & Snippets:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_SNIPPET_CONTEXT | 5 | Lines around error |
| AST_MAX_SNIPPET_LINES | 20 | Max snippet size |

**Timeouts:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_TIMEOUT_FILE_MS | 5000 | Per-file parse timeout |
| AST_TIMEOUT_DEEP_MS | 30000 | Deep analysis timeout |

**Caching:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_CACHE_TTL_HOURS | 24 | File/AST cache TTL |
| AST_DEEP_CACHE_TTL_HOURS | 1 | Deep analysis cache TTL |

**Concurrency:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_GITHUB_CONCURRENCY | 5 | Parallel GitHub API calls |
| AST_PARSE_CONCURRENCY | CPU_COUNT | Parallel Tree-sitter parsing |

**Deep AST Tools:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_ENABLE_JEDI | false | Python jedi integration |
| AST_TYPESCRIPT_VERSION | (bundled) | Pin TypeScript version |
| AST_GO_VERSION | (system) | Pin Go version |
| GOPROXY | (system) | Go module proxy |

**Patch Generation:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_ENABLE_PATCHES | true | Generate patches |
| AST_PATCH_VERIFY_ENABLED | false | Verify patches |
| AST_PATCH_VERIFY_TIMEOUT_MS | 5000 | Verification timeout |
| AST_PATCH_VERIFY_IN_CI | true | Auto-enable verification in CI |

**Mode Selection (Enhanced):**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_MODE_SEVERITY_THRESHOLD | 5 | Min severity score for full mode |
| AST_MODE_COST_THRESHOLD | 100 | Max cost score for full mode |
| AST_MODE_REPO_SIZE_LIMIT | 10000 | Repo files triggering fast mode |

**Stage 4 Enforcement:**

| Variable | Default | Description |
| -------- | ------- | ----------- |
| AST_ENFORCE_CITATIONS | true | Require AST citations in output |
| AST_REJECT_UNCITED_CLAIMS | false | Hard reject vs soft warn |
| AST_HALLUCINATION_THRESHOLD | 2 | Max uncited claims before rejection |

### 18.2 Tenant Overrides

| Setting | Options | Description |
| ------- | ------- | ----------- |
| ast_mode | fast_only, full_only, full_seed_only, auto | Mode override |
| ast_enabled | true, false | Enable/disable AST layer |
| ast_patches_enabled | true, false | Enable patch generation |
| ast_patch_verify_enabled | true, false | Enable patch verification |
| ast_deep_languages | [list] | Languages for deep AST |
| ast_fuzzy_fallback | true, false | Enable Tier B matching |
| ast_budget_tier | low, standard, high | Affects mode selection |

---

## 19. Glossary

| Term | Definition |
| ---- | ---------- |
| AST | Abstract Syntax Tree — structured representation of source code |
| Tree-sitter | Fast, incremental parsing library supporting 100+ languages |
| ts-morph | TypeScript compiler API wrapper for semantic analysis |
| go/packages | Go package loading and type checking library |
| Symbol | Named code entity (function, class, variable, type, etc.) |
| Deep AST | Analysis using full type system (ts-morph, go/types) |
| Shallow AST | Syntax-only analysis (Tree-sitter) |
| Cross-reference | Validation linking log facts to code facts |
| Fuzzy matching | Finding content with tolerance for line drift |
| Code context | Surrounding code snippet added to artifact |
| Import chain | Sequence of imports from entry to target file |
| Mechanical patch | Deterministic code transformation |
| Seed files | Files directly referenced by artifacts |
| Demand-driven | Parse only what's needed, not entire repo |
| Base/Head | PR base commit vs head commit |
| Ref side | Which commit (base or head) a file was fetched from |
| Hermetic | Isolated execution with no external dependencies |
| Needle | Extracted tokens from log snippet for fuzzy matching |

---

## 20. Changelog

| Version | Changes |
| ------- | ------- |
| 1.0 | Initial specification |
| 2.0 | Demand-driven parsing, base/head awareness, fuzzy matching, evidence IDs |
| 2.1 | Full_seed_only mode, 2-tier fuzzy, definitive failures, AST-LIMIT |
| 3.0 | Comprehensive consolidation, assumes chunking exists, full schemas |
| 3.1 | Determinism contract (AST-ENV, tool pinning), repo file index strategy, canonical needle extractor, stricter patch safety, enhanced mode selection, Stage 4 enforcement rules, evidence linking rules, upstream artifact requirements |

---

## 21. Implementation Priority (Maximum ROI)

For fastest value delivery, implement in this order:

| Phase | Components | Value |
| ----- | ---------- | ----- |
| 1 | File resolution + snippet extraction | Basic code context |
| 2 | Validation (file exists, line bounds, fuzzy match) | Reduce hallucinations |
| 3 | Tree-sitter symbols | Symbol awareness |
| 4 | Deep AST (ts-morph/go) | Type-aware analysis |
| 5 | Patches | Automated fixes |

Even without deep AST, validating file/line and showing correct snippets will massively improve Stage 4 accuracy.

---

# Appendix A: Design Rationale

## A.1 Why This Architecture

This section documents the key design decisions and why they matter.

### A.1.1 Provenance Discipline (Class A-E)

**Decision:** Formally separate log-derived facts (Class A) from AST-derived facts (Class B) with explicit cross-reference (Class C).

**Rationale:**
- Makes it impossible by design for the LLM to "upgrade" log noise into truth
- All findings are traceable to their source
- Confidence scores reflect actual verification status
- Debugging is straightforward: follow the evidence chain

**Alternative rejected:** Single fact class with "source" tag. This conflates trust levels and makes it easy to accidentally treat log claims as verified.

### A.1.2 Demand-Driven vs Repo Indexing

**Decision:** Parse only files reachable from artifacts, not the entire repository.

**Rationale:**
- Latency bounded (6-20 seconds, not minutes)
- Cost predictable (scales with failure complexity, not repo size)
- Failure modes explainable (AST-LIMIT evidence)
- Avoids becoming a code search engine

**Alternative rejected:** Pre-index entire repo. This would add latency, cost, and complexity without proportional benefit for CI/CD analysis.

### A.1.3 Base/Head + Drift-Aware Validation

**Decision:** Handle ref resolution first, then apply drift detection probabilistically.

**Rationale:**
- Log lines often reference pre-change code (stale line numbers)
- Binary "match/no-match" would reject valid errors
- Definitive vs non-definitive failures prevents false confidence
- Line drift is common; treating it as validation failure would be wrong

**Alternative rejected:** Strict line matching. This would mark most real errors as "invalid" due to normal PR drift.

### A.1.4 Conservative Patch Generation

**Decision:** Require unambiguous symbol definition, shadowing checks, and optional verification.

**Rationale:**
- Trust-destroying suggestions are worse than no suggestions
- Patches must be provably correct or clearly labeled as unverified
- Human review is the default, not the exception
- Verification (when enabled) catches subtle issues

**Alternative rejected:** Aggressive auto-fix. This would generate plausible-looking but incorrect patches that damage user trust.

### A.1.5 LLM as Narrator Only

**Decision:** LLM may only cite evidence; it cannot produce facts.

**Rationale:**
- LLMs hallucinate; evidence catalogs don't
- All claims must be traceable to specific evidence IDs
- Stage 4 enforcement makes this policy, not just philosophy
- Users can verify any claim by checking the evidence

**Alternative rejected:** LLM-driven analysis with post-hoc validation. This inverts the trust model and makes hallucinations harder to catch.

## A.2 What This System Is Not

| This System | Not This |
| ----------- | -------- |
| Grounded reasoning substrate | "AI log analysis" |
| Evidence-first analysis | Pattern matching with LLM gloss |
| Demand-driven parser | Repository indexer |
| Conservative fix suggester | Auto-fix everything |
| Probabilistic validation | Binary pass/fail |

## A.3 Key Invariants

These properties must be maintained across all implementations:

| Invariant | Enforcement |
| --------- | ----------- |
| AST evidence is deterministic | Hermetic execution, version pinning |
| Provenance is preserved | Evidence linking rules |
| LLM cannot invent evidence | Stage 4 enforcement |
| Failures are explainable | AST-LIMIT evidence |
| Trust levels are explicit | Class A-E separation |
| **Evidence generation is monotonic** | **AST layer adds only; never removes/rewrites upstream** |

**Critical Invariant: Monotonicity**

> The AST layer may only **add** evidence. It must never remove, rewrite, or reinterpret upstream artifacts.

This guarantees:
- Replayability (same inputs → same evidence, always additive)
- Protection from "optimization" regressions
- AST is enrichment, never correction

## A.4 Terminology Precision

| Term | Definition |
| ---- | ---------- |
| **Deterministic** | Same inputs → same outputs within the defined execution envelope |
| **Reproducible** | Same inputs + same tool versions → byte-identical evidence |

The AST layer is deterministic by design. With pinned tool versions (AST-ENV), it is also reproducible.

---

# Appendix B: Language Tier Details

*(Moved from main body for spec clarity)*

**Tier 3-6 languages are fully supported via Tree-sitter but do not have deep AST tools.**

See Section 6.4 for the complete language list.

---

# End of Document
```
