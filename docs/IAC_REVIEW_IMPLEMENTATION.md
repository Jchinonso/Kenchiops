# IaC PR Review v3

## Executive Summary

This document specifies an Infrastructure-as-Code (IaC) PR reviewer that analyzes pull requests containing infrastructure changes, identifies security issues, estimates costs, and posts actionable comments. The system enforces a strict **deterministic boundary** where all facts come from verifiable tool outputs and the LLM serves only as a narrator—never as a source of truth.

**Key v3 Changes from v2:**

1. IaC Parsing Layer (HCL/YAML → resource graph, the "IaC AST")
2. Terraform Root Detection (mono-repo support)
3. Explicit Base/Head Infracost Runs (correct delta calculation)
4. LocationResolver (tool findings → GitHub review coordinates)
5. Formal evidence_catalog with strict citation enforcement
6. Tool Conflict Resolution (precedence order, dedup rules)
7. LLM Suggested Fixes (labeled as unverified, grounded in facts)
8. Tool Version Pinning (no :latest tags)
9. Baseline Support ("introduced-by-PR only" mode)
10. Strict ReviewSummaryResponse schema with validation

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────┐
                    │           GitHub PR Event                │
                    │  opened │ synchronize │ reopened         │
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         PR Event Handler                 │
                    │  • Validate event                        │
                    │  • Check tenant settings                 │
                    │  • Queue for processing                  │
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         Diff Fetcher                     │
                    │  • Fetch PR diff from GitHub             │
                    │  • Download full files (base + head)     │
                    │  • Extract changed lines                 │
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         File Detector                    │
                    │  • Identify IaC types                    │
                    │  • Filter to supported files             │
                    │  • Skip if no IaC files                  │
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         IaC Parsing Layer (NEW)          │
                    │  • Terraform: HCL → resource graph       │
                    │  • Kubernetes: YAML → object model       │
                    │  • Resource identity normalization       │
                    │  • Delta detection (create/modify/delete)│
                    └───────────────────┬──────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         Terraform Root Detector (NEW)    │
                    │  • Identify all Terraform roots          │
                    │  • Support mono-repo with multiple roots │
                    │  • Map files to their root               │
                    └───────────────────┬──────────────────────┘
                                        │
    ┌───────────────────────────────────┼───────────────────────────────────┐
    │                                   │                                   │
    ▼                                   ▼                                   ▼
┌─────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────┐
│  Security Analyzer  │   │  Cost Estimator         │   │  Best Practice      │
│  • Checkov          │   │  • Infracost BASE run   │   │  Checker            │
│  • tfsec            │   │  • Infracost HEAD run   │   │  • kube-score       │
│  • tflint           │   │  • Delta calculator     │   │  • Built-in rules   │
│  (pinned versions)  │   │  (per Terraform root)   │   │  (pinned versions)  │
└──────────┬──────────┘   └────────────┬────────────┘   └──────────┬──────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │         Evidence Aggregator              │
                    │  • Build evidence_catalog                │
                    │  • Deduplicate findings across tools     │
                    │  • Apply baseline filter (NEW)           │
                    │  • Compute confidence                    │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │         LocationResolver (NEW)           │
                    │  • Tool location → file + line           │
                    │  • Line → diff hunk position             │
                    │  • Fallback to main comment              │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │         AI Summarizer                    │
                    │  • Narrator role ONLY                    │
                    │  • Schema-validated output               │
                    │  • Suggested fixes labeled (NEW)         │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │         Output Validator                 │
                    │  • Schema validation                     │
                    │  • Citation verification                 │
                    │  • Kill-switch checks                    │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────▼───────────────────────┐
                    │         Review Record (Database)         │
                    └──────────────────┬───────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │  PR Comment     │      │  GitHub Check   │      │  Slack Alert    │
    │  • Main summary │      │  • Status       │      │  (Critical/High)│
    │  • Inline       │      │  • Annotations  │      │                 │
    └─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## Deterministic Boundary

### Non-Negotiable System Law

> **The LLM is never a source of truth.**
> **The LLM is never a producer of facts.**
> **The LLM is only a narrator of verified evidence.**

If a finding is not produced by a deterministic analyzer, the LLM must behave as if it does not exist.

### Ground Truth Layers

IaC review has TWO ground truth layers:

**Layer 1: IaC Parsing (the "IaC AST")**

| IaC Type       | Parsing Method                       | Output                             |
| -------------- | ------------------------------------ | ---------------------------------- |
| Terraform      | HCL parser or `terraform show -json` | Resource graph with addresses      |
| Kubernetes     | YAML parser                          | Object model (kind/name/namespace) |
| CloudFormation | JSON/YAML parser                     | Resource logical IDs               |
| Helm           | Template rendering + YAML parse      | Rendered K8s objects               |

This layer provides:

- Resource identity normalization (e.g., `aws_security_group.bastion`)
- Accurate line mapping for inline comments
- Delta-aware reasoning (create/modify/delete)
- Tool output reconciliation

**Layer 2: Static Analyzer Outputs**

| Tool       | Purpose                   | Output                  |
| ---------- | ------------------------- | ----------------------- |
| Checkov    | Security & compliance     | Findings with rule IDs  |
| tfsec      | Terraform security        | Findings with rule IDs  |
| tflint     | Terraform linting         | Findings with rule IDs  |
| kube-score | Kubernetes best practices | Findings with rule IDs  |
| Infracost  | Cost estimation           | Resource cost breakdown |

