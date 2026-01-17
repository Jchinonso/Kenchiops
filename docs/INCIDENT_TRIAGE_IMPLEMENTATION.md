# Incident Triage Assistant

## Executive Summary

This document specifies an intelligent incident triage system that processes alerts from multiple monitoring sources, enriches them with context, and delivers actionable notifications. The system enforces a strict **deterministic boundary** where all facts come from verifiable sources and the LLM serves only as a narrator—never as a source of truth.

**Key v3 Changes from v2:**

1. Strict `IncidentSummaryResponse` schema with validation rules
2. Formal `evidence_catalog` with storage and rendering specs
3. Explicit dedup vs correlation separation
4. Constrained RAG retrieval with recency decay
5. Slack UX: deterministic vs AI text specification
6. Policy Engine with explainability hooks
7. Idempotency keys for ingestion
8. Evidence completeness score (separate from confidence)
9. Backpressure and queue architecture
10. State transitions as evidence (STATE-\*)
11. Human override events as evidence (OVRD-\*)

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────┐
                    │           Alert Sources                  │
                    │  CloudWatch │ Datadog │ PagerDuty │ etc │
                    └───────────────────┬──────────────────────┘
                                        │ webhooks
                                        ▼
                    ┌──────────────────────────┐
                    │   Ingestion Layer        │
                    │  • Signature validation  │
                    │  • Idempotency check     │
                    │  • Queue for processing  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Alert Normalizer       │
                    │  • Source-specific       │
                    │  • Fingerprint generation│
                    │  • Schema validation     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Deduplication Engine   │
                    │  • Fingerprint match     │
                    │  • Time window check     │
                    │  • Merge or create       │
                    └────────────┬─────────────┘
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │                            │                            │
    ▼                            ▼                            ▼
┌───────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   Severity    │    │     Runbook       │    │    Incident       │
│  Classifier   │    │     Matcher       │    │   Correlator      │
│  (rule-based) │    │  (keyword+embed)  │    │   (similarity)    │
└───────┬───────┘    └─────────┬─────────┘    └─────────┬─────────┘
        │                      │                        │
        └──────────────────────┼────────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   RAG Searcher       │
                    │  • Constrained       │
                    │  • Max chunks/tokens │
                    │  • Structured output │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────────┐
                    │   Evidence Aggregator    │
                    │  • Build evidence_catalog│
                    │  • Compute confidence    │
                    │  • Compute completeness  │
                    │  • Build context packet  │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   AI Summarizer          │
                    │  • Narrator role ONLY    │
                    │  • Schema-validated      │
                    │  • Evidence citations    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Output Validator       │
                    │  • Schema validation     │
                    │  • Citation verification │
                    │  • Kill-switch checks    │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Policy Engine          │
                    │  • Routing decisions     │
                    │  • Escalation rules      │
                    │  • Channel selection     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Incident Record        │
                    │   (Database)             │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌───────────────┐ ┌─────────────────┐
    │  Slack Alert    │ │  PR Comment   │ │   PagerDuty     │
    │  Dispatcher     │ │  (if linked)  │ │   Escalation    │
    └─────────────────┘ └───────────────┘ └─────────────────┘
