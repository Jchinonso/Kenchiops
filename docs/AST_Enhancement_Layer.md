# CI/CD Log Analysis: AST Enhancement Layer

## Implementation Plan v2.1

---

## Executive Summary

This document specifies the AST (Abstract Syntax Tree) Enhancement Layer that activates **after chunking and cheap extraction** in the KenchiOps CI/CD log analysis pipeline. The AST layer provides **source code ground truth** that enables:

1. Precise error localization (file, line, column)
2. Language-aware context enrichment
3. Mechanical patch candidates for limited transformations
4. Cross-reference validation between log artifacts and actual code

**Prerequisites**: This layer assumes chunking (Stage 0-1) and cheap extraction (Stage 2) are already implemented and producing `ExtractedArtifact[]` and `AggregatedEvidence`.

**Core Principle**: AST parsing is **deterministic**. It produces verifiable facts about source code that the LLM narrator can cite but never invent.

**Interface Contract**: AST layer consumes ONLY `AggregatedEvidence` + repo metadata and emits `EnrichedEvidence`. It does not modify chunking/extraction schemas and does not require raw logs.

---

## Where AST Fits in the Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│  Stage 0: Preprocessing (sanitization, secret redaction)        │
│  Stage 1: Smart Chunking (token-aware, protected zones)         │
│  Stage 2: Cheap Extraction (Haiku/mini → ExtractedArtifact[])   │
│  Stage 3: Aggregation (dedup, rank, AggregatedEvidence)         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NEW: AST ENHANCEMENT LAYER                  │
├─────────────────────────────────────────────────────────────────┤
│  Stage 3.5a: File Resolution (artifact paths → repo files)      │
│  Stage 3.5b: AST Parsing (Tree-sitter, demand-driven)           │
│  Stage 3.5c: Deep AST Analysis (ts-morph, go/packages, gated)   │
│  Stage 3.5d: Context Enrichment (add code context to artifacts) │
│  Stage 3.5e: Cross-Reference Validation (fuzzy matching)        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXISTING PIPELINE (continued)               │
├─────────────────────────────────────────────────────────────────┤
│  Stage 4: Final Analysis (Sonnet/GPT-4o → AnalysisResponse)     │
│  Stage 5: Output & Dispatch (PR comments, Slack, etc.)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Coupling Prevention Rules

To guarantee AST layer does not break chunking:

| Rule              | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| No raw log access | AST must not require raw logs, only artifact references + repo code                               |
| No ID mutation    | AST must not change artifact evidence IDs, only append `ast_evidence_ids` and `validation_status` |
| Schema isolation  | AggregatedEvidence schema unchanged; EnrichedEvidence extends it                                  |
| Graceful bypass   | If AST layer fails entirely, pipeline proceeds with log-only evidence                             |

---

## Architecture Overview

```
                    ┌──────────────────────────┐
                    │   AggregatedEvidence     │
                    │   (from Stage 3)         │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   File Resolver          │
                    │  • Map artifact paths    │
                    │  • Base/Head awareness   │
                    │  • Handle missing files  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Demand-Driven Parser   │
                    │  • Seed files only       │
                    │  • Budget-limited expand │
                    │  • Tree-sitter (all)     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Deep AST Layer         │
                    │  • ts-morph (TS/JS only) │
                    │  • go/packages (Go)      │
                    │  • Optional, gated       │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Context Enricher       │
                    │  • Add code snippets     │
                    │  • Add symbol info       │
                    │  • Add import chains     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Cross-Reference        │
                    │   Validator              │
                    │  • Fuzzy line matching   │
                    │  • Confidence adjustment │
                    │  • Flag invalid artifacts│
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   EnrichedEvidence       │
                    │   (to Stage 4)           │
                    └──────────────────────────┘
```

---

## Deterministic Boundary

### Non-Negotiable System Law

> **AST parsing is deterministic.**
> **The same source code always produces the same AST.**
> **AST-derived facts are ground truth evidence but remain Class B to preserve provenance clarity.**

### Fact Class Hierarchy

The AST layer extends (does not replace) the existing fact classes:

**Class A — Log-Derived Facts** (existing, unchanged)

| Attribute   | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| Produced By | Chunk extractor (Stage 2)                                           |
| Examples    | Error messages, stack traces, test failures, file paths from logs   |
| Properties  | Extracted from CI logs, may contain stale/incorrect paths           |
| Trust Level | Medium — logs reflect CI runtime state, may drift from current code |

**Class B — AST-Derived Facts** (NEW)

| Attribute   | Value                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| Produced By | Tree-sitter, ts-morph, language parsers                                     |
| Examples    | Function signatures, import statements, class definitions, symbol locations |
| Properties  | Deterministic given same source, verifiable, current state of code          |
| Trust Level | High — ground truth for code structure at analyzed commit                   |

**Class C — Cross-Referenced Facts** (NEW)

| Attribute   | Value                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Produced By | Cross-reference validator                                                          |
| Examples    | "Error at line 45 refers to function `processPayment` which exists at lines 42-67" |
| Properties  | Links Class A to Class B, validates or invalidates log claims                      |
| Trust Level | Derived — confidence depends on match quality                                      |

**Class D — Enrichment Context** (NEW)

| Attribute   | Value                                                                |
| ----------- | -------------------------------------------------------------------- |
| Produced By | Context enricher                                                     |
| Examples    | Surrounding code, related functions, import chains, type definitions |
| Properties  | Additional context for LLM, all traceable to AST                     |
| Trust Level | High — directly derived from Class B                                 |

### Provenance Principle

> AST facts are deterministic and verifiable, therefore "ground truth evidence," but remain a distinct class (Class B) to preserve provenance clarity.

This matters for downstream validation and confidence math. Never conflate Class A (log-derived) with Class B (AST-derived).

---

## Deterministic Input Definition

AST analysis must define exactly which code snapshot it analyzes to avoid "flaky" validations.

### Ref Resolution Policy

| Scenario                             | Ref Used                   | Rationale                            |
| ------------------------------------ | -------------------------- | ------------------------------------ |
| Default                              | head_sha                   | Analyze current state of PR          |
| File deleted in PR                   | base_sha                   | File exists only in base             |
| File added in PR                     | head_sha                   | File exists only in head             |
| Artifact references pre-change lines | head_sha + drift detection | Log may show old lines, detect drift |
| Explicit base analysis requested     | base_sha                   | For debugging/comparison             |

### ResolvedFile Ref Fields

Every resolved file must include:

| Field             | Description                                |
| ----------------- | ------------------------------------------ |
| ref_sha           | The commit SHA used to fetch this file     |
| ref_side          | `base` or `head`                           |
| is_from_pr_change | Boolean: was this file modified in the PR? |

---

## Stage 3.5a: File Resolution

### Purpose

Map file paths from extracted artifacts to actual files in the repository with base/head awareness.

### Input

| Field     | Source                                |
| --------- | ------------------------------------- |
| artifacts | From AggregatedEvidence               |
| repo_root | From build metadata                   |
| head_sha  | PR head commit                        |
| base_sha  | PR base commit                        |
| pr_files  | From GitHub API (files changed in PR) |

### Resolution Strategy

**Step 1: Extract Seed Paths**

Collect file paths from artifacts (demand-driven, not all repo files):

| Source                   | Description            |
| ------------------------ | ---------------------- |
| artifact.file_path       | Direct file references |
| Stack trace frames       | Files in stack traces  |
| Compiler error locations | Files with errors      |
| Test file references     | Test files that failed |

**Step 2: Normalize Paths**