Both layers produce **deterministic, reproducible outputs** that the LLM summarizes.

### Pipeline Comparison

| CI/CD Log Analysis        | IaC Review Equivalent                         |
| ------------------------- | --------------------------------------------- |
| Raw logs                  | PR diff with IaC files                        |
| Log preprocessing         | Diff parsing + file type detection            |
| AST parsing (Tree-sitter) | IaC Parsing Layer (HCL/YAML → resource graph) |
| Deep AST (ts-morph)       | Static analyzers (Checkov, tfsec, etc.)       |
| Pattern matching          | Built-in rules + best practice checks         |
| Evidence artifacts        | Evidence packet with evidence_catalog         |
| LLM as narrator           | AI summarizer (narrator only)                 |

### Fact Classes

**Class A — Diff-Derived Facts**

| Attribute   | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| Produced By | GitHub API, diff parser, file detector                              |
| Examples    | Files changed, line numbers modified, IaC type detected             |
| Properties  | Extracted directly from GitHub API, deterministic, schema-validated |

**Class B — Parse-Derived Facts (NEW)**

| Attribute   | Value                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Produced By | IaC parsing layer (HCL parser, YAML parser)                                                                                |
| Examples    | Resource addresses (`aws_instance.web`), resource actions (create/modify/delete), field paths (`spec.containers[0].image`) |
| Properties  | Deterministic parsing output, enables accurate line mapping, supports delta detection                                      |

**Class C — Analyzer-Verified Facts**

| Attribute   | Value                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Produced By | Checkov, tfsec, tflint, kube-score, Infracost, built-in rules              |
| Examples    | Security findings with rule IDs, cost estimates with resource breakdown    |
| Properties  | Produced by deterministic tools, includes rule ID and source, reproducible |

**Class D — Deterministic Derivations**

| Attribute   | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| Produced By | Evidence aggregator, deduplicator, confidence scorer                |
| Examples    | Deduplicated findings, total cost delta, finding counts by severity |
| Properties  | Derived from Class A + B + C, includes provenance                   |

---

## IaC Parsing Layer

### Purpose

The IaC parsing layer is the **IaC equivalent of AST parsing**. It provides structured understanding of infrastructure definitions that enables:

1. Resource identity normalization
2. Accurate line mapping for inline comments
3. Delta-aware reasoning (create/modify/delete)
4. Tool output reconciliation

### Terraform Parsing

**Option A: HCL Parser**

Parse .tf files directly using HCL parser library.

| Output Field     | Description                                       |
| ---------------- | ------------------------------------------------- |
| resource_address | Full address (e.g., `aws_security_group.bastion`) |
| resource_type    | Type (e.g., `aws_security_group`)                 |
| resource_name    | Name (e.g., `bastion`)                            |
| file_path        | Source file                                       |
| line_start       | Starting line number                              |
| line_end         | Ending line number                                |
| attributes       | Map of attribute names to values and line numbers |
| dependencies     | List of referenced resources                      |

**Option B: Terraform Plan JSON (when available)**

If `terraform plan` can be executed (e.g., with provider credentials), use `terraform show -json`.

| Output Field     | Description                               |
| ---------------- | ----------------------------------------- |
| resource_address | Full address from plan                    |
| action           | create, update, delete, no-op, replace    |
| before           | Previous state values (for modify/delete) |
| after            | Planned state values (for create/modify)  |
| change_reasons   | Why resource is changing                  |

**Recommendation**: Use HCL parsing as default (no credentials needed), with plan JSON as enhancement when available.

### Kubernetes Parsing

Parse YAML documents to extract object identity.

| Output Field | Description                                |
| ------------ | ------------------------------------------ |
| api_version  | e.g., `apps/v1`                            |
| kind         | e.g., `Deployment`                         |
| name         | Object name from metadata                  |
| namespace    | Namespace (default if not specified)       |
| object_id    | Canonical ID: `{kind}/{namespace}/{name}`  |
| file_path    | Source file                                |
| doc_index    | Document index in multi-doc YAML           |
| line_start   | Starting line number                       |
| line_end     | Ending line number                         |
| field_paths  | Map of JSONPath-like paths to line numbers |

### Resource Delta Detection

Compare base and head parsed resources to determine actions.

| Base        | Head                | Action    |
| ----------- | ------------------- | --------- |
| Not present | Present             | create    |
| Present     | Present (changed)   | modify    |
| Present     | Present (unchanged) | no_change |
| Present     | Not present         | delete    |

---

## Terraform Root Detection

### Purpose

Support mono-repos with multiple Terraform roots (independent state directories).

### Detection Rules

A directory is a Terraform root if:

1. Contains at least one `.tf` file with `terraform {}` or `provider` block, OR
2. Contains a `terraform.tfstate` or `.terraform` directory, OR
3. Is explicitly marked in `.kenchi/iac-review.yaml`

### Detection Algorithm

1. Start from repository root
2. Walk directory tree depth-first
3. For each directory with `.tf` files:
   - Check for root indicators (terraform block, provider block, state files)
   - If found: mark as root, do not descend into subdirectories
   - If not found: continue descent