```

---

## Deterministic Boundary

### Non-Negotiable System Law

> **The LLM is never a source of truth.**
> **The LLM is never a producer of facts.**
> **The LLM is only a narrator of verified evidence.**

If a fact is not present in deterministic output, the LLM must behave as if it does not exist.

### Ground Truth Layer

Incident triage has no AST (alerts are not code). However, there is an equivalent: **schema validation + source-of-truth verification**.

| Ground Truth Layer | Implementation                             |
| ------------------ | ------------------------------------------ |
| CloudWatch SNS     | AWS signature validation before processing |
| PagerDuty webhook  | HMAC-SHA256 verification                   |
| Prometheus alert   | JSON Schema validation                     |
| Datadog payload    | HMAC verification                          |
| Metric values      | Strict numeric type parsing                |

This is the "ground truth layer" for incident triage—equivalent to AST parsing in CI/CD log analysis.

### Pipeline Comparison

| CI/CD Log Analysis       | Incident Triage Equivalent              |
| ------------------------ | --------------------------------------- |
| Raw logs                 | Raw alerts from monitoring sources      |
| AST parsing              | Alert normalization + schema validation |
| Deterministic extraction | Severity classification + rule matching |
| Error pattern matching   | Runbook matching + RAG retrieval        |
| Evidence artifacts       | Enrichment context packet               |
| LLM as narrator          | AI summarizer (narrator only)           |

### Fact Classes

**Class A — Alert-Derived Facts**

| Attribute   | Value                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Produced By | Alert normalizer (deterministic extraction from raw payload)                                                                         |
| Examples    | "CPU usage is 95%", "Threshold is 80%", "Service is payment-api", "Environment is production", "Alert fired at 2024-01-15T10:30:00Z" |
| Properties  | Directly traceable to raw payload, schema-validated, source signature verified                                                       |

**Class B — Enrichment-Verified Facts**

| Attribute   | Value                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produced By | Severity classifier, runbook matcher, incident correlator, RAG searcher                                                                                                               |
| Examples    | "Severity score is 85/100", "Contributing factors: production (40), cpu_metric (20)", "Runbook DB-001 matches with 0.87 relevance", "Similar incident INC-456 resolved in 45 minutes" |
| Properties  | Deterministic given same inputs, auditable (every score has traceable factors)                                                                                                        |

**Class C — Deterministic Derivations**

| Attribute   | Value                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Produced By | Evidence aggregator, confidence scorer, completeness scorer                                                           |
| Examples    | "Computed confidence is 0.75", "Evidence completeness is 0.60", "Missing expected fields: affected_users, error_rate" |
| Properties  | Derived from Class A + B, must include provenance (evidence IDs), must include computation method                     |

---

## Strict Output Schema: IncidentSummaryResponse

The AI summarizer MUST produce output conforming to this exact schema. Any deviation results in rejection and fallback to template-based summary.

### Schema Definition

| Field             | Type   | Required | Constraints                                  |
| ----------------- | ------ | -------- | -------------------------------------------- |
| summary           | string | Yes      | Max 500 characters, AI-generated narrative   |
| impact            | string | Yes      | Max 300 characters, must cite evidence       |
| current_signal    | string | Yes      | Max 200 characters, what we're observing now |
| severity          | enum   | Yes      | MUST match classifier output exactly         |
| confidence        | number | Yes      | MUST equal computed confidence (0.0-1.0)     |
| completeness      | number | Yes      | MUST equal computed completeness (0.0-1.0)   |
| suggested_actions | array  | Yes      | Each must cite evidence IDs                  |
| runbooks          | array  | Yes      | IDs only, must exist in matched runbooks     |
| related_incidents | array  | Yes      | IDs only, must exist in correlator output    |
| limitations       | array  | Yes      | Explicit list of what we don't know          |

### Suggested Action Schema

| Field        | Type   | Required    | Constraints                            |
| ------------ | ------ | ----------- | -------------------------------------- |
| description  | string | Yes         | Max 200 characters                     |
| priority     | number | Yes         | 1 = highest                            |
| evidence_ids | array  | Yes         | Must reference valid evidence IDs      |
| source       | enum   | Yes         | One of: runbook, historical, inference |
| runbook_id   | string | Conditional | Required if source is "runbook"        |
| incident_id  | string | Conditional | Required if source is "historical"     |

### Schema Validation Rules

1. **Severity match**: Response severity MUST equal classifier severity exactly
2. **Confidence match**: Response confidence MUST equal computed confidence (tolerance: 0.001)
3. **Completeness match**: Response completeness MUST equal computed completeness (tolerance: 0.001)
4. **Evidence ID validation**: All cited evidence_ids MUST exist in evidence_catalog
5. **Runbook ID validation**: All runbook IDs MUST come from matched runbooks list
6. **Incident ID validation**: All incident IDs MUST come from correlator output
7. **No invented metrics**: Any numeric values must trace to alert payload or enrichment
8. **Length limits**: All string fields must respect max character limits

### On Validation Failure

- Response is rejected
- Logged as compliance failure with specific violation details
- Fallback to template-based summary
- Compliance failure metric incremented

---

## Evidence Catalog

### Purpose

The evidence catalog is a map of all evidence IDs to their full records. It serves three purposes:

1. **Citation validation**: Verify that AI-cited evidence actually exists
2. **Traceability**: Link every claim to its source
3. **Rendering**: Provide human-friendly display for Slack

### Evidence ID Format

| Prefix | Source             | Format                 | Example               |
| ------ | ------------------ | ---------------------- | --------------------- |
| ALT    | Alert field        | ALT-{field}            | ALT-metrics.cpu_usage |
| ALT    | Alert nested field | ALT-{field}.{subfield} | ALT-labels.region     |
| SEV    | Severity factor    | SEV-{factor_name}      | SEV-production_env    |
| RB     | Runbook match      | RB-{runbook_id}        | RB-DB-001             |
| INC    | Related incident   | INC-{incident_id}      | INC-456               |
| RAG    | RAG result         | RAG-{doc_id}-{chunk}   | RAG-PM789-3           |
| CONF   | Confidence signal  | CONF-{signal_name}     | CONF-runbook_match    |
| COMP   | Completeness field | COMP-{field_name}      | COMP-affected_users   |

### Evidence Record Structure

Each evidence record contains:

| Field                | Description                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| id                   | Unique evidence ID (format above)                                                      |
| type                 | One of: alert_field, severity_factor, runbook, incident, rag, confidence, completeness |
| payload              | The actual evidence data (type-specific)                                               |
| source.component     | Which pipeline component produced this                                                 |
| source.timestamp     | When extracted                                                                         |
| source.raw_reference | Pointer to raw data (e.g., JSONPath, vector store reference)                           |
| display.label        | Human-friendly label for Slack                                                         |
| display.short_value  | Compact display (max 50 chars)                                                         |
| display.full_value   | Expanded display (optional)                                                            |
| display.url          | Clickable link (optional)                                                              |

### Evidence Catalog Population

| Component           | Populates                          | Evidence Type |
| ------------------- | ---------------------------------- | ------------- |
| Alert normalizer    | All alert fields and nested fields | ALT-\*        |
| Severity classifier | All matched severity factors       | SEV-\*        |
| Runbook matcher     | All matched runbooks               | RB-\*         |
| Incident correlator | All correlated incidents           | INC-\*        |
| RAG searcher        | All retrieved chunks               | RAG-\*        |
| Confidence scorer   | All confidence signals             | CONF-\*       |
| Completeness scorer | All completeness fields            | COMP-\*       |
| State tracker       | All state transitions              | STATE-\*      |
| Override tracker    | All human overrides                | OVRD-\*       |

### State Transitions as Evidence

Incident state changes are recorded as evidence so AI can cite them without inventing state.

| Evidence ID        | Description                                          |
| ------------------ | ---------------------------------------------------- |
| STATE-created      | Incident creation event                              |
| STATE-acknowledged | Acknowledgment with user and timestamp               |
| STATE-escalated    | Escalation with target level and reason              |
| STATE-resolved     | Resolution with user, timestamp, and resolution text |
| STATE-closed       | Closure event                                        |
| STATE-reopened     | Reopen event with reason                             |

**State Evidence Record**:

| Field          | Description                                                         |
| -------------- | ------------------------------------------------------------------- |
| id             | STATE-{transition_type}                                             |
| transition     | created, acknowledged, escalated, resolved, closed, reopened        |
| actor          | User or system that triggered transition                            |
| timestamp      | When transition occurred                                            |
| previous_state | State before transition                                             |
| new_state      | State after transition                                              |
| metadata       | Transition-specific data (resolution text, escalation reason, etc.) |

This allows AI to say: "This incident was acknowledged by Alice at 10:42 UTC [STATE-acknowledged]" without inventing state.

### Human Override Events

When humans override system decisions, record as evidence (not silent mutations).

| Evidence ID      | Description                  |
| ---------------- | ---------------------------- |
| OVRD-severity    | Manual severity override     |
| OVRD-routing     | Manual routing override      |
| OVRD-escalation  | Manual escalation override   |
| OVRD-resolution  | Manual resolution            |
| OVRD-suppression | Manual suppression of alerts |

**Override Evidence Record**:

| Field          | Description                                            |
| -------------- | ------------------------------------------------------ |
| id             | OVRD-{override_type}                                   |
| override_type  | severity, routing, escalation, resolution, suppression |
| actor          | User who made the override                             |
| timestamp      | When override occurred                                 |
| original_value | System-determined value                                |
| override_value | Human-specified value                                  |
| reason         | Why override was made (required)                       |
| expires_at     | Optional expiration for temporary overrides            |

This protects trust in retrospectives by making all human interventions visible and auditable.

---

## Deduplication vs Correlation

### Two Distinct Layers

| Layer             | Purpose                   | Method                    | Outcome             |
| ----------------- | ------------------------- | ------------------------- | ------------------- |
| **Deduplication** | Same incident repeated    | Fingerprint + time window | Merge into existing |
| **Correlation**   | Related but not duplicate | Embedding similarity      | Link, don't merge   |

### Deduplication Engine

**Purpose**: Prevent duplicate incidents from the same underlying issue.

**Fingerprint Components**:

| Field        | Rationale                |
| ------------ | ------------------------ |
| source       | Same monitoring system   |
| service      | Same affected service    |
| environment  | Same deployment          |
| title        | Same alert type          |
| metrics.name | Same metric (if present) |

**NOT included in fingerprint** (would make every alert unique):

- timestamp
- metrics.value (values change but issue is same)
- description (often contains timestamps)

**Deduplication Rules**:

1. Compute fingerprint as hash of components above
2. Search for existing incidents with same fingerprint
3. Filter to: status in (open, acknowledged), created within dedup window (default: 60 minutes)
4. If match found: merge alert into existing incident
5. If no match: create new incident

**Deduplication Outcomes**:

| Outcome        | Action                         | Reason                             |
| -------------- | ------------------------------ | ---------------------------------- |
| create_new     | Create new incident record     | No fingerprint match within window |
| merge_existing | Add alert to existing incident | Fingerprint match within window    |

### Incident Correlator

**Purpose**: Find related (but distinct) incidents for context.

**Correlation vs Dedup Decision Matrix**:

| Similarity | Same Service | Same Time Window | Action                     |
| ---------- | ------------ | ---------------- | -------------------------- |
| > 0.95     | Yes          | Yes              | Likely dedup miss - review |
| 0.80-0.95  | Yes          | Yes              | Link as related            |
| 0.80-0.95  | Yes          | No               | Link as historical         |
| 0.70-0.80  | Any          | Any              | Link if same category      |
| < 0.70     | Any          | Any              | Don't link                 |

**Correlation Types**:

| Type             | Definition                                      |
| ---------------- | ----------------------------------------------- |
| same_root_cause  | High similarity, same service, same time window |
| same_service     | Same service, different time                    |
| similar_symptoms | Different service, similar patterns             |
| historical       | Resolved incident with relevant resolution      |

**Correlation Rules**:

1. Generate embedding for current incident (title + description + service + metrics + labels)
2. Search vector store for similar incidents
3. Filter by tenant, exclude self
4. Include resolved incidents (for historical context)
5. Score and categorize each match
6. Return top 5 above minimum similarity threshold (default: 0.70)

**Correlation Output Fields**:

| Field            | Description                 |
| ---------------- | --------------------------- |
| incident_id      | ID of related incident      |
| similarity_score | Vector similarity (0.0-1.0) |
| correlation_type | One of the types above      |
| shared_signals   | What made them similar      |

---

## Constrained RAG Retrieval

### Design Principle

RAG retrieval follows the same principle as log chunking: **retrieve structured data, not freeform text**.

### RAG Configuration

| Parameter              | Default                                | Description                             |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| max_chunks             | 10                                     | Maximum number of chunks to retrieve    |
| max_tokens_per_chunk   | 500                                    | Maximum tokens per individual chunk     |
| max_total_tokens       | 3000                                   | Total token budget for all RAG results  |
| redact_secrets         | true                                   | Always redact detected secrets          |
| allowed_doc_sources    | postmortems, runbooks, wiki, playbooks | Document types to search                |
| recency_decay_enabled  | true                                   | Apply recency decay to relevance scores |
| recency_half_life_days | 180                                    | Days until relevance score halved       |

### RAG Recency Decay

Prefer newer postmortems and runbooks when relevance scores are similar.

**Decay Formula**:

| Component    | Description                                 |
| ------------ | ------------------------------------------- |
| base_score   | Vector similarity score (0.0-1.0)           |
| doc_age_days | Days since document was created/updated     |
| half_life    | Configured half-life in days (default: 180) |
| decay_factor | 0.5 ^ (doc_age_days / half_life)            |
| final_score  | base_score × (0.7 + 0.3 × decay_factor)     |

**Rationale**:

- 70% of score is pure relevance (prevents new irrelevant docs from winning)
- 30% of score is recency-adjusted
- 6-month-old doc retains ~85% of recency component
- 1-year-old doc retains ~70% of recency component
- Very old docs (2+ years) retain ~50% of recency component

**Tiebreaker Rules**:

When two documents have equal final scores:

1. Prefer more recently updated
2. Prefer higher base relevance score
3. Prefer shorter document (more focused)
4. Prefer documents from same service as incident

### RAG Result Structure

Each RAG result contains:

| Field                                  | Description                               |
| -------------------------------------- | ----------------------------------------- |
| id                                     | Evidence ID: RAG-{doc_id}-{chunk}         |
| doc_id                                 | Source document identifier                |
| doc_title                              | Document title                            |
| doc_source                             | Document type (postmortem, runbook, etc.) |
| doc_timestamp                          | When document was created/updated         |
| chunk_index                            | Position in document                      |
| chunk_start_offset                     | Character offset in original doc          |
| chunk_end_offset                       | Character offset end                      |
| snippet                                | The actual text (truncated to max_tokens) |
| relevance_score                        | Vector similarity score                   |
| snippet_boundaries.starts_mid_sentence | Boolean                                   |
| snippet_boundaries.ends_mid_sentence   | Boolean                                   |

### RAG Retrieval Rules

1. Generate query embedding from incident context
2. Search with constraints (max_chunks, allowed sources, exclude confidential)
3. For each result: redact secrets, truncate to max_tokens_per_chunk, track cumulative tokens
4. Stop when max_total_tokens reached
5. Return structured results with full metadata

### Banned RAG Patterns

| Pattern               | Reason                       | Enforcement                                          |
| --------------------- | ---------------------------- | ---------------------------------------------------- |
| Raw markdown blobs    | Unparseable, variable length | Only structured RAGResult allowed                    |
| Entire documents      | Token explosion              | max_chunks + max_tokens limits                       |
| Docs with secrets     | Security risk                | Redaction + sensitivity filter                       |
| Unattributed snippets | Can't trace to source        | Every result has doc_id + chunk_index                |
| Freeform relevance    | LLM can't judge              | relevance_score is vector similarity (deterministic) |

---

## Slack UX: Deterministic vs AI Text

### Trust Principle

Engineers must know which parts of the Slack message are **verifiable facts** vs **AI interpretation**.

### Message Structure

```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL: payment-api High CPU Usage                    │ ← DETERMINISTIC
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SUMMARY (AI-generated)                                  │ │
│ │                                                         │ │
│ │ Payment API is experiencing CPU exhaustion, likely due  │ │
│ │ to connection pool saturation. Similar to INC-456 last  │ │ ← AI TEXT
│ │ week which was resolved by scaling the pool.            │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ SIGNALS                                    (deterministic)  │
│ ├─ CPU Usage: 95% (threshold: 80%)                         │ ← DETERMINISTIC
│ ├─ Memory: 78% (threshold: 90%)                            │ ← DETERMINISTIC
│ ├─ Timestamp: 2024-01-15 10:30:00 UTC                      │ ← DETERMINISTIC
│ └─ Environment: production                                  │ ← DETERMINISTIC
├─────────────────────────────────────────────────────────────┤
│ SEVERITY                                   (deterministic)  │
│ ├─ Score: 85/100 → CRITICAL                                │ ← DETERMINISTIC
│ ├─ Factors:                                                │
│ │   • Production environment (+40)                         │ ← DETERMINISTIC
│ │   • CPU metric breach (+20)                              │ ← DETERMINISTIC
│ │   • Payment service criticality (+25)                    │ ← DETERMINISTIC
│ └─ Confidence: 75% | Completeness: 60%                     │ ← DETERMINISTIC
├─────────────────────────────────────────────────────────────┤
│ SUGGESTED ACTIONS                          (AI-prioritized) │
│ 1. Check connection pool metrics [RB-DB-001]               │ ← AI ordering
│ 2. Review recent deployments [INC-456]                     │ ← AI ordering
│ 3. Scale horizontal if pool exhausted [RB-DB-001]          │ ← AI ordering
├─────────────────────────────────────────────────────────────┤
│ RUNBOOKS                                   (deterministic)  │
│ • DB-001: Database Connection Pool (87% match)             │ ← DETERMINISTIC
│ • SRE-015: CPU Alert Response (72% match)                  │ ← DETERMINISTIC
├─────────────────────────────────────────────────────────────┤
│ SIMILAR INCIDENTS                          (deterministic)  │
│ • INC-456: Payment API Latency (82% similar) - RESOLVED    │ ← DETERMINISTIC
│   └─ Resolution: Scaled connection pool 50→100             │
│ • INC-423: API Gateway Timeout (71% similar) - RESOLVED    │ ← DETERMINISTIC
├─────────────────────────────────────────────────────────────┤
│ [Acknowledge] [Snooze] [View in Dashboard] [Open War Room] │
└─────────────────────────────────────────────────────────────┘
```

### Field Classification

| Field               | Source           | Deterministic? | Notes                          |
| ------------------- | ---------------- | -------------- | ------------------------------ |
| Title               | Alert title      | ✅ Yes         | Verbatim from alert            |
| Summary text        | AI summarizer    | ❌ No          | Clearly labeled "AI-generated" |
| Metric values       | Alert payload    | ✅ Yes         | Numbers from metrics object    |
| Thresholds          | Alert payload    | ✅ Yes         | Numbers from metrics object    |
| Timestamps          | Alert payload    | ✅ Yes         | ISO 8601 from alert            |
| Environment         | Normalized alert | ✅ Yes         | From normalization             |
| Severity score      | Classifier       | ✅ Yes         | Computed by rules              |
| Severity level      | Classifier       | ✅ Yes         | Derived from score             |
| Severity factors    | Classifier       | ✅ Yes         | Each rule that matched         |
| Confidence          | Aggregator       | ✅ Yes         | Computed formula               |
| Completeness        | Aggregator       | ✅ Yes         | Computed formula               |
| Action descriptions | AI summarizer    | ❌ No          | AI-written but evidence-backed |
| Action ordering     | AI summarizer    | ❌ No          | AI prioritization              |
| Action citations    | Evidence catalog | ✅ Yes         | Must exist in catalog          |
| Runbook list        | Matcher          | ✅ Yes         | IDs and scores from matcher    |
| Runbook scores      | Matcher          | ✅ Yes         | Computed relevance             |
| Related incidents   | Correlator       | ✅ Yes         | IDs and scores from correlator |
| Similarity scores   | Correlator       | ✅ Yes         | Vector similarity              |

### Display Rules

1. AI-generated content MUST be visually distinguished (box, label, or both)
2. Numbers MUST come from deterministic sources only
3. Scores and percentages MUST show their source
4. Evidence citations MUST be rendered as links when URLs available
5. Missing fields SHOULD be shown to explain low completeness

---

## Policy Engine

### Purpose

Deterministic routing and escalation decisions. **No AI involvement.**

### Policy Decision Output

| Field             | Description                                  |
| ----------------- | -------------------------------------------- |
| slack_channels    | Which Slack channel(s) to post to            |
| page_pagerduty    | Whether to page PagerDuty                    |
| pagerduty_service | Which PagerDuty service (if paging)          |
| open_war_room     | Whether to create dedicated war room channel |
| pr_comment        | Whether to comment on linked PR              |
| reasons           | Audit trail of which rules matched           |

### Explainability Hooks

To answer "Why didn't this page PagerDuty?" store complete decision context:

| Field                   | Description                                      |
| ----------------------- | ------------------------------------------------ |
| evaluation_order        | Order in which rules were evaluated              |
| rules_evaluated         | All rules checked with match result              |
| rules_matched           | Rules that matched                               |
| rules_suppressed        | Rules that matched but were suppressed (and why) |
| final_decision_snapshot | Complete decision state at time of evaluation    |
| decision_timestamp      | When decision was made                           |

### Suppression Reasons

| Reason             | Description                            |
| ------------------ | -------------------------------------- |
| cooldown_active    | Same incident paged recently           |
| maintenance_window | Service in maintenance                 |
| tenant_override    | Tenant setting disabled this action    |
| repo_override      | Repository config disabled this action |
| severity_threshold | Severity below configured threshold    |
| environment_filter | Non-production environment filtered    |

### Policy Rules

| Rule ID          | Name                      | Conditions                                   | Actions                                                               |
| ---------------- | ------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| P1_CRITICAL_PROD | Critical Production Alert | severity=critical AND environment=production | page=true, war_room=true, channels=[#incidents-critical, #sre-oncall] |
| P2_HIGH_PROD     | High Production Alert     | severity=high AND environment=production     | page=true, war_room=false, channels=[#incidents-high]                 |
| P3_MEDIUM_PROD   | Medium Production Alert   | severity=medium AND environment=production   | page=false, channels=[#incidents-medium]                              |
| NON_PROD         | Non-Production Alert      | environment IN (staging, development)        | page=false, channels=[#incidents-nonprd]                              |
| SERVICE_PAYMENT  | Payment Service Alert     | service=payment-api                          | channels+=[#team-payments]                                            |
| SERVICE_AUTH     | Auth Service Alert        | service=auth-service                         | channels+=[#team-identity]                                            |

### Policy Evaluation Rules

1. Evaluate all rules in order
2. Accumulate actions (channels append, booleans OR)
3. Record which rules matched for audit
4. Deduplicate final channel list
5. Return complete routing decision with reasons

### Escalation Rules

| Condition                                    | Target Level |
| -------------------------------------------- | ------------ |
| severity=critical AND environment=production | L2           |
| severity=critical AND no_ack_after=15min     | L3           |
| severity=critical AND no_ack_after=30min     | management   |
| multiple_services_affected=true              | L2           |

---

## Idempotency

### Purpose

Prevent duplicate incident creation during retries or webhook replay.

### Idempotency Key Computation

| Component     | Source                                   |
| ------------- | ---------------------------------------- |
| source        | Alert source (cloudwatch, datadog, etc.) |
| sourceAlertId | Original alert ID from source system     |
| tenantId      | Tenant identifier                        |

**Formula**: sha256(source + "|" + sourceAlertId + "|" + tenantId)

### Idempotency Flow

1. Receive alert webhook
2. Validate source signature (ground truth)
3. Extract source alert ID
4. Compute idempotency key
5. Check idempotency store for existing key
6. If exists: return duplicate response with existing incident ID
7. If not exists: reserve key with "processing" status (TTL: 24 hours)
8. Queue for processing
9. On completion: update key with incident ID

### Idempotency Store Schema

| Field        | Description                          |
| ------------ | ------------------------------------ |
| key          | Computed idempotency key             |
| status       | processing, completed, failed        |
| incident_id  | Resulting incident ID (if completed) |
| started_at   | When processing started              |
| completed_at | When processing completed            |
| ttl          | 24 hours                             |

---

## Confidence vs Completeness

### Separate Concepts

| Metric           | Question                                    | Example                              |
| ---------------- | ------------------------------------------- | ------------------------------------ |
| **Confidence**   | How certain are we about what we DO know?   | "We're 90% sure this is a CPU issue" |
| **Completeness** | How much of what we SHOULD know do we have? | "We have 60% of expected fields"     |

### Confidence Computation

Confidence measures certainty given available evidence.

**Confidence Signals**:

| Signal               | Weight | Description                                  |
| -------------------- | ------ | -------------------------------------------- |
| has_metrics          | 0.30   | Alert includes metric values                 |
| has_runbook_match    | 0.25   | At least one runbook matched above threshold |
| has_similar_incident | 0.20   | At least one similar incident found          |
| has_rag_context      | 0.15   | RAG retrieved relevant documents             |
| service_known        | 0.10   | Service is in known service catalog          |

**Confidence Formula**:

- Sum weights of present signals
- Divide by total possible weight
- Cap at 0.95 (never 100% certain)
- Minimum 0.10 (always some uncertainty)

### Completeness Computation

Completeness measures how much expected data we have.

**Completeness Fields**:

| Field           | Category | Weight |
| --------------- | -------- | ------ |
| service         | required | 0.50   |
| environment     | required | 0.50   |
| timestamp       | required | 0.50   |
| metrics         | expected | 0.35   |
| description     | expected | 0.35   |
| runbook_match   | expected | 0.35   |
| affected_users  | optional | 0.15   |
| error_rate      | optional | 0.15   |
| deployment_link | optional | 0.15   |

**Completeness Formula**:

- Sum weights of present fields
- Divide by total possible weight
- Track missing fields for display

### Display in Slack

```
Confidence: 75% | Completeness: 60%
└─ Missing: affected_users, error_rate, deployment_link
```

---

## Backpressure and Queue Architecture

### Design Principle

Ingestion should **never block on LLM**. Alert receipt must be fast and reliable.

### Architecture Layers

```
┌──────────────────────────┐
│   Alert Sources          │
│   (webhooks)             │
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   Ingestion API          │  ← Response: <100ms
│   • Signature validation │
│   • Idempotency check    │
│   • Enqueue              │
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   Processing Queue       │  ← Backpressure here
│   • Retry with backoff   │
│   • DLQ for failures     │
└───────────┬──────────────┘
            │
