# KenchiOps Canonical Analysis Flow

## Logs → AST → LLM

**Document Type:** Architecture Flow Specification  
**Audience:** Backend / Platform / AI Infra Engineers  
**Scope:** CI failure analysis pipeline  
**Status:** Canonical reference

---

## 1. Core Principle

KenchiOps separates responsibility across three layers:

- Logs answer: _What happened?_
- AST answers: _Where and what exists in the code?_
- LLM answers: _Why it matters and what to do next_

No layer guesses what another layer must prove.

---

## 2. High-Level Flow Overview

Raw CI Logs  
→ Deterministic Log Processing  
→ Structured Log Artifacts  
→ AST Verification & Fix Generation  
→ LLM Reasoning & Presentation  
→ Stable JSON Output

Each stage produces **machine-verifiable output** consumed by the next.

---

## 3. Stage-by-Stage Flow

---

### Stage 0 — Deterministic Log Preprocessing

**Purpose:** Remove noise and secrets without adding interpretation.

**Input:**

- Raw CI logs (up to 10MB)

**Operations (deterministic, free):**

- Strip ANSI color codes
- Strip CI timestamps
- Remove CI grouping markers
- Redact secrets (mandatory)

**Output:**

- Sanitized log text

**Guarantees:**

- No semantic meaning added
- No information invented
- Safe for downstream processing

---

### Stage 1 — Smart Chunking

**Purpose:** Make large logs processable without losing context.

**Input:**

- Sanitized log text

**Operations:**

- Token-aware chunking (~3000 tokens target)
- Preserve protected zones (stack traces, test blocks)
- Add overlap between chunks (default: 40 lines)
- Track absolute line offsets

**Output:**

- ChunkResult[]
  - chunk_id
  - content
  - line_offset
  - estimated_tokens

**Guarantees:**

- Full-log coverage
- Context preserved across chunk boundaries
- No truncation-based loss

---

### Stage 2 — LLM Mode A: Log Extraction (Facts Only)

**Purpose:** Convert log text into structured evidence.

**LLM Role:** Extractor (no reasoning)

**Input (per chunk):**

- chunk_id
- line_offset
- chunk_text
- framework_hint (optional)
- ci_platform_hint (optional)

**Allowed Output:**

- ExtractedArtifact[]

**ExtractedArtifact Examples:**

- Stack traces
- Test failures
- Compiler errors
- Infra killers (OOM, timeout, SIGKILL)
- CI boundary errors

**Strict Rules:**

- Extract ONLY what is explicitly present
- No root cause analysis
- No fix suggestions
- No guessing file paths or line numbers
- Return empty array if nothing found

**Evidence ID Format:**

- evidence_id = chunk#<id>:L<start>-L<end>

---

### Stage 3 — Deterministic Aggregation

**Purpose:** Deduplicate and rank extracted evidence.

**Input:**

- All ExtractedArtifact arrays from Stage 2

**Operations (no LLM):**

- Signature-based deduplication
- Priority ranking
- Earliest occurrence wins
- Select top N artifacts

**Output:**

- AggregatedEvidence
  - Ranked artifacts
  - Occurrence counts
  - Failure statistics

**Guarantees:**

- Deterministic results
- Same input → same output
- No semantic interpretation

---

## 4. Transition: Logs → AST

At this point, logs stop being processed.

Log artifacts now act as **anchors into the codebase**.

---

### Stage 3.5 — AST Enrichment

**Purpose:** Verify log-derived claims against real source code and generate fixes.

---

#### 3.5a — AST Work Set Construction

**Input:**

- AggregatedEvidence

**Operation:**

- Extract file paths and line numbers from artifacts

**Result:**

- Minimal AST work set:
  - Only files referenced by logs
  - No full-repo scanning

---

#### 3.5b — Source Fetching

**Operation:**

- Fetch files at the exact commit SHA

**Failure Handling:**

- Missing files recorded as limitations
- Pipeline continues

---

#### 3.5c — AST Parsing

**Parser Selection:**

- TypeScript / JavaScript → ts-morph
- All other languages → Tree-sitter

**Guarantees:**

- Error-tolerant parsing
- Deterministic ASTs
- Partial ASTs allowed

---

#### 3.5d — Log-to-AST Mapping

**Purpose:** Verify that log-referenced locations exist in code.

**Verification Results:**

- verified
- unverified
- contradicted
- drift_detected

**AST Output:**

- Verified file
- Verified line
- Function name
- Code excerpt
- Drift info (if applicable)

---

#### 3.5e — Pattern Detection

**Scope:**

- Run only near verified locations

**Examples:**

- Null reference
- Missing await
- Type mismatch
- Invalid import
- Test assertion issues

**Output:**

- ast_findings[]
  - Pattern type
  - Location
  - Confidence score

---

#### 3.5f — Fix Generation

**Method:**

- AST-level transformations
- No LLM involvement

**Validation:**

- Syntax validation (all languages)
- Type validation (TypeScript)

**Output:**

- fix_suggestions[]
  - Unified diffs
  - Validation status
  - Risk level

**Guarantees:**

- Fixes are syntactically valid
- No hallucinated code

---

## 5. AST → LLM Handoff

The AST layer produces **verified facts and fixes**.

The LLM becomes a **consumer**, not a discoverer.

---

### Stage 4 — LLM Mode B: Final Analysis

**Purpose:** Produce human-readable, actionable analysis.

**LLM Role:** Reasoner & Presenter

**Input:**

- log_artifacts
- ast_verifications
- ast_findings
- fix_suggestions
- build_metadata
- limitations

**Allowed LLM Behavior:**

- Explain why failures occurred
- Select root cause
- Adjust confidence language
- Present deterministic fixes
- Suggest next steps

**Forbidden LLM Behavior:**

- Invent file paths or line numbers
- Modify diffs
- Generate new code
- Reference unknown evidence

---

## 6. Final Output

**Output Format:**

- Stable AnalysisResponse JSON

**Consumers:**

- Slack notifications
- GitHub PR comments
- Persistent storage
- Search & analytics

**Guarantees:**

- Evidence-backed claims only
- Deterministic fixes
- Bounded cost
- Full log coverage

---

## 7. One-Line Mental Model

Logs identify suspects → AST confirms the crime scene → LLM writes the report and recommendation.

---

## 8. Why This Architecture Works

- Eliminates hallucination
- Scales to large logs
- Supports many languages
- Keeps LLM cost predictable
- Produces developer-trustworthy output

---