4. Return list of root paths

### Root Mapping

| Field       | Description                    |
| ----------- | ------------------------------ |
| root_path   | Relative path from repo root   |
| tf_files    | List of .tf files in this root |
| has_backend | Whether backend is configured  |
| providers   | List of providers used         |
| modules     | List of module calls           |

### Multi-Root Handling

Each Terraform root is analyzed independently:

- Separate Infracost runs (base and head)
- Separate tool executions
- Findings tagged with root path
- Cost deltas aggregated across roots

---

## Cost Estimation: Base/Head Delta

### The Problem

v2 implied running Infracost on the Terraform directory, but correct delta calculation requires comparing base state vs head state.

### Correct Pipeline

**Step 1: Checkout Base SHA**

| Action   | Description                    |
| -------- | ------------------------------ |
| Checkout | `git checkout {base_sha}`      |
| Target   | Each Terraform root identified |
| Output   | Base state files ready         |

**Step 2: Run Infracost on Base**

| Parameter         | Value                             |
| ----------------- | --------------------------------- |
| Working Directory | Terraform root path               |
| Output Format     | JSON                              |
| Output File       | `infracost-base-{root_hash}.json` |

**Step 3: Checkout Head SHA**

| Action   | Description               |
| -------- | ------------------------- |
| Checkout | `git checkout {head_sha}` |
| Target   | Same Terraform root       |
| Output   | Head state files ready    |

**Step 4: Run Infracost on Head**

| Parameter         | Value                             |
| ----------------- | --------------------------------- |
| Working Directory | Terraform root path               |
| Output Format     | JSON                              |
| Output File       | `infracost-head-{root_hash}.json` |

**Step 5: Calculate Delta**

| Comparison | Description                             |
| ---------- | --------------------------------------- |
| Match by   | Resource address                        |
| Base only  | Resource deleted (negative delta)       |
| Head only  | Resource created (positive delta)       |
| Both       | Resource modified (delta = head - base) |

### Delta Calculator Output

| Field          | Description                |
| -------------- | -------------------------- |
| root_path      | Terraform root             |
| monthly_before | Total monthly cost at base |
| monthly_after  | Total monthly cost at head |
| monthly_delta  | Change in monthly cost     |
| resources      | Per-resource breakdown     |
| confidence     | high, medium, low          |
| assumptions    | List of assumptions made   |

### Per-Resource Breakdown

| Field            | Description                       |
| ---------------- | --------------------------------- |
| resource_address | e.g., `aws_instance.web`          |
| resource_type    | e.g., `aws_instance`              |
| action           | create, modify, delete, no_change |
| monthly_before   | Cost before (0 if create)         |
| monthly_after    | Cost after (0 if delete)          |
| monthly_delta    | Change                            |
| details          | Pricing details from Infracost    |

---

## LocationResolver

### Purpose

Map tool finding locations to GitHub review API coordinates for inline comments.

### The Challenge

GitHub's review API requires:

- **REST API (position)**: Diff hunk position (line number within the diff)
- **GraphQL API (line)**: File line number with side (LEFT/RIGHT)

Tools report:

- File path
- Line number (in the file)
- Sometimes column/range

### Resolution Pipeline

**Step 1: Validate Location**

| Check           | Description                                    |
| --------------- | ---------------------------------------------- |
| File exists     | File path exists in PR diff                    |
| Line in bounds  | Line number within file length                 |
| Resource exists | Resource from IaC parsing exists (cross-check) |

**Step 2: Map to Diff Position**

| Scenario                       | Action                                       |
| ------------------------------ | -------------------------------------------- |
| Line is in diff (changed line) | Use diff position for inline comment         |
| Line is in diff context        | Use diff position for inline comment         |
| Line is NOT in diff            | Fallback to main comment with file reference |

**Step 3: Determine Side**

| Change Type         | Side  |
| ------------------- | ----- |
| Addition (+ line)   | RIGHT |
| Deletion (- line)   | LEFT  |
| Context (unchanged) | RIGHT |

### Fallback Strategy

| Condition                | Fallback                                               |
| ------------------------ | ------------------------------------------------------ |
| Line not in diff         | Include in main comment with file:line reference       |
| File not in diff         | Include in main comment (may be transitive dependency) |
| Too many inline comments | Overflow to main comment                               |
| Invalid line number      | Include in main comment with note                      |

### Location Output

| Field           | Description                             |
| --------------- | --------------------------------------- |
| can_inline      | Whether inline comment is possible      |
| file_path       | Validated file path                     |
| line            | Line number                             |
| side            | LEFT or RIGHT                           |
| diff_position   | Position in diff (for REST API)         |
| fallback_reason | Why fallback was needed (if applicable) |

---

## Evidence Catalog

### Purpose

The evidence_catalog is the **single authoritative registry** of all evidence. Every finding, cost item, and fact must be registered here with a unique ID.

### Tool Conflict Resolution

When multiple tools report findings on the same resource with similar rule intent, conflicts must be resolved deterministically.

**Precedence Order**:

| Rank | Tool           | Domain            | Rationale                             |
| ---- | -------------- | ----------------- | ------------------------------------- |
| 1    | Checkov        | Policy/compliance | Broadest coverage, compliance-focused |
| 2    | tfsec          | Security          | Security-specialized, high accuracy   |
| 3    | tflint         | Linting           | Terraform-specific, style/correctness |
| 4    | kube-score     | Best practices    | K8s-specific recommendations          |
| 5    | Built-in rules | Custom            | Tenant-specific policies              |

**Conflict Resolution Rules**:

| Rule                    | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| Higher severity wins    | If tools disagree on severity, use the higher severity         |
| More specific wins      | More specific resource mapping takes precedence                |
| Earlier precedence wins | When tied, tool with higher precedence rank is primary         |
| Secondary marked        | Lower-precedence duplicates marked as secondary, not displayed |

**Conflict Detection Criteria**:

| Field            | Match Type | Description                                                |
| ---------------- | ---------- | ---------------------------------------------------------- |
| file_path        | Exact      | Same file                                                  |
| resource_address | Exact      | Same resource (from IaC parser)                            |
| rule_category    | Fuzzy      | Same category (security, compliance, etc.)                 |
| rule_intent      | Fuzzy      | Similar rule purpose (e.g., "public access", "encryption") |
| line_range       | Fuzzy      | Within ±10 lines                                           |

**Conflict Record**:

| Field                 | Description                            |
| --------------------- | -------------------------------------- |
| primary_finding_id    | Evidence ID of winning finding         |
| secondary_finding_ids | Evidence IDs of duplicate findings     |
| resolution_reason     | Why primary was chosen                 |
| severity_conflict     | Whether severity disagreement existed  |
| tools_involved        | List of tools that reported this issue |

### Evidence ID Format

| Prefix | Source        | Format                   | Example                        |
| ------ | ------------- | ------------------------ | ------------------------------ |
| DIFF   | Diff parser   | DIFF-{file}-{line}       | DIFF-main.tf-45                |
| RES    | IaC parser    | RES-{type}-{name}        | RES-aws_security_group-bastion |
| FND    | Tool finding  | FND-{tool}-{rule}-{n}    | FND-tfsec-AWS006-1             |
| COST   | Cost estimate | COST-{resource}-{action} | COST-aws_instance.web-create   |
| DEDUP  | Deduplication | DEDUP-{primary_id}       | DEDUP-FND-checkov-CKV_AWS_1-1  |

### Evidence Record Structure

| Field         | Description                          |
| ------------- | ------------------------------------ |
| id            | Unique evidence ID                   |
| type          | diff, resource, finding, cost, dedup |
| source        | Tool or component name               |
| payload       | The actual evidence data             |
| source_ref    | Reference to raw tool output         |
| display_label | Human-friendly label                 |
| display_value | Short display value                  |
| file_path     | Associated file (if applicable)      |
| line_number   | Associated line (if applicable)      |
| url           | Link to documentation or details     |

### Evidence Catalog Population

| Component          | Populates               | ID Prefix |
| ------------------ | ----------------------- | --------- |
| Diff parser        | Changed files and lines | DIFF-\*   |
| IaC parser         | Parsed resources        | RES-\*    |
| Security analyzers | Security findings       | FND-\*    |
| Infracost          | Cost items              | COST-\*   |
| Deduplicator       | Deduplicated findings   | DEDUP-\*  |

### Citation Requirements

1. All findings in the summary MUST cite evidence IDs
2. All cost figures MUST cite evidence IDs
3. All suggested actions MUST cite evidence IDs
4. Invalid citations cause validation failure

---

## Baseline Support

### Purpose

Avoid spamming teams with pre-existing issues. Only report findings **introduced by this PR**.

### Baseline Modes

| Mode            | Description                                        |
| --------------- | -------------------------------------------------- |
| all_findings    | Report all findings (default for new repos)        |
| introduced_only | Only report findings introduced by this PR         |
| baseline_file   | Compare against `.kenchi/iac-review-baseline.json` |

### "Introduced Only" Detection

A finding is considered "introduced by this PR" if:

| Condition     | Description                                             |
| ------------- | ------------------------------------------------------- |
| New file      | Finding is in a file added by this PR                   |
| New resource  | Finding is on a resource created by this PR             |
| Modified line | Finding is on a line modified by this PR                |
| New finding   | Same resource existed in base, but finding didn't exist |

### Detection Algorithm

1. Run tools on base SHA
2. Run tools on head SHA
3. For each head finding:
   - Search for matching finding in base (same file, resource, rule)
   - If not found in base: mark as introduced
   - If found in base: mark as pre-existing
4. Only report introduced findings

### Matching Criteria

| Field            | Match Type                                     |
| ---------------- | ---------------------------------------------- |
| file_path        | Exact (accounting for renames)                 |
| resource_address | Exact                                          |
| rule_id          | Exact                                          |
| line_number      | Fuzzy (within ±5 lines to handle minor shifts) |

### Baseline File Format

For repos that want explicit baseline management:

| Field        | Description                            |
| ------------ | -------------------------------------- |
| version      | Baseline format version                |
| generated_at | When baseline was generated            |
| commit_sha   | Commit SHA at generation               |
| findings     | Array of suppressed finding signatures |

**Finding Signature**:

| Field            | Description                           |
| ---------------- | ------------------------------------- |
| file_path        | File path                             |
| resource_address | Resource address (if applicable)      |
| rule_id          | Rule ID                               |
| fingerprint      | Hash of key fields for fuzzy matching |
| reason           | Why this is baselined                 |
| expires_at       | Optional expiration date              |

---

## Suggested Fixes: Verified vs Unverified

### The Problem

v2's "no novel code fixes" rule was too strict. Tools rarely output perfect remediation, leaving comments as "please go read docs".

### Solution: Label Fix Sources

| Source           | Label                          | Description                     |
| ---------------- | ------------------------------ | ------------------------------- |
| Tool remediation | **Verified Fix**               | Exact code from tool output     |
| LLM suggestion   | **Suggested Fix** (unverified) | AI-generated, grounded in facts |

### Rules for LLM Suggested Fixes

**Allowed**:

- Suggest a fix grounded in deterministic facts (resource, rule, location)
- Label clearly as "Suggested Fix (not tool-verified)"
- Reference the evidence that grounds the suggestion

**Forbidden**:

- Invent file paths, line numbers, or resource names
- Claim certainty about the fix
- Generate fixes for findings that don't exist
- Override tool-provided remediations

### Fix Display Format

**Verified Fix (from tool)**:

```
✅ Verified Fix (from tfsec)
[code block with exact tool output]
```

**Suggested Fix (from LLM)**:

```
💡 Suggested Fix (not tool-verified)
[code block with LLM suggestion]
Based on: [evidence IDs]
```

### Validation Rules

1. Verified fixes MUST have `source_tool` field populated
2. Suggested fixes MUST have `evidence_ids` field populated
3. Suggested fixes MUST be labeled as unverified
4. No fix can reference resources not in evidence_catalog

---

## Tool Version Pinning

### The Problem

`:latest` tags will break reproducibility and cause unexpected changes.

### Pinned Tool Versions

| Tool       | Image                            | Version |
| ---------- | -------------------------------- | ------- |
| Checkov    | bridgecrew/checkov               | 3.2.x   |
| tfsec      | aquasec/tfsec                    | v1.28.x |
| tflint     | ghcr.io/terraform-linters/tflint | v0.50.x |
| kube-score | zegl/kube-score                  | v1.18.x |
| Infracost  | infracost/infracost              | v0.10.x |

### Version Management

| Field         | Description                             |
| ------------- | --------------------------------------- |
| tool_name     | Tool identifier                         |
| image         | Docker image                            |
| version       | Pinned version (semver)                 |
| digest        | Optional SHA256 digest for immutability |
| last_updated  | When version was last updated           |
| changelog_url | Link to tool changelog                  |

### Review Metadata

Every review record includes tool versions used:

| Field         | Description                      |
| ------------- | -------------------------------- |
| tool_versions | Map of tool name to version used |
| tool_digests  | Map of tool name to image digest |

### Update Policy

1. Pin to minor version (e.g., `3.2.x`)
2. Allow patch updates automatically
3. Review and test minor/major updates before promotion
4. Log version changes in review metadata

---

## Strict Output Schema: ReviewSummaryResponse

### Schema Definition

| Field             | Type   | Required    | Constraints                                 |
| ----------------- | ------ | ----------- | ------------------------------------------- |
| summary           | string | Yes         | Max 1000 characters, AI-generated overview  |
| risk_assessment   | string | Yes         | Max 500 characters, overall risk assessment |
| findings_summary  | object | Yes         | Counts by severity and category             |
| cost_summary      | object | Conditional | Required if Terraform present               |
| critical_findings | array  | Yes         | Must cite evidence IDs                      |
| suggested_actions | array  | Yes         | Each must cite evidence IDs                 |
| limitations       | array  | Yes         | What we couldn't analyze                    |

### Findings Summary Schema

| Field        | Type   | Description                                    |
| ------------ | ------ | ---------------------------------------------- |
| total        | number | Total finding count                            |
| by_severity  | object | Counts by critical/high/medium/low/info        |
| by_category  | object | Counts by security/compliance/reliability/cost |
| introduced   | number | Findings introduced by this PR                 |
| pre_existing | number | Pre-existing findings (if baseline mode)       |

### Cost Summary Schema

| Field                   | Type   | Description                     |
| ----------------------- | ------ | ------------------------------- |
| monthly_delta           | number | Total monthly cost change       |
| monthly_delta_formatted | string | Formatted (e.g., "+$357.00/mo") |
| direction               | enum   | increase, decrease, no_change   |
| confidence              | enum   | high, medium, low               |
| top_contributors        | array  | Top 3 resources by cost impact  |
| evidence_ids            | array  | Cost evidence IDs               |

### Critical Finding Schema

| Field         | Type   | Description               |
| ------------- | ------ | ------------------------- |
| title         | string | Finding title             |
| severity      | enum   | critical or high          |
| file_path     | string | File location             |
| line_number   | number | Line number               |
| resource      | string | Resource address          |
| rule_id       | string | Rule ID from tool         |
| evidence_id   | string | Evidence catalog ID       |
| verified_fix  | object | Fix from tool (optional)  |
| suggested_fix | object | LLM suggestion (optional) |

### Suggested Action Schema

| Field        | Type   | Description                             |
| ------------ | ------ | --------------------------------------- |
| description  | string | Action description                      |
| priority     | number | 1 = highest                             |
| evidence_ids | array  | Supporting evidence                     |
| category     | enum   | security, cost, reliability, compliance |