| Normalization       | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| Remove CI prefixes  | Strip `/home/runner/work/repo/repo/`, `D:\a\repo\repo\`, etc. |
| Unify separators    | Convert `\` to `/`                                            |
| Resolve relative    | Resolve `../` and `./`                                        |
| Lowercase (Windows) | Normalize case for case-insensitive filesystems               |

**Step 3: Determine Ref Side**

| Condition                            | Ref Decision                         |
| ------------------------------------ | ------------------------------------ |
| File in pr_files AND exists in head  | Use head_sha                         |
| File in pr_files AND deleted in head | Use base_sha, mark `deleted_in_head` |
| File NOT in pr_files                 | Use head_sha (unchanged file)        |
| File not found in either             | Mark as unresolved                   |

**Step 4: Fetch File Content**

| Source         | Method                                              | Priority     |
| -------------- | --------------------------------------------------- | ------------ |
| Local checkout | Direct file read                                    | 1 (fastest)  |
| GitHub API     | GET /repos/{owner}/{repo}/contents/{path}?ref={sha} | 2            |
| PR diff        | Extract from diff payload                           | 3 (fallback) |

**Step 5: Handle Failures**

| Scenario           | Action                                        |
| ------------------ | --------------------------------------------- |
| File exists        | Add to resolved files                         |
| File deleted in PR | Fetch from base_sha, mark `ref_side: base`    |
| File never existed | Mark as unresolved, flag artifact             |
| Path ambiguous     | Attempt fuzzy path match (see below)          |
| API rate limit     | Queue for retry, proceed with partial results |

### Path Fuzzy Match Policy

When exact path resolution fails, apply deterministic fuzzy matching:

**Step 1: Normalize and Strip**

| Action                   | Description                                     |
| ------------------------ | ----------------------------------------------- |
| Apply all normalizations | From Step 2 above                               |
| Strip known CI prefixes  | `/home/runner/work/`, `D:\a\`, `/builds/`, etc. |
| Strip build output paths | `dist/`, `build/`, `out/`, `.next/`, `target/`  |

**Step 2: Suffix Match**

| Action                | Description                                      |
| --------------------- | ------------------------------------------------ |
| Extract file suffix   | Last 2-3 path segments (e.g., `utils/parser.ts`) |
| Search repo file list | Find all files ending with suffix                |
| Filter by extension   | Must match original extension                    |

**Step 3: Disambiguation (if multiple matches)**

| Priority | Rule                                           | Rationale                  |
| -------- | ---------------------------------------------- | -------------------------- |
| 1        | Exact suffix match                             | Most specific              |
| 2        | Same directory as other resolved stack frames  | Locality principle         |
| 3        | Shortest path distance to other resolved files | Related files cluster      |
| 4        | Most recently changed in PR                    | Likely relevant to failure |
| 5        | Alphabetically first                           | Deterministic tiebreaker   |

**Step 4: Output**

| Field                 | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| resolution_method     | exact, suffix_match, fuzzy_directory, unresolved             |
| resolution_confidence | 1.0 (exact), 0.8 (suffix), 0.6 (directory), 0.0 (unresolved) |
| fuzzy_candidates      | Other candidates considered (for debugging)                  |

### Output: ResolvedFile

| Field                 | Description                                      |
| --------------------- | ------------------------------------------------ |
| original_path         | Path from artifact (as logged)                   |
| resolved_path         | Canonical path in repo                           |
| resolution_status     | resolved, deleted_in_head, unresolved, ambiguous |
| resolution_method     | exact, suffix_match, fuzzy_directory, unresolved |
| resolution_confidence | 0.0-1.0 (1.0 for exact, lower for fuzzy)         |
| fuzzy_candidates      | Other candidates considered (if fuzzy match)     |
| content               | File content (if resolved)                       |
| content_sha           | SHA-256 of content for caching                   |
| source                | local, github_api, pr_diff                       |
| ref_sha               | Commit SHA used to fetch                         |
| ref_side              | base or head                                     |
| is_from_pr_change     | Was this file modified in the PR?                |
| line_count            | Total lines in file                              |

---

## Stage 3.5b: AST Parsing (Tree-sitter)

### Purpose

Parse resolved files into Abstract Syntax Trees. **Demand-driven**: parse only files reachable from artifacts, not entire repository.

### Demand-Driven Parsing Policy

| Parameter       | Default                    | Description                        |
| --------------- | -------------------------- | ---------------------------------- |
| seed_files      | artifact.file_path set     | Starting files (always parsed)     |
| max_parse_files | 100                        | Hard cap on total files            |
| max_graph_depth | 2                          | Import/callee expansion depth      |
| expand_imports  | false (fast) / true (full) | Whether to follow imports          |
| stop_on_budget  | true                       | Stop expanding when budget reached |

### Expansion Rules

| Step | Action                                                      |
| ---- | ----------------------------------------------------------- |
| 1    | Parse all seed files (from artifacts)                       |
| 2    | If expand_imports enabled, add direct imports of seed files |
| 3    | If depth < max_graph_depth, recurse on new files            |
| 4    | Stop when max_parse_files reached                           |
| 5    | Record which files were skipped due to budget               |

### AST Modes

| Mode           | Trigger                                    | Behavior                                   |
| -------------- | ------------------------------------------ | ------------------------------------------ |
| Fast (default) | Build passed, or tenant setting            | Seed files only, no deep AST, no expansion |
| Full           | Severity = fatal/error AND file count ≤ 50 | Includes import expansion + deep AST       |
| Full-Seed-Only | Severity = fatal/error AND file count > 50 | Deep AST on seed files only, no expansion  |

Mode selection criteria:

| Condition                        | Mode           | Rationale                                   |
| -------------------------------- | -------------- | ------------------------------------------- |
| Build passed (warnings only)     | Fast           | Warnings don't need deep analysis           |
| Build failed AND seed files ≤ 50 | Full           | Worth the extra time                        |
| Build failed AND seed files > 50 | Full-Seed-Only | Budget protection, but still analyze errors |
| Tenant override = fast_only      | Fast           | Respect tenant preference                   |
| Tenant override = always_full    | Full           | Respect tenant preference                   |

**Full-Seed-Only Mode Details:**

This mode prevents degraded analysis on the hardest failures (many files involved):

| Behavior               | Full Mode | Full-Seed-Only Mode       |
| ---------------------- | --------- | ------------------------- |
| Parse seed files       | Yes       | Yes                       |
| Deep AST on seed files | Yes       | Yes (top K error-related) |
| Expand imports         | Yes       | No                        |
| Parse expanded files   | Yes       | No                        |
| Deep AST on expanded   | Yes       | No                        |
| Max deep AST files     | 50        | 20 (seed files only)      |

Configuration:

| Parameter                 | Default     | Description                            |
| ------------------------- | ----------- | -------------------------------------- |
| full_seed_only_threshold  | 50          | Seed file count triggering this mode   |
| full_seed_only_deep_limit | 20          | Max files for deep AST in this mode    |
| full_seed_only_prioritize | error_lines | Prioritize files with most error lines |

### Supported Languages

**Tier 1 — Full Support (Deep AST Available)**

| Language   | Tree-sitter Grammar    | Deep AST Tool                        | Phase             |
| ---------- | ---------------------- | ------------------------------------ | ----------------- |
| TypeScript | tree-sitter-typescript | ts-morph                             | Phase 1           |
| JavaScript | tree-sitter-javascript | ts-morph                             | Phase 1           |
| Python     | tree-sitter-python     | ast (stdlib), jedi (optional, gated) | Phase 1           |
| Go         | tree-sitter-go         | go/packages + go/types               | Phase 1           |
| Java       | tree-sitter-java       | JavaParser                           | Phase 2           |
| Rust       | tree-sitter-rust       | Tree-sitter only (deep AST Phase 3+) | Phase 1 (shallow) |

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

**Tier 3 — Basic Support (Tree-sitter Parsing)**

| Language   | Tree-sitter Grammar    | Notes              |
| ---------- | ---------------------- | ------------------ |
| Dart       | tree-sitter-dart       | Flutter            |
| Elixir     | tree-sitter-elixir     | Phoenix            |
| Erlang     | tree-sitter-erlang     | OTP                |
| Haskell    | tree-sitter-haskell    | Functional         |
| Clojure    | tree-sitter-clojure    | JVM Lisp           |
| F#         | tree-sitter-fsharp     | .NET functional    |
| Lua        | tree-sitter-lua        | Scripting, games   |
| Perl       | tree-sitter-perl       | Legacy systems     |
| R          | tree-sitter-r          | Data science       |
| Julia      | tree-sitter-julia      | Scientific         |
| Groovy     | tree-sitter-groovy     | Gradle, Jenkins    |
| PowerShell | tree-sitter-powershell | Windows automation |
| Bash/Shell | tree-sitter-bash       | CI scripts         |
| Zig        | tree-sitter-zig        | Systems            |
| Nim        | tree-sitter-nim        | Systems            |
| Crystal    | tree-sitter-crystal    | Ruby-like          |
| V          | tree-sitter-v          | Systems            |
| Odin       | tree-sitter-odin       | Systems            |

**Tier 4 — Markup/Config Support**

| Language   | Tree-sitter Grammar    | Notes            |
| ---------- | ---------------------- | ---------------- |
| HTML       | tree-sitter-html       | Web              |
| CSS        | tree-sitter-css        | Styling          |
| SCSS/Sass  | tree-sitter-scss       | CSS preprocessor |
| JSON       | tree-sitter-json       | Config           |
| YAML       | tree-sitter-yaml       | Config, CI       |
| TOML       | tree-sitter-toml       | Rust config      |
| XML        | tree-sitter-xml        | Config, data     |
| Markdown   | tree-sitter-markdown   | Documentation    |
| SQL        | tree-sitter-sql        | Database         |
| GraphQL    | tree-sitter-graphql    | API              |
| Protobuf   | tree-sitter-protobuf   | gRPC             |
| Dockerfile | tree-sitter-dockerfile | Containers       |
| HCL        | tree-sitter-hcl        | Terraform        |
| Nix        | tree-sitter-nix        | NixOS            |

**Tier 5 — Specialized/Legacy Support**

| Language      | Tree-sitter Grammar  | Notes              |
| ------------- | -------------------- | ------------------ |
| COBOL         | tree-sitter-cobol    | Enterprise legacy  |
| Fortran       | tree-sitter-fortran  | Scientific legacy  |
| Pascal/Delphi | tree-sitter-pascal   | Legacy             |
| Ada           | tree-sitter-ada      | Aerospace, defense |
| VHDL          | tree-sitter-vhdl     | Hardware           |
| Verilog       | tree-sitter-verilog  | Hardware           |
| Solidity      | tree-sitter-solidity | Smart contracts    |
| Move          | tree-sitter-move     | Blockchain         |
| Cairo         | tree-sitter-cairo    | StarkNet           |
| WebAssembly   | tree-sitter-wat      | WASM text format   |
| Assembly      | tree-sitter-asm      | Low-level          |
| Apex          | tree-sitter-apex     | Salesforce         |
| ABAP          | tree-sitter-abap     | SAP                |

**Tier 6 — Framework-Specific DSLs**

| Language/DSL | Tree-sitter Grammar    | Notes              |
| ------------ | ---------------------- | ------------------ |
| JSX          | tree-sitter-javascript | React              |
| TSX          | tree-sitter-typescript | React + TypeScript |
| Vue          | tree-sitter-vue        | Vue SFCs           |
| Svelte       | tree-sitter-svelte     | Svelte components  |
| Astro        | tree-sitter-astro      | Astro components   |
| MDX          | tree-sitter-mdx        | Markdown + JSX     |
| Prisma       | tree-sitter-prisma     | Database schema    |
| Thrift       | tree-sitter-thrift     | RPC                |
| Cap'n Proto  | tree-sitter-capnp      | Serialization      |
| Starlark     | tree-sitter-starlark   | Bazel              |
| Jsonnet      | tree-sitter-jsonnet    | Config generation  |
| Dhall        | tree-sitter-dhall      | Typed config       |
| CUE          | tree-sitter-cue        | Config validation  |

### Language Detection

| Method             | Priority | Description                          |
| ------------------ | -------- | ------------------------------------ |
| File extension     | 1        | Primary method (.ts, .py, .go, etc.) |
| Shebang            | 2        | For scripts (#!/usr/bin/env python)  |
| Package files      | 3        | package.json → JS/TS, go.mod → Go    |
| Content heuristics | 4        | When extension ambiguous             |

### Parsing Configuration

| Parameter        | Default | Description                 |
| ---------------- | ------- | --------------------------- |
| timeout_ms       | 5000    | Max parse time per file     |
| max_file_size_kb | 500     | Skip files larger than this |
| error_tolerance  | true    | Continue on parse errors    |
| include_comments | true    | Parse comments for context  |

### Parse Output: ParsedFile

| Field         | Description                         |
| ------------- | ----------------------------------- |
| file_path     | Resolved path                       |
| language      | Detected language                   |
| tree          | Tree-sitter syntax tree             |
| parse_time_ms | Time to parse                       |
| error_nodes   | List of error nodes (partial parse) |
| root_node     | Root AST node                       |
| symbols       | Extracted symbols (see below)       |
| parse_mode    | seed, expanded, skipped             |

### Extracted Symbol

| Field         | Description                                             |
| ------------- | ------------------------------------------------------- |
| id            | Hash-based ID (see Evidence ID Scheme)                  |
| display_label | Human-readable: `{file}:{kind}:{name}:{line}`           |
| name          | Symbol name                                             |
| kind          | function, class, method, variable, type, import, export |
| file_path     | Source file                                             |
| line_start    | Starting line (1-indexed)                               |
| line_end      | Ending line                                             |
| column_start  | Starting column                                         |
| column_end    | Ending column                                           |
| signature     | Full signature (for functions/methods)                  |
| parent_id     | Parent symbol ID (for nested)                           |
| modifiers     | public, private, async, static, etc.                    |

---

## Stage 3.5c: Deep AST Analysis

### Purpose

For languages with rich type systems, use language-specific tools for deeper analysis. **Gated by budget and mode.**

### When to Use Deep AST

| Condition                          | Deep AST?            |
| ---------------------------------- | -------------------- |
| Mode = fast                        | No                   |
| Mode = full AND language supported | Yes                  |
| Error involves type mismatch       | Yes (if TS/JS)       |
| Error involves imports/exports     | Yes (if TS/JS)       |
| File count > deep_ast_file_limit   | No (budget exceeded) |

### Language-Specific Deep AST Tools

**TypeScript/JavaScript: ts-morph**

| Capability        | Description                                      |
| ----------------- | ------------------------------------------------ |
| Type inference    | Get inferred types for variables and expressions |
| Import resolution | Resolve import paths to actual files             |
| Symbol navigation | Find references, go to definition                |
| Call hierarchy    | Who calls this function, what does it call       |
| Type hierarchy    | Inheritance chains, implemented interfaces       |

**Python: ast (stdlib) + jedi (optional)**

| Capability        | Tool         | Notes                           |
| ----------------- | ------------ | ------------------------------- |
| Basic AST         | ast (stdlib) | Always available                |
| Type inference    | jedi         | Optional, gated by budget       |
| Import resolution | jedi         | Optional, environment-dependent |

> **Note**: Jedi can be slow and environment-dependent. Make Jedi optional and gated by explicit budget allocation.

**Go: go/packages + go/types**

| Capability             | Description                            |
| ---------------------- | -------------------------------------- |
| Type checking          | Full type information                  |
| Import resolution      | Module-aware resolution                |
| Interface satisfaction | Which types implement which interfaces |

> **Note**: Prefer `go/packages` + `go/types` over just `go/ast` for real-world module resolution.

**Rust: Tree-sitter Only (v1)**

| Capability        | Description                        |
| ----------------- | ---------------------------------- |
| Syntax extraction | Tree-sitter                        |
| Symbol extraction | Basic (functions, structs, traits) |
| Deep analysis     | Deferred to Phase 3+               |

> **Note**: Rust Analyzer is a language server; integration complexity is non-trivial. Treat Rust deep AST as "future work" and stick to Tree-sitter + light symbol extraction in v1.

**Java: JavaParser**

| Capability        | Description                  |
| ----------------- | ---------------------------- |
| Full AST          | Complete Java syntax         |
| Type resolution   | With classpath configuration |
| Symbol extraction | Methods, classes, fields     |

### Deep Analysis Output

| Field              | Description                                 |
| ------------------ | ------------------------------------------- |
| resolved_types     | Map of symbol ID to resolved type           |
| import_graph       | Import dependency graph (within budget)     |
| call_graph         | Function call relationships (within budget) |
| type_hierarchy     | Class inheritance/interface implementation  |
| unresolved_imports | Imports that couldn't be resolved           |
| type_errors        | Type-related issues found during analysis   |
| analysis_mode      | full, partial, skipped                      |
| budget_exhausted   | Boolean: did we hit limits?                 |

### Performance Constraints

| Constraint                     | Value | Rationale                          |
| ------------------------------ | ----- | ---------------------------------- |
| Max files for deep analysis    | 50    | ts-morph/go/packages are expensive |
| Prioritize error-related files | Yes   | Focus on relevant files            |
| Timeout per project            | 30s   | Prevent runaway analysis           |
| Skip node_modules              | Yes   | Too large, not relevant            |
| Skip vendor/                   | Yes   | Go vendor directory                |
| Cache parsed projects          | Yes   | Reuse across builds                |

---

## Stage 3.5d: Context Enrichment

### Purpose

Add code context to extracted artifacts so the LLM has the actual code, not just error messages.

### Enrichment Types

**1. Code Snippet**

For each artifact with file_path and line_number:

| Field                     | Description                                |
| ------------------------- | ------------------------------------------ |
| snippet                   | Lines around the error (default: ±5 lines) |
| snippet_start             | First line of snippet                      |
| snippet_end               | Last line of snippet                       |
| highlight_line            | The specific error line                    |
| snippet_with_line_numbers | Formatted with line numbers                |
| max_snippet_lines         | 20 (configurable)                          |

**2. Symbol Context**

If the error line is within a symbol:

| Field                | Description                   |
| -------------------- | ----------------------------- |
| containing_symbol_id | Symbol the error is within    |
| symbol_signature     | Full signature                |
| symbol_start         | Symbol start line             |
| symbol_end           | Symbol end line               |
| symbol_kind          | function, class, method, etc. |

**3. Related Symbols**

Symbols referenced by the error context (budget-limited):

| Field                | Description                               |
| -------------------- | ----------------------------------------- |
| called_functions     | Functions called on/near the error line   |
| referenced_variables | Variables used                            |
| imported_from        | Where referenced symbols come from        |
| type_of_expression   | Type of the expression (if TypeScript/Go) |

**4. Import Context**

For import-related errors:

| Field             | Description                                    |
| ----------------- | ---------------------------------------------- |
| import_chain      | Full chain from entry to error (depth-limited) |
| missing_export    | What export is missing                         |
| available_exports | What the module does export                    |
| suggested_import  | Correct import if deterministically detectable |

### Enriched Artifact

Extends `RankedArtifact` with:

| Field             | Description                         |
| ----------------- | ----------------------------------- |
| code_context      | Code snippet with context           |
| symbol_context    | Containing symbol info              |
| related_symbols   | Referenced symbols (budget-limited) |
| import_context    | Import chain (if relevant)          |
| ast_evidence_ids  | IDs of AST-derived evidence         |
| validation_status | See Stage 3.5e                      |

---

## Stage 3.5e: Cross-Reference Validation

### Purpose

Validate that log-derived claims match the actual code state. **Uses fuzzy matching** to handle line drift.

### Validation Rules

**Rule 1: File Exists**

| Check                   | Pass                              | Fail                     |
| ----------------------- | --------------------------------- | ------------------------ |
| File path from artifact | File found in repo (head or base) | Mark as `file_not_found` |

**Rule 2: Line Bounds**

| Check                     | Pass                   | Fail                         |
| ------------------------- | ---------------------- | ---------------------------- |
| Line number from artifact | Within file line count | Mark as `line_out_of_bounds` |

**Rule 3: Symbol Exists**

| Check                          | Pass                | Fail                       |
| ------------------------------ | ------------------- | -------------------------- |
| Function/class name from error | Symbol found in AST | Mark as `symbol_not_found` |

**Rule 4: Line Content Match (Fuzzy, 2-Tier)**

Log line numbers are often wrong due to code changes between CI run and current commit, or due to:

- Compiled/transpiled output paths
- Generated files / sourcemaps
- Monorepo path rewrites
- Stack traces pointing to built artifacts

**Tier A: Window Search (Default)**

| Step | Action                                                               |
| ---- | -------------------------------------------------------------------- |
| 1    | Extract needle from log snippet (trim whitespace, remove timestamps) |
| 2    | Tokenize needle (split on whitespace, remove common noise)           |
| 3    | Search within window: `line_number ± AST_FUZZY_WINDOW` (default: 25) |
| 4    | Compute similarity score (token overlap / normalized edit distance)  |
| 5    | If match found, return result                                        |

**Tier B: Whole-File Fallback (Conditional)**

| Step | Action                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | If Tier A returns no_match AND file < AST_FUZZY_MAX_FILE_LINES  |
| 2    | Extract shorter token subset from needle (key identifiers only) |
| 3    | Search entire file for token subset                             |
| 4    | Cap search time at AST_FUZZY_FALLBACK_TIMEOUT_MS                |
| 5    | If match found, return with `match_type: fallback_whole_file`   |

**Fuzzy Match Configuration:**

| Parameter                     | Default | Description                   |
| ----------------------------- | ------- | ----------------------------- |
| AST_FUZZY_WINDOW              | 25      | Lines to search in Tier A (±) |
| AST_FUZZY_FALLBACK_WHOLE_FILE | true    | Enable Tier B fallback        |
| AST_FUZZY_MAX_FILE_LINES      | 5000    | Max file size for Tier B      |
| AST_FUZZY_FALLBACK_TIMEOUT_MS | 100     | Timeout for Tier B search     |
| AST_FUZZY_MIN_TOKEN_OVERLAP   | 0.6     | Minimum similarity threshold  |

**Match Types:**

| Match Type     | Criteria                             | Confidence Impact |
| -------------- | ------------------------------------ | ----------------- |
| match_exact    | Needle found at exact line           | +0.1              |
| match_nearby   | Needle found within ±10 lines        | +0.05             |
| match_drift    | Needle found within ±25 lines        | No change         |
| match_fallback | Found via whole-file search (Tier B) | -0.05             |
| no_match       | Not found after both tiers           | -0.2              |

**Fuzzy Match Output:**

| Field                | Description                              |
| -------------------- | ---------------------------------------- |
| original_line_number | Line from artifact                       |
| matched_line_number  | Actual line found (if any)               |
| match_type           | exact, nearby, drift, fallback, no_match |
| match_tier           | tier_a, tier_b, none                     |
| match_score          | 0.0-1.0 similarity score                 |
| line_drift           | Difference between original and matched  |
| tokens_matched       | Which tokens matched (for debugging)     |

**Rule 5: Type Consistency (TypeScript/Go only)**

| Check                   | Pass                              | Fail                    |
| ----------------------- | --------------------------------- | ----------------------- |
| Type from error message | Matches actual type from deep AST | Mark as `type_mismatch` |

### Validation Status

**Definitive vs Non-Definitive Failures**

Not all check failures are equal. Some definitively prove an artifact is invalid; others may fail due to incomplete analysis.

**Definitive Failures (→ invalid):**

| Failure            | Criteria                                              | Why Definitive                |
| ------------------ | ----------------------------------------------------- | ----------------------------- |
| file_not_found     | Searched both base and head + fuzzy path match failed | File genuinely doesn't exist  |
| line_out_of_bounds | Line > file.line_count AND no fuzzy match found       | Impossible line reference     |
| content_no_match   | Tier A + Tier B search both failed                    | Content genuinely not present |

**Non-Definitive Failures (→ partially_validated):**

| Failure          | Criteria                        | Why Non-Definitive                                 |
| ---------------- | ------------------------------- | -------------------------------------------------- |
| symbol_not_found | Symbol name from log not in AST | May be minified/aliased/dynamic                    |
| type_mismatch    | Deep AST type differs from log  | Deep AST may be partial, or project config missing |
| parse_error      | File couldn't be fully parsed   | Syntax error in file, not artifact's fault         |

**Status Assignment Rules:**

| Condition                                                 | Status              |
| --------------------------------------------------------- | ------------------- |
| All applicable checks pass                                | validated           |
| No definitive failures, but has non-definitive failures   | partially_validated |
| One or more definitive failures                           | invalid             |
| Cannot run checks (no file path, file unresolved, no AST) | unvalidatable       |

| Status              | Description                                              |
| ------------------- | -------------------------------------------------------- |
| validated           | All applicable checks pass                               |
| partially_validated | No definitive failures; may have non-definitive failures |
| invalid             | One or more definitive failures                          |
| unvalidatable       | Cannot check (no file path, no AST, file unresolved)     |

### Validation Record

| Field                 | Description                                            |
| --------------------- | ------------------------------------------------------ |
| artifact_id           | Artifact being validated                               |
| checks_performed      | Which rules were applied                               |
| checks_passed         | Which passed with details                              |
| checks_failed         | Which failed with details                              |
| fuzzy_match_result    | Result of Rule 4 (if applicable)                       |
| overall_status        | validated, partially_validated, invalid, unvalidatable |
| confidence_adjustment | How much to adjust artifact confidence                 |

### Confidence Adjustment Table

**Positive Adjustments (validation success):**

| Validation Result                | Confidence Adjustment |
| -------------------------------- | --------------------- |
| All checks pass (exact match)    | +0.1                  |
| All checks pass (nearby match)   | +0.05                 |
| All checks pass (drift match)    | No change             |
| All checks pass (fallback match) | -0.05                 |

**Negative Adjustments (definitive failures → invalid):**

| Validation Result                     | Confidence Adjustment |
| ------------------------------------- | --------------------- |
| file_not_found (after fuzzy path)     | -0.3                  |
| line_out_of_bounds (after fuzzy line) | -0.3                  |
| content_no_match (after Tier A + B)   | -0.2                  |

**Minor Adjustments (non-definitive failures → partially_validated):**

| Validation Result | Confidence Adjustment |
| ----------------- | --------------------- |
| symbol_not_found  | -0.05                 |
| type_mismatch     | -0.05                 |
| parse_error       | No change             |

---

## Mechanical Patch Candidates

### Scope Clarification

> AST enables deterministic _patch candidates_ only for a limited set of mechanical transformations; otherwise it provides grounding context for LLM suggestions.

**This is NOT general-purpose fix generation.** Most fixes are not deterministic.

### Patch Candidate Levels

**Level 1: Tool-Verified Fixes** (rare in CI logs)

| Source       | Description       |
| ------------ | ----------------- |
| ESLint --fix | Linter auto-fixes |
| rustfmt      | Formatter fixes   |
| gofmt        | Formatter fixes   |

These are only available if the CI tool explicitly outputs fix suggestions.

**Level 2: AST-Safe Mechanical Edits** (deterministic transformations)

| Transformation              | Criteria                               | Example                                            |
| --------------------------- | -------------------------------------- | -------------------------------------------------- |
| Missing import insertion    | Symbol is unambiguous (see below)      | Add `import { foo } from './utils'`                |
| Type-only import correction | TypeScript, provable from AST          | Change `import { Type }` to `import type { Type }` |
| Rename propagation          | After rename, update all references    | (Only if rename is known)                          |
| Unused import removal       | Symbol not referenced anywhere in file | Remove `import { unused }`                         |

**Unambiguous Symbol Definition (for Missing Import):**

A symbol is "unambiguous" if and only if:

| Condition                  | Requirement                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Unique export              | Exactly ONE exported symbol with that name exists in the analyzed import graph            |
| OR namespace match         | Exactly one candidate exists in same package/module namespace (Go) or TS path alias scope |
| AND not shadowed           | No local variable/parameter shadows the name in the target scope                          |
| AND import path resolvable | The source file can be imported (not circular, not private)                               |

**If ambiguous:**

| Scenario            | Action                                                           |
| ------------------- | ---------------------------------------------------------------- |
| Multiple candidates | Do NOT generate patch; pass candidates to LLM as unverified hint |
| Zero candidates     | Do NOT generate patch; report as "unknown symbol"                |
| Shadowing detected  | Do NOT generate patch; report conflict                           |

**Optional Verification Step (tenant opt-in):**

| Step                 | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| Dry-run compile/lint | Run `tsc --noEmit` or `eslint --fix-dry-run` on patched file |
| Verify no new errors | Patch must not introduce errors                              |
| Rollback on failure  | Discard patch if verification fails                          |

Configuration:

| Parameter                   | Default     | Description                 |
| --------------------------- | ----------- | --------------------------- |
| AST_PATCH_VERIFY_ENABLED    | false       | Enable dry-run verification |
| AST_PATCH_VERIFY_TIMEOUT_MS | 5000        | Timeout for verification    |
| AST_PATCH_VERIFY_COMMAND    | auto-detect | tsc, eslint, go build, etc. |

**Level 3: LLM Suggested Fixes (Unverified)**

| Description           | Constraints                  |
| --------------------- | ---------------------------- |
| LLM proposes fix      | Must be grounded in evidence |
| Labeled as unverified | Clear UI distinction         |
| Not auto-applied      | Requires human review        |

### Patch Candidate Safety Rules

| Rule                 | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| Never auto-apply     | Unless: validated + reversible + minimal diff + explicit tenant opt-in |
| Label clearly        | "Verified Fix" vs "Suggested Fix (unverified)"                         |
| Provide diff preview | Show exact changes before any application                              |
| Audit trail          | Record who/what generated the patch                                    |

### Patch Candidate Output

| Field               | Description                              |
| ------------------- | ---------------------------------------- |
| patch_id            | Unique ID                                |
| level               | tool_verified, mechanical, llm_suggested |
| file_path           | File to modify                           |
| original_content    | Lines to replace                         |
| replacement_content | New content                              |
| line_start          | Start line of change                     |
| line_end            | End line of change                       |
| confidence          | 0.0-1.0                                  |
| evidence_ids        | Supporting evidence                      |
| reversible          | Boolean                                  |
| auto_apply_eligible | Boolean (very rare)                      |

---

## Evidence ID Scheme

### Design Principles

| Principle           | Description                     |
| ------------------- | ------------------------------- |
| Stable              | Same input produces same ID     |
| Short               | Reasonable length for logs/APIs |
| Collision-resistant | Hash-based uniqueness           |
| Human-debuggable    | Display labels for readability  |

### ID Structure

**Format:** `{PREFIX}-{HASH}`

| Component | Description                             |
| --------- | --------------------------------------- |
| PREFIX    | Evidence type (AST-FILE, AST-SYM, etc.) |
| HASH      | First 12 characters of SHA-256          |

### Hash Computation

For each evidence type, hash specific fields:

**AST-FILE:**

```
hash(resolved_path + ref_sha)
```

**AST-SYM:**

```
hash(file_path + kind + name + line_start + signature)
```

**AST-IMP:**

```
hash(source_file + import_path + imported_symbols_sorted)
```

**AST-CTX:**

```
hash(artifact_id + snippet_start + snippet_end)
```

**AST-XREF:**

```
hash(artifact_id + validation_status + checks_performed_sorted)
```

**AST-LIMIT:**

```
hash(limit_type + mode_used + budget_values)
```

### AST-LIMIT Evidence (Budget Exhaustion)

When budgets are hit, record as first-class evidence so the LLM narrator can cite limitations cleanly.

**AST-LIMIT Payload:**

| Field         | Description                                              |
| ------------- | -------------------------------------------------------- |
| limit_type    | files_skipped, depth_exceeded, timeout, deep_ast_skipped |
| mode_used     | fast, full, full_seed_only                               |
| budget_name   | max_parse_files, max_graph_depth, timeout_ms, etc.       |
| budget_value  | The configured limit                                     |
| actual_value  | What was attempted/reached                               |
| skipped_items | List of files/symbols skipped (first N)                  |
| skipped_count | Total count of skipped items                             |
| impact        | Which artifacts affected by this limit                   |

**Usage in Stage 4:**

The LLM narrator can cite AST-LIMIT evidence to explain incomplete analysis:

> "Import chain analysis was limited to depth 2 due to budget constraints [AST-LIMIT-abc123]. Additional dependencies may exist."

> "Deep type analysis was skipped for 15 files [AST-LIMIT-def456]. Type-related findings may be incomplete."

### Evidence Record Structure

| Field         | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| id            | Hash-based ID (e.g., `AST-SYM-a1b2c3d4e5f6`)                               |
| display_label | Human-readable (e.g., `src/utils.ts:function:parseData:42`)                |
| type          | file, symbol, import, type, context, cross_ref, patch, limit               |
| source        | tree_sitter, ts_morph, go_packages, validator, enricher, budget_controller |
| deterministic | Always true for AST evidence                                               |
| payload       | Type-specific data                                                         |
| derived_from  | Parent evidence IDs (for cross-refs)                                       |
| created_at    | Timestamp                                                                  |

### Evidence ID Examples

| ID                     | Display Label                             | Description              |
| ---------------------- | ----------------------------------------- | ------------------------ |
| AST-FILE-a1b2c3d4e5f6  | src/utils/parser.ts@abc123                | Resolved file at commit  |
| AST-SYM-b2c3d4e5f6a1   | src/utils/parser.ts:function:parseJSON:42 | Function symbol          |
| AST-SYM-c3d4e5f6a1b2   | src/models/user.ts:class:User:10          | Class symbol             |
| AST-IMP-d4e5f6a1b2c3   | src/index.ts → ./utils/parser             | Import statement         |
| AST-CTX-e5f6a1b2c3d4   | context:FND-tsc-TS2322-1:L40-L50          | Code context             |
| AST-XREF-f6a1b2c3d4e5  | xref:FND-tsc-TS2322-1:validated           | Validation result        |
| AST-PATCH-1a2b3c4d5e6f | patch:src/index.ts:L42:mechanical         | Patch candidate          |
| AST-LIMIT-2b3c4d5e6f7a | limit:files_skipped:15                    | Budget exhaustion record |
| AST-XREF-f6a1b2c3d4e5  | xref:FND-tsc-TS2322-1:validated           | Validation result        |
| AST-PATCH-1a2b3c4d5e6f | patch:src/index.ts:L42:mechanical         | Patch candidate          |

---

## Performance Budget

### Time Budget by Mode

**Fast Mode (Default)**

| Stage               | Budget | Notes                             |
| ------------------- | ------ | --------------------------------- |
| File Resolution     | 2s     | Parallel fetches, seed files only |
| Tree-sitter Parsing | 2s     | Seed files only                   |
| Deep AST            | 0s     | Skipped                           |
| Context Enrichment  | 1s     | Basic snippets                    |
| Cross-Reference     | 1s     | Validation checks                 |
| **Total**           | **6s** | Added to pipeline                 |

**Full Mode (Failures Only)**

| Stage               | Budget  | Notes                      |
| ------------------- | ------- | -------------------------- |
| File Resolution     | 3s      | Parallel fetches, expanded |
| Tree-sitter Parsing | 4s      | Seed + imports             |
| Deep AST            | 10s     | ts-morph/go/packages       |
| Context Enrichment  | 2s      | Full context               |
| Cross-Reference     | 1s      | Validation checks          |
| **Total**           | **20s** | Added to pipeline          |

### Mode Selection Policy

| Condition                    | Mode | Rationale                         |
| ---------------------------- | ---- | --------------------------------- |
| Build passed                 | Fast | Warnings don't need deep analysis |
| Build failed (error/fatal)   | Full | Worth the extra time              |
| Seed file count > 50         | Fast | Budget protection                 |
| Tenant setting = fast_only   | Fast | Respect tenant preference         |
| Tenant setting = always_full | Full | Respect tenant preference         |

### Resource Limits

| Resource               | Limit | Rationale                     |
| ---------------------- | ----- | ----------------------------- |
| Max seed files         | 100   | Prevent explosion             |
| Max expanded files     | 100   | Prevent code indexer behavior |
| Max files for deep AST | 50    | ts-morph/go is heavy          |
| Max symbols per file   | 500   | Reasonable for any file       |
| Max snippet lines      | 20    | Context window budget         |
| Max import chain depth | 3     | Prevent infinite chains       |
| GitHub API concurrency | 5     | Rate limit protection         |

### Caching Strategy

| Cache         | Key                                    | TTL | Storage | Rationale                             |
| ------------- | -------------------------------------- | --- | ------- | ------------------------------------- |
| File content  | sha256(resolved_path + ref_sha)        | 24h | Redis   | Content tied to commit, stable        |
| Parsed AST    | sha256(content)                        | 24h | Redis   | AST deterministic for content         |
| Symbol index  | sha256(content)                        | 24h | Redis   | Symbols deterministic for content     |
| Deep analysis | sha256(project_files_sorted + ref_sha) | 1h  | Redis   | Project context may change more often |

**Cache Invalidation Rules:**

| Trigger             | Action                                                      |
| ------------------- | ----------------------------------------------------------- |
| New commit pushed   | Deep analysis cache invalidated (ref_sha changes)           |
| File content change | All caches for that file invalidated (content hash changes) |
| TTL expiry          | Cache entry evicted                                         |
| Manual purge        | Tenant can request cache clear                              |

### Concurrency Configuration

| Operation           | Concurrency  | Notes                       |
| ------------------- | ------------ | --------------------------- |
| GitHub file fetches | 5 parallel   | Rate limit safe             |
| Tree-sitter parsing | 10 parallel  | Per-language queues         |
| Deep AST analysis   | 1 sequential | ts-morph is not thread-safe |

---

## Error Handling

### Graceful Degradation

| Failure                         | Behavior                                       |
| ------------------------------- | ---------------------------------------------- |
| File resolution fails (partial) | Continue with resolved files                   |
| File resolution fails (all)     | Skip AST layer, proceed log-only               |
| Parse fails (syntax error)      | Use partial parse, flag in evidence            |
| ts-morph fails                  | Fall back to Tree-sitter only                  |
| go/packages fails               | Fall back to Tree-sitter only                  |
| Timeout (single file)           | Skip that file, continue                       |
| Timeout (entire stage)          | Return partial results, flag incomplete        |
| All AST fails                   | Skip AST layer, proceed with log-only evidence |
| GitHub API rate limit           | Queue for retry, partial results               |

### Error Recording

All errors are recorded for observability:

| Field         | Description                                                        |
| ------------- | ------------------------------------------------------------------ |
| stage         | Which AST stage failed                                             |
| file_path     | Which file (if applicable)                                         |
| error_type    | timeout, parse_error, resolution_error, api_error, budget_exceeded |
| error_message | Details                                                            |
| fallback_used | What fallback was applied                                          |
| impact        | Which artifacts affected                                           |

---

## Output: EnrichedEvidence

### Structure

| Field                | Description                                         |
| -------------------- | --------------------------------------------------- |
| artifacts            | Enriched artifacts with code context and validation |
| resolved_files       | Map of paths to ResolvedFile                        |
| parsed_files         | Map of paths to ParsedFile                          |
| symbol_index         | All extracted symbols by ID                         |
| import_graph         | Import dependency graph (if expanded)               |
| validation_results   | All cross-reference validations                     |
| patch_candidates     | Mechanical patch candidates (if any)                |
| limit_evidence       | AST-LIMIT records for budget exhaustion             |
| ast_evidence_catalog | AST-derived evidence entries (includes limits)      |
| enrichment_stats     | Processing statistics                               |
| mode_used            | fast, full, or full_seed_only                       |

### Enrichment Statistics

| Metric                        | Description                          |
| ----------------------------- | ------------------------------------ |
| mode                          | fast, full, or full_seed_only        |
| files_requested               | Seed files from artifacts            |
| files_resolved                | Successfully resolved                |
| files_expanded                | Additional files from imports        |
| files_parsed                  | Successfully parsed                  |
| files_deep_analyzed           | With ts-morph/go/packages analysis   |
| files_skipped_budget          | Skipped due to budget                |
| symbols_extracted             | Total symbols extracted              |
| artifacts_enriched            | Artifacts with code context          |
| artifacts_validated           | With validation status               |
| artifacts_validated_pass      | Passed all checks (validated)        |
| artifacts_partially_validated | Non-definitive failures only         |
| artifacts_validated_fail      | Definitive failures (invalid)        |
| fuzzy_matches_tier_a          | Matches found in window search       |
| fuzzy_matches_tier_b          | Matches found in whole-file fallback |
| fuzzy_no_match                | No match after both tiers            |
| patch_candidates_generated    | Mechanical patches found             |
| limit_evidence_count          | Number of AST-LIMIT records          |
| enrichment_time_ms            | Total enrichment time                |
| budget_exhausted              | Boolean                              |

---

## Integration with Stage 4

### Enhanced Analysis Prompt

The Stage 4 (Final Analysis) prompt is enhanced with AST context:

**New Sections in Evidence Packet:**

1. CODE CONTEXT — For each artifact with code_context, include snippet with line numbers
2. SYMBOL DEFINITIONS — Relevant symbols from symbol_index
3. IMPORT CHAINS — For import-related errors (if available)
4. VALIDATION STATUS — Which artifacts passed/failed validation
5. PATCH CANDIDATES — Available mechanical fixes (if any)

### LLM Narrator Rules (Extended)

Additional rules for AST evidence:

| Rule                   | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| MUST cite AST evidence | When referencing code structure, cite AST-SYM, AST-CTX IDs     |
| MUST cite AST-LIMIT    | When analysis is incomplete, cite AST-LIMIT IDs to explain why |
| MUST NOT claim         | File/line/symbol exists if validation status = invalid         |
| SHOULD prefer          | Validated artifacts over unvalidated in root cause             |
| SHOULD use             | Code snippets to explain errors                                |
| MUST NOT invent        | Code that isn't in evidence                                    |
| MUST distinguish       | "Verified Fix" vs "Suggested Fix" when presenting patches      |

### Annotation Enhancement

With AST data, annotations become more precise:

| Field         | Without AST             | With AST                       |
| ------------- | ----------------------- | ------------------------------ |
| file_path     | From log (may be stale) | Validated against repo         |
| line_number   | From log (may be wrong) | Fuzzy-matched, drift-corrected |
| message       | Generic                 | Includes actual code context   |
| evidence_id   | Log-derived only        | Includes AST-XREF evidence     |
| suggested_fix | LLM only                | May include mechanical patch   |

---

## Success Metrics

| Metric                     | Target | Measurement                          |
| -------------------------- | ------ | ------------------------------------ |
| File resolution rate       | > 90%  | Resolved / attempted                 |
| Parse success rate         | > 95%  | Parsed / resolved                    |
| Validation rate            | > 80%  | Artifacts with validation status     |
| Validation pass rate       | > 70%  | validated or partially_validated     |
| Fuzzy match success        | > 85%  | Matches found (any type) / attempted |
| Enrichment coverage        | > 70%  | Artifacts with code context          |
| Fast mode p95 latency      | < 6s   | End-to-end AST (fast mode)           |
| Full mode p95 latency      | < 20s  | End-to-end AST (full mode)           |
| Cache hit rate             | > 60%  | After warm-up period                 |
| Annotation accuracy        | > 95%  | Correct file:line references         |
| Mechanical patch precision | > 90%  | Patches that apply cleanly           |

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal**: File resolution with base/head awareness, Tree-sitter for Tier 1 languages

| Task                          | Description                          | Acceptance Criteria            |
| ----------------------------- | ------------------------------------ | ------------------------------ |
| 1.1 Path normalizer           | Normalize paths from artifacts       | Handles all CI platforms       |
| 1.2 Ref resolver              | Determine base vs head for each file | Correct ref selection          |
| 1.3 GitHub file fetcher       | Fetch files via API with ref         | Works with both SHAs           |
| 1.4 Local file resolver       | Resolve from local checkout          | Handles missing files          |
| 1.5 Resolution aggregator     | Combine sources, output ResolvedFile | Includes ref_sha, ref_side     |
| 1.6 Tree-sitter setup         | Install grammars for Tier 1          | TS, JS, Python, Go, Rust, Java |
| 1.7 Language detector         | Detect language from file            | Handles edge cases             |
| 1.8 Parser wrapper            | Unified parsing interface            | Returns ParsedFile             |
| 1.9 Symbol extractor          | Extract symbols from AST             | All symbol types               |
| 1.10 Demand-driven controller | Implement seed + budget logic        | Respects limits                |
| 1.11 Caching layer            | Cache resolved files + ASTs          | Redis integration              |

**Exit Criteria:**

- 90% of artifact paths resolve successfully
- Correct base/head selection for PR files
- Parses all Tier 1 languages
- Caching reduces API calls by 50%+

---

### Phase 2: Validation & Enrichment (Weeks 3-4)

**Goal**: Fuzzy cross-reference validation, context enrichment

| Task                      | Description                          | Acceptance Criteria       |
| ------------------------- | ------------------------------------ | ------------------------- |
| 2.1 File exists check     | Validate file paths                  | Correct status assignment |
| 2.2 Line bounds check     | Validate line numbers                | Marks out-of-bounds       |
| 2.3 Fuzzy line matcher    | Implement window search + similarity | Finds drifted lines       |
| 2.4 Symbol exists check   | Validate symbol names                | Links to AST symbols      |
| 2.5 Confidence adjuster   | Apply adjustment table               | Correct confidence math   |
| 2.6 Snippet extractor     | Extract code around error            | Configurable context      |
| 2.7 Symbol context        | Find containing symbol               | Links to AST symbols      |
| 2.8 Evidence ID generator | Hash-based IDs                       | Stable, short, unique     |
| 2.9 Evidence catalog      | Store all AST evidence               | Queryable by ID           |

**Exit Criteria:**

- Fuzzy matching finds 85%+ of drifted lines
- Validation status assigned to all artifacts
- All evidence has proper IDs

---

### Phase 3: Deep AST — TypeScript/JavaScript (Week 5)

**Goal**: ts-morph integration for TS/JS projects

| Task                       | Description                  | Acceptance Criteria    |
| -------------------------- | ---------------------------- | ---------------------- |
| 3.1 ts-morph project setup | Initialize ts-morph projects | Handles tsconfig.json  |
| 3.2 Type resolver          | Resolve types for symbols    | Returns resolved types |
| 3.3 Import resolver        | Resolve import chains        | Handles node_modules   |
| 3.4 Call graph builder     | Build function call graph    | Finds callers/callees  |
| 3.5 Performance limiter    | Enforce time/file limits     | Graceful timeout       |
| 3.6 Mode controller        | Implement fast vs full       | Correct mode selection |

**Exit Criteria:**

- Types resolved for TypeScript projects
- Import chains traced (depth-limited)
- Completes within 30s budget
- Mode selection works correctly

---

### Phase 4: Deep AST — Go + Python (Week 6)

**Goal**: go/packages for Go, optional jedi for Python

| Task                            | Description                    | Acceptance Criteria        |
| ------------------------------- | ------------------------------ | -------------------------- |
| 4.1 go/packages setup           | Initialize Go analysis         | Handles go.mod             |
| 4.2 Go type resolver            | Resolve types via go/types     | Returns resolved types     |
| 4.3 Go import resolver          | Module-aware import resolution | Handles replace directives |
| 4.4 Python ast integration      | Stdlib ast for basic analysis  | Always available           |
| 4.5 Jedi integration (optional) | Gated type inference           | Budget-controlled          |

**Exit Criteria:**

- Go projects analyzed with go/packages
- Python basic analysis works
- Jedi optional and gated

---

### Phase 5: Mechanical Patches (Week 7)

**Goal**: Generate safe mechanical patch candidates

| Task                           | Description                                    | Acceptance Criteria |
| ------------------------------ | ---------------------------------------------- | ------------------- |
| 5.1 Missing import detector    | Find unresolved symbols with available imports | Detects candidates  |
| 5.2 Import insertion generator | Generate import statement                      | Correct syntax      |
| 5.3 Unused import detector     | Find unreferenced imports                      | Accurate detection  |
| 5.4 Patch candidate builder    | Create patch with metadata                     | Includes all fields |
| 5.5 Safety classifier          | Determine auto-apply eligibility               | Conservative rules  |

**Exit Criteria:**

- Mechanical patches generated for import issues
- Patches apply cleanly > 90%
- Safety rules enforced

---

### Phase 6: Integration & Polish (Week 8)

**Goal**: Full integration with Stage 4, metrics, documentation

| Task                        | Description                       | Acceptance Criteria                      |
| --------------------------- | --------------------------------- | ---------------------------------------- |
| 6.1 Evidence packet builder | Build enhanced packet for Stage 4 | Includes all AST evidence                |
| 6.2 Prompt enhancement      | Update Stage 4 prompts            | Uses code context correctly              |
| 6.3 Annotation enrichment   | Improve PR annotations            | Uses validated/drift-corrected locations |
| 6.4 Metrics collection      | Track all success metrics         | Dashboard ready                          |
| 6.5 Error monitoring        | Track degradation/failures        | Alerts configured                        |
| 6.6 End-to-end testing      | Full pipeline tests               | All scenarios pass                       |

**Exit Criteria:**

- Full pipeline works end-to-end
- All success metrics tracked
- Documentation complete

---

### Phase 7+ (Future): Additional Deep AST

**Deferred Work:**

| Item                          | Phase    | Rationale                     |
| ----------------------------- | -------- | ----------------------------- |
| Rust deep AST (rust-analyzer) | Phase 7+ | Integration complexity        |
| Java deep AST (JavaParser)    | Phase 7+ | Classpath complexity          |
| C/C++ semantic analysis       | Phase 8+ | Requires compilation database |

---

## Appendix A: Language-Specific Notes

### Tier 1 Languages (Full Deep AST Support)

**TypeScript/JavaScript**

| Aspect                 | Handling                              |
| ---------------------- | ------------------------------------- |
| tsconfig.json          | Required for ts-morph, auto-detected  |
| jsconfig.json          | Used for JavaScript projects          |
| JSX/TSX                | Supported by Tree-sitter and ts-morph |
| ES modules vs CommonJS | Both supported                        |
| Source maps            | Not used (analyze source directly)    |
| node_modules           | Excluded from deep analysis           |
| Monorepo workspaces    | Detected via package.json workspaces  |
| Bundler configs        | Webpack, Vite, esbuild detected       |

**Python**

| Aspect               | Handling                      |
| -------------------- | ----------------------------- |
| Python 2 vs 3        | Tree-sitter handles both      |
| Type hints           | Extracted as annotations      |
| Docstrings           | Included in symbol info       |
| Virtual envs         | Not analyzed (source only)    |
| **init**.py          | Parsed for exports            |
| pyproject.toml       | Detected for project metadata |
| requirements.txt     | Parsed for dependencies       |
| setup.py / setup.cfg | Legacy project detection      |
| jedi                 | Optional, gated by budget     |

**Go**

| Aspect            | Handling                                 |
| ----------------- | ---------------------------------------- |
| go.mod            | Used for module detection                |
| Package structure | Fully understood                         |
| Interfaces        | Extracted as types                       |
| Goroutines        | Not special-cased                        |
| CGo               | Limited support                          |
| Generics          | Supported (Go 1.18+)                     |
| Build tags        | Detected but not evaluated               |
| Internal packages | Visibility rules understood              |
| vendor/           | Excluded from analysis                   |
| go/packages       | Used for deep analysis (not just go/ast) |

**Rust**

| Aspect            | Handling                                        |
| ----------------- | ----------------------------------------------- |
| Cargo.toml        | Used for crate detection                        |
| Macros            | Limited (not expanded)                          |
| Traits            | Extracted as types                              |
| Lifetimes         | Included in signatures                          |
| Unsafe blocks     | Flagged for attention                           |
| Workspace         | Multi-crate support                             |
| Feature flags     | Detected but not evaluated                      |
| Procedural macros | Not expanded                                    |
| Deep AST          | Deferred to Phase 7+ (rust-analyzer complexity) |

**Java**

| Aspect                | Handling                        |
| --------------------- | ------------------------------- |
| Maven (pom.xml)       | Project detection               |
| Gradle (build.gradle) | Project detection               |
| Package structure     | Fully understood                |
| Annotations           | Extracted                       |
| Generics              | Full support                    |
| Inner classes         | Handled correctly               |
| Records               | Supported (Java 14+)            |
| Sealed classes        | Supported (Java 17+)            |
| Deep AST              | Phase 7+ (classpath complexity) |

### Tier 2 Languages (Standard Support)

**C/C++**

| Aspect             | Handling                           |
| ------------------ | ---------------------------------- |
| Headers (.h, .hpp) | Parsed separately                  |
| Preprocessor       | Directives detected, not evaluated |
| Templates          | Syntax extracted                   |
| Namespaces         | Fully supported                    |
| CMakeLists.txt     | Project detection                  |
| Makefile           | Basic detection                    |

**C#**

| Aspect       | Handling              |
| ------------ | --------------------- |
| .csproj      | Project detection     |
| .sln         | Solution detection    |
| Namespaces   | Fully supported       |
| Generics     | Full support          |
| LINQ         | Syntax supported      |
| Async/await  | Pattern detected      |
| Records      | Supported             |
| .NET version | Detected from project |

**Ruby**

| Aspect          | Handling              |
| --------------- | --------------------- |
| Gemfile         | Dependency detection  |
| Rails structure | Convention detection  |
| Modules/Classes | Full extraction       |
| Blocks          | Syntax supported      |
| Metaprogramming | Limited (static only) |
| RSpec           | Test detection        |

**PHP**

| Aspect            | Handling            |
| ----------------- | ------------------- |
| composer.json     | Project detection   |
| PSR-4 autoloading | Namespace mapping   |
| Laravel           | Framework detection |
| Symfony           | Framework detection |
| Type hints        | Extracted (PHP 7+)  |
| Attributes        | Supported (PHP 8+)  |

**Kotlin**

| Aspect              | Handling                   |
| ------------------- | -------------------------- |
| build.gradle.kts    | Project detection          |
| Coroutines          | Syntax supported           |
| Data classes        | Detected                   |
| Sealed classes      | Supported                  |
| Extension functions | Extracted                  |
| Multiplatform       | Project structure detected |

**Swift**

| Aspect        | Handling           |
| ------------- | ------------------ |
| Package.swift | SPM detection      |
| Xcode project | Basic detection    |
| Protocols     | Extracted as types |
| Extensions    | Linked to types    |
| Async/await   | Pattern detected   |
| SwiftUI       | View detection     |

**Scala**

| Aspect       | Handling          |
| ------------ | ----------------- |
| build.sbt    | Project detection |
| Case classes | Detected          |
| Traits       | Extracted         |
| Implicits    | Syntax detected   |
| Scala 2 vs 3 | Both supported    |

### Tier 3 Languages (Basic Support)

**Dart/Flutter**

| Aspect       | Handling          |
| ------------ | ----------------- |
| pubspec.yaml | Project detection |
| Widget tree  | Basic detection   |
| Null safety  | Syntax supported  |

**Elixir**

| Aspect           | Handling            |
| ---------------- | ------------------- |
| mix.exs          | Project detection   |
| Modules          | Extracted           |
| Phoenix          | Framework detection |
| Pattern matching | Syntax supported    |

**Haskell**

| Aspect          | Handling          |
| --------------- | ----------------- |
| cabal/stack     | Project detection |
| Type signatures | Extracted         |
| Monads          | Syntax supported  |

**Clojure**

| Aspect                 | Handling          |
| ---------------------- | ----------------- |
| deps.edn / project.clj | Project detection |
| Namespaces             | Extracted         |
| Macros                 | Syntax only       |

### Tier 4 Markup/Config

**YAML**

| Aspect          | Handling                        |
| --------------- | ------------------------------- |
| CI configs      | GitHub Actions, GitLab CI, etc. |
| K8s manifests   | Resource detection              |
| Anchors/aliases | Resolved                        |

**JSON**

| Aspect            | Handling              |
| ----------------- | --------------------- |
| package.json      | Full parsing          |
| tsconfig.json     | Full parsing          |
| Schema validation | When schema available |

**SQL**

| Aspect            | Handling                        |
| ----------------- | ------------------------------- |
| Dialects          | PostgreSQL, MySQL, SQLite, etc. |
| Migrations        | File detection                  |
| Stored procedures | Extracted                       |

### Tier 5 Specialized

**Solidity**

| Aspect             | Handling          |
| ------------------ | ----------------- |
| Contract structure | Full extraction   |
| Inheritance        | Tracked           |
| Events/modifiers   | Extracted         |
| Hardhat/Foundry    | Project detection |

**COBOL**

| Aspect     | Handling            |
| ---------- | ------------------- |
| Divisions  | Parsed              |
| Paragraphs | Extracted           |
| Copybooks  | Reference detection |

### Framework Detection Matrix

| Framework   | Language | Detection Method                |
| ----------- | -------- | ------------------------------- |
| React       | JS/TS    | package.json, JSX usage         |
| Next.js     | JS/TS    | next.config.js, pages/ or app/  |
| Vue         | JS/TS    | vue.config.js, .vue files       |
| Angular     | TS       | angular.json, decorators        |
| Svelte      | JS/TS    | svelte.config.js, .svelte files |
| Express     | JS/TS    | express import pattern          |
| NestJS      | TS       | @nestjs imports, decorators     |
| Django      | Python   | settings.py, urls.py pattern    |
| Flask       | Python   | Flask import, app pattern       |
| FastAPI     | Python   | FastAPI import pattern          |
| Rails       | Ruby     | config/application.rb           |
| Laravel     | PHP      | artisan, app/ structure         |
| Spring Boot | Java     | @SpringBootApplication          |
| .NET Core   | C#       | Program.cs, Startup.cs          |
| Gin         | Go       | gin import pattern              |
| Echo        | Go       | echo import pattern             |
| Actix       | Rust     | actix-web in Cargo.toml         |
| Rocket      | Rust     | rocket in Cargo.toml            |

---

## Appendix B: Glossary

| Term              | Definition                                                      |
| ----------------- | --------------------------------------------------------------- |
| AST               | Abstract Syntax Tree — structured representation of source code |
| Tree-sitter       | Fast, incremental parsing library supporting many languages     |
| ts-morph          | TypeScript compiler API wrapper for deep analysis               |
| go/packages       | Go's package loading and type checking library                  |
| Symbol            | Named entity in code (function, class, variable, etc.)          |
| Deep AST          | Analysis using full type system (ts-morph, go/types)            |
| Shallow AST       | Syntax-only analysis (Tree-sitter)                              |
| Cross-reference   | Validation linking log facts to code facts                      |
| Fuzzy matching    | Finding content with tolerance for line drift                   |
| Code context      | Surrounding code added to artifact                              |
| Import chain      | Sequence of imports from entry to target                        |
| Enriched artifact | Artifact with AST-derived context added                         |
| Mechanical patch  | Deterministic code transformation                               |
| Seed files        | Files directly referenced by artifacts                          |
| Demand-driven     | Parse only what's needed, not entire repo                       |
| Base/Head         | PR base commit vs head commit                                   |
| Ref side          | Which commit a file was fetched from                            |

---

## Appendix C: Configuration Reference

### Environment Variables

| Variable                      | Default | Description                                          |
| ----------------------------- | ------- | ---------------------------------------------------- |
| AST_MODE                      | auto    | fast, full, full_seed_only, or auto (severity-based) |
| AST_MAX_SEED_FILES            | 100     | Maximum seed files                                   |
| AST_MAX_EXPANDED_FILES        | 100     | Maximum total files                                  |
| AST_MAX_DEEP_FILES            | 50      | Maximum files for deep analysis                      |
| AST_FULL_SEED_ONLY_THRESHOLD  | 50      | Seed count triggering full_seed_only mode            |
| AST_FULL_SEED_ONLY_DEEP_LIMIT | 20      | Max deep AST files in full_seed_only                 |
| AST_EXPAND_IMPORTS            | false   | Enable import expansion                              |
| AST_MAX_GRAPH_DEPTH           | 2       | Import chain depth limit                             |
| AST_FUZZY_WINDOW              | 25      | Lines to search for fuzzy match (Tier A)             |
| AST_FUZZY_FALLBACK_WHOLE_FILE | true    | Enable Tier B whole-file search                      |
| AST_FUZZY_MAX_FILE_LINES      | 5000    | Max file size for Tier B fallback                    |
| AST_FUZZY_FALLBACK_TIMEOUT_MS | 100     | Timeout for Tier B search                            |
| AST_FUZZY_MIN_TOKEN_OVERLAP   | 0.6     | Minimum similarity threshold                         |
| AST_SNIPPET_CONTEXT           | 5       | Lines before/after error                             |
| AST_TIMEOUT_FILE_MS           | 5000    | Parse timeout per file                               |
| AST_TIMEOUT_DEEP_MS           | 30000   | Deep analysis timeout                                |
| AST_CACHE_TTL_HOURS           | 24      | Cache TTL for files/ASTs                             |
| AST_DEEP_CACHE_TTL_HOURS      | 1       | Cache TTL for deep analysis                          |
| AST_GITHUB_CONCURRENCY        | 5       | Parallel GitHub API calls                            |
| AST_ENABLE_JEDI               | false   | Enable Python jedi (slow)                            |
| AST_ENABLE_PATCHES            | true    | Generate mechanical patches                          |
| AST_PATCH_VERIFY_ENABLED      | false   | Enable dry-run verification for patches              |
| AST_PATCH_VERIFY_TIMEOUT_MS   | 5000    | Timeout for patch verification                       |

### Tenant Overrides

| Setting                  | Options                                    | Description                       |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| ast_mode                 | fast_only, full_only, full_seed_only, auto | Override mode selection           |
| ast_enabled              | true, false                                | Enable/disable AST layer          |
| ast_patches_enabled      | true, false                                | Enable patch generation           |
| ast_patch_verify_enabled | true, false                                | Enable patch verification         |
| ast_deep_languages       | [list]                                     | Which languages get deep analysis |
| ast_fuzzy_fallback       | true, false                                | Enable Tier B fuzzy matching      |

---

## Appendix D: Changelog

| Version | Date | Changes                                                                                                                                                                                                                                                                                                |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1      | -    | Initial specification                                                                                                                                                                                                                                                                                  |
| v2      | -    | Added: demand-driven parsing, base/head awareness, fuzzy line matching, hash-based evidence IDs, fast/full modes, mechanical patch clarification, Rust deep AST deferred, go/packages for Go, jedi gated for Python                                                                                    |
| v2.1    | -    | Added: full_seed_only mode for large failed builds, 2-tier fuzzy matching with whole-file fallback, definitive vs non-definitive validation failures, path fuzzy resolver policy, unambiguous symbol definition for patches, AST-LIMIT evidence type, consistent cache TTLs, patch verification option |