┌───────────▼──────────────┐
│   Worker Pool            │  ← Slow processing here
│   • Normalize            │
│   • Dedupe               │
│   • Enrich (parallel)    │
│   • Summarize (LLM)      │
│   • Validate             │
│   • Dispatch             │
└──────────────────────────┘
```

### Queue Configuration

**Processing Queue**:

| Parameter          | Value                   | Description                  |
| ------------------ | ----------------------- | ---------------------------- |
| max_retries        | 3                       | Attempts before DLQ          |
| retry_backoff      | 1s, 5s, 30s             | Exponential backoff          |
| visibility_timeout | 2 minutes               | Time to process before retry |
| dlq_name           | incident-processing-dlq | Dead letter queue            |

**Dispatch Queue** (separate for reliability):

| Parameter          | Value                   | Description                    |
| ------------------ | ----------------------- | ------------------------------ |
| max_retries        | 5                       | More retries for notifications |
| retry_backoff      | 0.5s, 2s, 10s, 30s, 60s | Longer backoff                 |
| visibility_timeout | 30 seconds              | Notifications are fast         |

### Backpressure Handling

| Queue Depth        | Action                                  |
| ------------------ | --------------------------------------- |
| Normal             | Process normally                        |
| High watermark     | Log warning, continue accepting         |
| Critical watermark | Reject new messages, return retry-after |

### Progressive Slack Notification

For slow processing, post "processing" message first, then update.

**Step 1**: After quick processing (normalize, dedupe) - if new incident:

- Post Slack message with header, signals, and "⏳ Analyzing incident..."
- Store Slack message ID

**Step 2**: After slow processing (enrich, summarize):

- Update Slack message with full content (summary, actions, runbooks, related)

This ensures engineers see the alert immediately even if enrichment takes 30+ seconds.

---

## AI Prompt Contract

### System Prompt Requirements

The AI summarizer system prompt MUST include:

1. **Role definition**: "You are an incident triage narrator. Your role is to summarize verified evidence into human-readable text."

2. **Absolute rules**:
   - You may ONLY use information present in the evidence packet
   - You MUST cite evidence using [EVIDENCE_ID] format
   - You MUST NOT invent metrics, thresholds, services, or timestamps
   - You MUST NOT override severity or confidence values
   - You MUST NOT create runbook or incident IDs that weren't provided
   - You MUST acknowledge limitations when evidence is incomplete

3. **Output format**: "You must respond with valid JSON matching the IncidentSummaryResponse schema."

4. **Computed values injection**: severity, confidence, and completeness values MUST be provided with instruction to use exactly

5. **Suggested actions guidance**:
   - Each action MUST cite at least one evidence ID
   - Actions should be drawn from matched runbooks or historical resolutions
   - If inferring an action, mark source as "inference" and explain reasoning

6. **Limitations guidance**:
   - If evidence is incomplete, say what's missing
   - If confidence is low, explain why
   - Never present uncertainty as certainty

### User Prompt Structure

The user prompt MUST include these sections in order:

1. NORMALIZED ALERT (full JSON)
2. SEVERITY CLASSIFICATION (score, level, factors)
3. MATCHED RUNBOOKS (id, title, relevance, match reasons)
4. RELATED INCIDENTS (id, title, similarity, resolution)
5. RAG CONTEXT (doc_id, title, snippet, relevance)
6. EVIDENCE CATALOG (full map for citation validation)
7. COMPUTED VALUES (severity, confidence, completeness, missing_fields - with instruction to use exactly)

---

## Kill-Switches

### Validation Kill-Switches

| Capability           | Enforcement                              | On Violation            |
| -------------------- | ---------------------------------------- | ----------------------- |
| Fact invention       | Schema validation rejects unknown fields | Reject, use fallback    |
| Confidence inflation | Hard cap at computed value               | Reject, use computed    |
| Severity override    | Must match classifier                    | Reject, use computed    |
| Evidence fabrication | All IDs validated against catalog        | Reject, use fallback    |
| Metric guessing      | Only metrics from alert payload          | Reject, strip metrics   |
| Runbook creation     | Only matched IDs allowed                 | Reject, filter to valid |
| Incident creation    | Only correlated IDs allowed              | Reject, filter to valid |
| Length exceeded      | String field max lengths                 | Reject, use fallback    |

### Fallback Summary

When AI fails validation, generate template-based summary:

**Summary template**: "{SEVERITY} alert on {SERVICE} in {ENVIRONMENT}. {METRIC_NAME} at {METRIC_VALUE}{UNIT} (threshold: {THRESHOLD}{UNIT})."

**Impact template**: "Potential impact to {ENVIRONMENT} users." (production) or "Impact limited to {ENVIRONMENT} environment." (non-production)

**Current signal template**: "{METRIC_NAME}: {METRIC_VALUE}{UNIT}" or alert title if no metrics

**Suggested actions**: One action per matched runbook: "Follow runbook: {RUNBOOK_TITLE}"

**Limitations**: Always include "AI summary unavailable - using template fallback" plus list of missing fields

---

## Data Models

### Normalized Alert

| Field         | Type     | Required | Description                                        |
| ------------- | -------- | -------- | -------------------------------------------------- |
| id            | string   | Yes      | UUID v4                                            |
| source        | enum     | Yes      | cloudwatch, datadog, pagerduty, prometheus, custom |
| sourceAlertId | string   | Yes      | Original alert ID from source                      |
| fingerprint   | string   | Yes      | Dedup hash                                         |
| timestamp     | datetime | Yes      | When alert fired                                   |
| receivedAt    | datetime | Yes      | When we received it                                |
| service       | string   | Yes      | Affected service                                   |
| environment   | enum     | Yes      | production, staging, development                   |
| title         | string   | Yes      | Alert title                                        |
| description   | string   | No       | Alert description                                  |
| metrics       | object   | No       | Metric details (see below)                         |
| labels        | map      | No       | Key-value labels from source                       |
| rawPayload    | any      | Yes      | Original for debugging                             |
| tenantId      | string   | Yes      | Tenant identifier                                  |
| processed     | boolean  | Yes      | Whether processed into incident                    |
| incidentId    | string   | No       | Linked incident if processed                       |

### Alert Metrics

| Field     | Type   | Description                     |
| --------- | ------ | ------------------------------- |
| name      | string | Metric name (e.g., "cpu_usage") |
| value     | number | Current value                   |
| threshold | number | Configured threshold            |
| unit      | string | Unit (%, ms, bytes, etc.)       |

### Incident

| Field               | Type     | Required | Description                          |
| ------------------- | -------- | -------- | ------------------------------------ |
| id                  | string   | Yes      | UUID v4                              |
| tenantId            | string   | Yes      | Tenant identifier                    |
| normalizedAlert     | object   | Yes      | Full normalized alert                |
| fingerprint         | string   | Yes      | Dedup fingerprint                    |
| status              | enum     | Yes      | open, acknowledged, resolved, closed |
| acknowledgedAt      | datetime | No       | When acknowledged                    |
| acknowledgedBy      | string   | No       | Who acknowledged                     |
| resolvedAt          | datetime | No       | When resolved                        |
| resolvedBy          | string   | No       | Who resolved                         |
| resolution          | string   | No       | Resolution description               |
| severityScore       | number   | Yes      | 0-100                                |
| severityLevel       | enum     | Yes      | critical, high, medium, low, info    |
| severityFactors     | array    | Yes      | Contributing factors                 |
| matchedRunbooks     | array    | Yes      | Matched runbooks with scores         |
| relatedIncidents    | array    | Yes      | Correlated incidents with scores     |
| ragResults          | array    | Yes      | RAG retrieval results                |
| confidence          | number   | Yes      | Computed confidence 0.0-1.0          |
| completeness        | number   | Yes      | Computed completeness 0.0-1.0        |
| missingFields       | array    | Yes      | List of missing expected fields      |
| evidenceCatalog     | map      | Yes      | Full evidence catalog                |
| summary             | object   | No       | AI summary response                  |
| summaryGeneratedAt  | datetime | No       | When summary generated               |
| summarySource       | enum     | Yes      | ai or fallback                       |
| routingDecision     | object   | Yes      | Policy engine output                 |
| slackMessageId      | string   | No       | Slack message ID for updates         |
| slackChannels       | array    | Yes      | Posted channels                      |
| pagerdutyIncidentId | string   | No       | PagerDuty incident if created        |
| warRoomChannelId    | string   | No       | War room channel if created          |
| ttd                 | number   | No       | Time to detect (ms)                  |
| tta                 | number   | No       | Time to acknowledge (ms)             |
| ttr                 | number   | No       | Time to resolve (ms)                 |
| createdAt           | datetime | Yes      | Creation timestamp                   |
| updatedAt           | datetime | Yes      | Last update timestamp                |

### Severity Factor

| Field   | Type    | Description                 |
| ------- | ------- | --------------------------- |
| name    | string  | Factor name                 |
| weight  | number  | Weight contributed to score |
| matched | boolean | Whether this factor matched |
| details | string  | Why it matched or didn't    |

### Linked Runbook

| Field          | Type   | Description         |
| -------------- | ------ | ------------------- |
| id             | string | Runbook ID          |
| title          | string | Runbook title       |
| relevanceScore | number | Match score 0.0-1.0 |
| matchReasons   | array  | Why it matched      |
| url            | string | Link to runbook     |

### Related Incident

| Field           | Type     | Description                                                 |
| --------------- | -------- | ----------------------------------------------------------- |
| id              | string   | Incident ID                                                 |
| title           | string   | Incident title                                              |
| similarityScore | number   | Vector similarity 0.0-1.0                                   |
| correlationType | enum     | same_root_cause, same_service, similar_symptoms, historical |
| status          | enum     | Incident status                                             |
| resolution      | string   | How it was resolved (if resolved)                           |
| resolvedAt      | datetime | When resolved                                               |
| ttr             | number   | Time to resolve (ms)                                        |

---

## Success Metrics

| Metric                    | Target                    | Measurement                         |
| ------------------------- | ------------------------- | ----------------------------------- |
| TTD (Time to Detect)      | < 60s                     | Alert received → incident created   |
| TTA (Time to Acknowledge) | < 5m for P1/P2            | Incident created → acknowledged     |
| TTR (Time to Resolve)     | < 30m for P1, < 2h for P2 | Incident created → resolved         |
| Dedup accuracy            | > 95%                     | Correct merge/create decisions      |
| False positive rate       | < 5%                      | Incidents that weren't real issues  |
| Runbook relevance         | > 80% usefulness          | User feedback on suggested runbooks |
| Summary accuracy          | > 90% factual             | No invented facts in summaries      |
| Boundary violations       | < 1% of summaries         | Kill-switch triggers                |
| AI fallback rate          | < 10%                     | Fallback summary usage              |
| Ingestion p99 latency     | < 200ms                   | Webhook receive → queue             |
| Processing p99 latency    | < 30s                     | Queue → Slack posted                |

---

## Appendix A: Source Signature Validation

### CloudWatch SNS

| Step | Description                                          |
| ---- | ---------------------------------------------------- |
| 1    | Check SignatureVersion is "1"                        |
| 2    | Validate SigningCertURL is from sns.\*.amazonaws.com |
| 3    | Fetch signing certificate                            |
| 4    | Build string to sign per AWS spec                    |
| 5    | Verify signature against certificate                 |

### PagerDuty Webhook

| Step | Description                                         |
| ---- | --------------------------------------------------- |
| 1    | Extract X-PagerDuty-Signature header                |
| 2    | Compute HMAC-SHA256 of raw body with webhook secret |
| 3    | Constant-time compare computed vs provided          |

### Datadog Webhook

| Step | Description                                                     |
| ---- | --------------------------------------------------------------- |
| 1    | Extract DD-Webhook-Signature and DD-Webhook-Timestamp headers   |
| 2    | Check timestamp is within 5 minutes of now (prevent replay)     |
| 3    | Compute HMAC-SHA256 of "{timestamp}.{body}" with webhook secret |
| 4    | Constant-time compare computed vs provided                      |

---

## Appendix B: Evidence ID Quick Reference

| Pattern                | Example               | Source              |
| ---------------------- | --------------------- | ------------------- |
| ALT-{field}            | ALT-metrics.cpu_usage | Alert normalizer    |
| ALT-{field}.{subfield} | ALT-labels.region     | Alert normalizer    |
| SEV-{factor}           | SEV-production_env    | Severity classifier |
| RB-{runbook_id}        | RB-DB-001             | Runbook matcher     |
| INC-{incident_id}      | INC-456               | Incident correlator |
| RAG-{doc_id}-{chunk}   | RAG-PM789-3           | RAG searcher        |
| CONF-{signal}          | CONF-runbook_match    | Confidence scorer   |
| COMP-{field}           | COMP-affected_users   | Completeness scorer |
| STATE-{transition}     | STATE-acknowledged    | State tracker       |
| OVRD-{type}            | OVRD-severity         | Override tracker    |

---

## Appendix C: Glossary

| Term                   | Definition                                                   |
| ---------------------- | ------------------------------------------------------------ |
| Alert                  | Raw signal from monitoring source                            |
| Incident               | Processed, enriched alert ready for human action             |
| Fingerprint            | Deterministic hash for deduplication                         |
| Evidence Packet        | Complete context provided to LLM                             |
| Evidence Catalog       | Map of evidence IDs to their full records                    |
| Deterministic Boundary | Hard line between verifiable facts and AI interpretation     |
| Narrator Role          | LLM constraint: summarize only, never invent                 |
| Severity Factor        | Individual signal contributing to severity score             |
| Confidence             | Certainty about what we know (given evidence)                |
| Completeness           | Percentage of expected fields present                        |
| Runbook                | Documented procedure for handling specific incident types    |
| War Room               | Dedicated Slack channel for P1 incident coordination         |
| TTD                    | Time to Detect - alert firing to incident creation           |
| TTA                    | Time to Acknowledge - incident creation to acknowledgment    |
| TTR                    | Time to Resolve - incident creation to resolution            |
| Idempotency Key        | Hash preventing duplicate processing                         |
| Backpressure           | Queue-based flow control for reliability                     |
| Kill-Switch            | Validation that rejects boundary violations                  |
| Fallback               | Template-based output when AI fails                          |
| Ground Truth Layer     | Signature validation + schema validation (equivalent to AST) |
| State Transition       | Change in incident status recorded as evidence               |
| Human Override         | Manual intervention recorded as evidence for auditability    |
| Recency Decay          | Score adjustment preferring newer documents in RAG           |
| Explainability Hook    | Stored decision context for post-incident analysis           |