### Schema Validation Rules

1. All evidence_ids MUST exist in evidence_catalog
2. All file_paths MUST exist in PR diff
3. All line_numbers MUST be within file bounds
4. All resource addresses MUST exist in IaC parser output
5. Severity MUST match tool-assigned severity
6. Cost figures MUST match Infracost output exactly
7. suggested_fix blocks MUST be labeled as unverified
8. verified_fix blocks MUST have source_tool populated

---

## AI Prompt Contract

### System Prompt Requirements

1. **Role definition**: "You are an IaC PR review narrator. Your role is to summarize verified tool findings into human-readable text."

2. **Absolute rules**:
   - You may ONLY use information present in the evidence packet
   - You MUST cite evidence using [EVIDENCE_ID] format
   - You MUST NOT invent findings, resources, file paths, or line numbers
   - You MUST NOT override tool-assigned severity
   - You MUST NOT invent cost figures
   - You MUST label suggested fixes as "not tool-verified"
   - You MUST acknowledge limitations

3. **Output format**: "You must respond with valid JSON matching the ReviewSummaryResponse schema."

4. **Suggested fix guidance**:
   - You MAY suggest fixes for findings
   - Suggested fixes MUST be grounded in evidence (cite IDs)
   - Suggested fixes MUST be labeled as unverified
   - Do NOT claim certainty about suggestions
   - Prefer tool-provided fixes when available

### User Prompt Structure

1. PR METADATA (repository, author, title, files)
2. IAC TYPES DETECTED
3. TERRAFORM ROOTS (if applicable)
4. PARSED RESOURCES (from IaC parser)
5. SECURITY FINDINGS (with evidence IDs)
6. COST ESTIMATE (base, head, delta with evidence IDs)
7. BEST PRACTICE FINDINGS (with evidence IDs)
8. EVIDENCE CATALOG (full map)
9. BASELINE STATUS (introduced vs pre-existing counts)

---

## Kill-Switches

### Validation Kill-Switches

| Capability            | Enforcement                                        | On Violation                    |
| --------------------- | -------------------------------------------------- | ------------------------------- |
| Finding invention     | All finding IDs validated against evidence_catalog | Reject, use fallback            |
| Severity override     | Severity must match tool output                    | Reject, use tool severity       |
| Cost invention        | Cost figures must match Infracost exactly          | Reject, use Infracost values    |
| Path invention        | File paths must exist in PR diff                   | Reject, strip invalid paths     |
| Line invention        | Lines must be within file bounds                   | Reject, strip invalid lines     |
| Resource invention    | Resources must exist in IaC parser output          | Reject, strip invalid resources |
| Unlabeled suggestions | Suggested fixes must be marked unverified          | Reject, add label               |

### Fallback Summary

When AI fails validation:

**Summary template**: "This PR modifies {FILE_COUNT} IaC files. Found {CRITICAL_COUNT} critical, {HIGH_COUNT} high, {MEDIUM_COUNT} medium findings."

**Cost template**: "Estimated cost impact: {DELTA_FORMATTED} ({CONFIDENCE} confidence)."

**Findings**: List each finding with file, line, rule ID, and tool source. No AI summarization.

**Limitations**: "AI summary unavailable - using template fallback."

---

## PR Comment Format

### Main Comment Structure

```
## 🏗️ Infrastructure Change Review

Analyzed **{FILE_COUNT} files** across **{ROOT_COUNT} Terraform root(s)**.

### Summary
{AI_SUMMARY - clearly labeled if AI-generated}

### 🔒 Security Findings

| Severity | Count | Introduced |
|----------|-------|------------|
| 🔴 Critical | {N} | {N} new |
| 🟠 High | {N} | {N} new |
| 🟡 Medium | {N} | {N} new |
| 🟢 Low | {N} | {N} new |

{CRITICAL_FINDINGS_DETAILS}

### 💰 Cost Estimate

| Metric | Value |
|--------|-------|
| Monthly Before | ${BASE} |
| Monthly After | ${HEAD} |
| **Monthly Delta** | **{DELTA}** |
| Confidence | {LEVEL} |

{TOP_CONTRIBUTORS}

### ✅ Best Practices
{BEST_PRACTICE_SUMMARY}

---
🤖 Reviewed by KenchiOps • Tools: {TOOL_VERSIONS}
```

### Inline Comment Structure

```
{SEVERITY_EMOJI} **{CATEGORY}** [{RULE_ID}]

{DESCRIPTION}

**Resource:** `{RESOURCE_ADDRESS}`
**Risk:** {RISK_DESCRIPTION}

{FIX_SECTION - labeled as Verified or Suggested}

_Source: {TOOL} {VERSION} • [Rule Docs]({URL})_
```

### Field Classification (Deterministic vs AI)

| Field            | Source           | Deterministic?  |
| ---------------- | ---------------- | --------------- |
| File count       | Diff parser      | ✅ Yes          |
| Root count       | Root detector    | ✅ Yes          |
| Summary text     | AI summarizer    | ❌ No (labeled) |
| Finding counts   | Tool aggregation | ✅ Yes          |
| Finding details  | Tools            | ✅ Yes          |
| Cost figures     | Infracost        | ✅ Yes          |
| Confidence level | Delta calculator | ✅ Yes          |
| Verified fixes   | Tools            | ✅ Yes          |
| Suggested fixes  | AI               | ❌ No (labeled) |
| Tool versions    | Metadata         | ✅ Yes          |

