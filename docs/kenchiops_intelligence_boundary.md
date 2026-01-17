# Kenchiops Deterministic Intelligence Boundary Document

## LLM, AST, and Evidence Contracts (Companion Spec)

**Version:** 1.0  
**Date:** January 16, 2026  
**Status:** Draft  
**Audience:** Kenchiops Core Engineering  
**Purpose:** Define hard system boundaries between deterministic analysis, AST engines, and LLM reasoning.

---

## 1. Purpose of This Document

This document complements the main _Kenchiops Multi-Language Deterministic Code Analysis System_ design.

Its purpose is to:

- Lock down **where intelligence lives**
- Prevent slow erosion of determinism
- Clearly separate **facts**, **verification**, and **interpretation**
- Ensure multi-language AST support is consistent and predictable
- Make LLM misuse _structurally impossible_, not just discouraged

This is a **governance and contract document**, not a feature spec.

---

## 2. Non-Negotiable System Law

> **The LLM is never a source of truth.  
> The LLM is never a producer of facts.  
> The LLM is only a narrator of verified evidence.**

If a fact is not present in deterministic output, the LLM must behave as if it does not exist.

---

## 3. Deterministic Fact Classes

All information entering the LLM must belong to one of these classes:

### Class A — Log-Derived Facts

Produced by:

- Preprocessing
- Chunking
- LLM Extractor (Mode A)

Examples:

- Error messages
- Stack trace strings
- Explicit file paths printed in logs
- Exit codes
- Test names printed by test runners

**Properties:**

- May be incomplete
- May be misleading
- Must NEVER be trusted without verification

---

### Class B — AST-Verified Facts

Produced by:

- Universal AST (Tree-sitter)
- Deep AST (ts-morph)

Examples:

- File exists
- Line exists
- Enclosing function name
- AST node type at location
- Syntactic validity of code
- Type correctness (TypeScript only)

**Properties:**

- Deterministic
- Cacheable
- Language-aware
- Higher trust than logs

---

### Class C — Deterministic Derivations

Produced by:

- Pattern Analyzer
- Fix Generator
- Stack Trace Mapper

Examples:

- “This node is a property access on a nullable symbol”
- “This Promise is not awaited”
- “This diff parses successfully”
- “This diff type-checks”

**Properties:**

- Derived from Class A + B
- Must include provenance
- Must include confidence

---

## 4. AST Engines and Guarantees

### 4.1 Universal AST Layer (Tree-sitter)

**Role:** Structural verification across languages

**Guarantees:**

- File parses into AST or partial AST
- Node exists at or near reported line
- Enclosing constructs (function, class, block)
- Identifier extraction
- Syntax-level pattern detection

**Explicitly NOT guaranteed:**

- Type correctness
- Runtime behavior correctness
- Semantic intent

**Languages:**  
Python, Go, Rust, Java, Ruby, C, C++, Bash, configs

Tree-sitter is the **minimum verification bar** for _any_ language.

---

### 4.2 Deep AST Layer (TypeScript / JavaScript)

**Engine:** ts-morph (TypeScript Compiler API)

**Additional guarantees:**

- Symbol resolution
- Type narrowing
- Control-flow awareness
- Compiler diagnostics
- Safe refactors

**This layer is OPTIONAL but authoritative when present.**

If ts-morph and Tree-sitter disagree:

- ts-morph wins for TS/JS
- Disagreement is recorded in `limitations[]`

---

## 5. AST Fact Contract (Critical Addition)

All AST outputs MUST conform to this rule:

> **Every AST fact must be reproducible from source code alone.**

### Forbidden AST Outputs

- “Likely intended behavior”
- “Probably should be async”
- “This looks wrong”
- “Developer probably meant…”

These belong to the LLM — never to AST.

---

## 6. Fix Generation Contract (Hard Boundary)

### Deterministic Layer MAY:

- Generate AST-based diffs
- Validate diffs (syntax / type)
- Assign risk levels

### Deterministic Layer MUST:

- Attach provenance (finding_id, artifact_ref)
- Attach validation_status
- Attach applies_to range

### LLM MUST:

- Copy diffs verbatim
- Never edit, reorder, or optimize code
- Never generate new diffs

If no deterministic fix exists:

- LLM may only produce **conceptual guidance**
- Must be labeled unsafe and unverified

---

## 7. LLM Capability Kill-Switches

The following capabilities are **explicitly disabled** at the system level:

| Capability           | Enforcement             |
| -------------------- | ----------------------- |
| File discovery       | No file system access   |
| Line guessing        | Must come from AST      |
| Code authorship      | Diff injection rejected |
| Evidence invention   | Schema validation       |
| Confidence inflation | Rule-based caps         |

If the LLM violates any of these:

- Response is rejected
- Logged as compliance failure
- Not retried automatically

---

## 8. Multi-Language Support Philosophy

> **Correct and shallow beats deep and wrong.**

Therefore:

- All languages get **verification**
- Only some get **fix generation**
- No language gets **hallucinated precision**

Language tiers affect **depth**, never **truthfulness**.

---

## 9. Confidence Is Not an Opinion

Confidence is a **computed property**, not LLM judgment.

LLM responsibilities:

- Translate confidence into language
- Respect caps and floors
- Explain _why_ confidence is low or high

LLM is **not allowed** to raise confidence beyond deterministic bounds.

---

## 10. Why This Boundary Exists

Without this document:

- LLMs slowly regain agency
- “Helpful” guesses creep in
- Determinism erodes
- Trust collapses

With this document:

- Deterministic intelligence stays authoritative
- LLM remains powerful but safe
- Multi-language support scales
- Developers trust outputs enough to act

---

## 11. Success Criteria for This Spec

This spec is successful if:

- An engineer can delete the LLM and still get correct facts
- An LLM cannot invent a file path even if it wants to
- Fixes are reproducible without LLM involvement
- Multi-language support degrades gracefully
- Confidence is explainable, not magical

---