---

## Data Models

### IaC Review

| Field              | Type     | Required | Description                                    |
| ------------------ | -------- | -------- | ---------------------------------------------- |
| id                 | string   | Yes      | UUID                                           |
| tenant_id          | string   | Yes      | Tenant reference                               |
| repository         | string   | Yes      | owner/repo                                     |
| pr_number          | number   | Yes      | PR number                                      |
| base_sha           | string   | Yes      | Base commit SHA                                |
| head_sha           | string   | Yes      | Head commit SHA                                |
| pr_author          | string   | Yes      | PR author                                      |
| pr_title           | string   | Yes      | PR title                                       |
| status             | enum     | Yes      | pending, analyzing, completed, failed, skipped |
| iac_types          | array    | Yes      | Detected IaC types                             |
| terraform_roots    | array    | No       | Detected Terraform roots                       |
| files_analyzed     | array    | Yes      | Files with analysis status                     |
| findings           | array    | Yes      | All findings                                   |
| findings_summary   | object   | Yes      | Aggregated counts                              |
| cost_estimate      | object   | No       | Cost delta (if Terraform)                      |
| evidence_catalog   | object   | Yes      | Full evidence registry                         |
| summary            | object   | No       | AI summary response                            |
| summary_source     | enum     | Yes      | ai or fallback                                 |
| baseline_mode      | enum     | Yes      | all, introduced_only, baseline_file            |
| tool_versions      | object   | Yes      | Tool versions used                             |
| check_run_id       | number   | No       | GitHub Check Run ID                            |
| comment_id         | number   | No       | Main comment ID                                |
| inline_comment_ids | array    | No       | Inline comment IDs                             |
| created_at         | datetime | Yes      | Creation timestamp                             |
| updated_at         | datetime | Yes      | Last update                                    |
| completed_at       | datetime | No       | Completion timestamp                           |

### Finding

| Field               | Type    | Required | Description                                            |
| ------------------- | ------- | -------- | ------------------------------------------------------ |
| id                  | string  | Yes      | Evidence ID (FND-\*)                                   |
| tool                | string  | Yes      | Source tool                                            |
| tool_version        | string  | Yes      | Tool version                                           |
| rule_id             | string  | Yes      | Rule ID from tool                                      |
| severity            | enum    | Yes      | critical, high, medium, low, info                      |
| category            | enum    | Yes      | security, compliance, reliability, cost, best_practice |
| title               | string  | Yes      | Finding title                                          |
| description         | string  | Yes      | Finding description                                    |
| file_path           | string  | Yes      | File location                                          |
| line_start          | number  | Yes      | Starting line                                          |
| line_end            | number  | No       | Ending line                                            |
| resource_address    | string  | No       | Resource address from IaC parser                       |
| is_introduced       | boolean | Yes      | Whether introduced by this PR                          |
| is_deduplicated     | boolean | Yes      | Whether deduplicated                                   |
| primary_finding_id  | string  | No       | Primary if deduplicated                                |
| verified_fix        | object  | No       | Fix from tool                                          |
| documentation_url   | string  | No       | Link to rule docs                                      |
| raw_output          | object  | No       | Original tool output                                   |
| location_resolution | object  | Yes      | LocationResolver output                                |

### Cost Estimate

| Field                 | Type   | Required | Description               |
| --------------------- | ------ | -------- | ------------------------- |
| id                    | string | Yes      | Evidence ID (COST-\*)     |
| root_path             | string | Yes      | Terraform root            |
| currency              | string | Yes      | USD                       |
| monthly_before        | number | Yes      | Base monthly cost         |
| monthly_after         | number | Yes      | Head monthly cost         |
| monthly_delta         | number | Yes      | Change                    |
| confidence            | enum   | Yes      | high, medium, low         |
| confidence_reasons    | array  | Yes      | Why this confidence level |
| resources             | array  | Yes      | Per-resource breakdown    |
| assumptions           | array  | No       | Assumptions made          |
| infracost_base_run_id | string | Yes      | Base run ID               |
| infracost_head_run_id | string | Yes      | Head run ID               |

### Parsed Resource

| Field      | Type   | Required | Description                         |
| ---------- | ------ | -------- | ----------------------------------- |
| id         | string | Yes      | Evidence ID (RES-\*)                |
| iac_type   | enum   | Yes      | terraform, kubernetes, etc.         |
| address    | string | Yes      | Resource address                    |
| type       | string | Yes      | Resource type                       |
| name       | string | Yes      | Resource name                       |
| file_path  | string | Yes      | Source file                         |
| line_start | number | Yes      | Starting line                       |
| line_end   | number | Yes      | Ending line                         |
| action     | enum   | Yes      | create, modify, delete, no_change   |
| namespace  | string | No       | K8s namespace                       |
| attributes | object | No       | Parsed attributes with line numbers |

---

## Success Metrics

| Metric                  | Target      | Measurement                                   |
| ----------------------- | ----------- | --------------------------------------------- |
| Analysis p95 latency    | < 2 minutes | PR event → comment posted                     |
| Finding accuracy        | > 95%       | Findings match tool output exactly            |
| Cost estimate accuracy  | ±20%        | Compare to actual bills                       |
| Inline comment accuracy | > 90%       | Comments on correct lines                     |
| False positive rate     | < 10%       | User dismissals / total                       |
| Developer satisfaction  | > 4/5       | Survey rating                                 |
| Boundary violations     | < 1%        | LLM outputs failing validation                |
| Tool success rate       | > 95%       | Tool executions completing                    |
| Baseline accuracy       | > 95%       | Correctly identify introduced vs pre-existing |

---

## Error Handling

| Scenario                      | Behavior                               |
| ----------------------------- | -------------------------------------- |
| Tool execution timeout        | Report partial results, note timeout   |
| Tool not available            | Skip that tool, continue with others   |
| Too many files                | Skip analysis, post comment explaining |
| Invalid IaC syntax            | Report parse error as finding          |
| GitHub API rate limit         | Queue and retry with backoff           |
| LLM timeout                   | Use fallback template summary          |
| LLM boundary violation        | Log, use fallback, continue            |
| All tools fail                | Mark review failed, post error comment |
| Terraform plan unavailable    | Use HCL parsing only, note limitation  |
| Infracost credentials missing | Skip cost estimate, note limitation    |
| Multi-root detection fails    | Treat as single root, note limitation  |

---

## Configuration

### Tenant Settings

| Setting              | Type    | Default         | Description                         |
| -------------------- | ------- | --------------- | ----------------------------------- |
| enable_iac_review    | boolean | true            | Enable IaC analysis                 |
| baseline_mode        | enum    | introduced_only | all, introduced_only, baseline_file |
| block_on_critical    | boolean | true            | Block merge on critical             |
| block_on_high        | boolean | false           | Block merge on high                 |
| cost_alert_threshold | number  | 100             | Alert if delta > $X                 |
| max_inline_comments  | number  | 10              | Max inline comments per review      |
| max_files_to_analyze | number  | 50              | Skip if too many files              |
| ignored_rules        | array   | []              | Rules to ignore globally            |
| required_tags        | array   | []              | Tags required on resources          |

### Repository Config (.kenchi/iac-review.yaml)

| Setting            | Type    | Description                   |
| ------------------ | ------- | ----------------------------- |
| enabled            | boolean | Override tenant enable        |
| terraform_roots    | array   | Explicit root paths           |
| include_patterns   | array   | File patterns to analyze      |
| exclude_patterns   | array   | File patterns to skip         |
| baseline_mode      | enum    | Override tenant baseline mode |
| ignored_rules      | array   | Additional rules to ignore    |
| severity_overrides | object  | Override rule severities      |

---

## Appendix A: Severity Normalization

| Tool       | Tool Severity | Our Severity |
| ---------- | ------------- | ------------ |
| Checkov    | CRITICAL      | critical     |
| Checkov    | HIGH          | high         |
| Checkov    | MEDIUM        | medium       |
| Checkov    | LOW           | low          |
| tfsec      | CRITICAL      | critical     |
| tfsec      | HIGH          | high         |
| tfsec      | MEDIUM        | medium       |
| tfsec      | LOW           | low          |
| tflint     | ERROR         | high         |
| tflint     | WARNING       | medium       |
| tflint     | NOTICE        | low          |
| kube-score | CRITICAL      | critical     |
| kube-score | WARNING       | medium       |
| kube-score | OK            | info         |

---

## Appendix B: Evidence ID Quick Reference

| Pattern                  | Example                        | Source            |
| ------------------------ | ------------------------------ | ----------------- |
| DIFF-{file}-{line}       | DIFF-main.tf-45                | Diff parser       |
| RES-{type}-{name}        | RES-aws_security_group-bastion | IaC parser        |
| FND-{tool}-{rule}-{n}    | FND-tfsec-AWS006-1             | Security analyzer |
| COST-{resource}-{action} | COST-aws_instance.web-create   | Infracost         |
| DEDUP-{primary_id}       | DEDUP-FND-checkov-CKV_AWS_1-1  | Deduplicator      |

---

## Appendix C: Glossary

| Term                   | Definition                                             |
| ---------------------- | ------------------------------------------------------ |
| IaC                    | Infrastructure as Code                                 |
| Finding                | A detected issue (security, cost, best practice)       |
| Evidence Packet        | Complete context provided to LLM                       |
| Evidence Catalog       | Registry of all evidence with unique IDs               |
| Deterministic Boundary | Hard line between tool findings and AI interpretation  |
| Narrator Role          | LLM constraint: summarize only, never invent           |
| Terraform Root         | Independent Terraform state directory                  |
| LocationResolver       | Component mapping tool locations to GitHub coordinates |
| Baseline               | Pre-existing findings to filter out                    |
| Verified Fix           | Remediation code from tool output                      |
| Suggested Fix          | AI-generated remediation (labeled unverified)          |
| IaC AST                | Parsed resource graph from HCL/YAML                    |
| Delta                  | Difference between base and head states                |
| Tool Conflict          | Multiple tools reporting same issue differently        |
| Primary Finding        | Winning finding after conflict resolution              |
| Secondary Finding      | Duplicate finding marked as non-primary                |
