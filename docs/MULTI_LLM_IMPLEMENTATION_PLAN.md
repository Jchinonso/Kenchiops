# Multi-LLM Orchestration Implementation Plan

## Purpose

Introduce a phased plan for extending Kenchi’s architecture (`docs/SYSTEM_ARCHITECTURE.md`) to support multiple Large Language Models, each specializing in different parts of the pipeline (analysis, summarization, classification, code suggestions, etc.). The goal is to leverage each provider’s strengths while preserving the deterministic safety layers (confidence scoring, action gating) already in place.

---

## System Overview & Target State

### Current Single-LLM Flow

1. Evidence collection + RAG context assembly.
2. Prompt construction (single “analysis” prompt).
3. Single LLM call (OpenAI) returns `LLMAnalysisResult`.
4. Deterministic confidence scoring + action gating.

### Desired Multi-LLM Flow

```
Evidence + RAG
     │
     ▼
 ┌────────────┐    ┌────────────────────┐    ┌───────────────────┐
 │  Router    │───►│  LLM Capability DB │───►│  Task Assignment  │
 └────────────┘    └────────────────────┘    └────────┬──────────┘
       │                                            ┌──┴───────┐
       │                                            │          │
       ▼                                            ▼          ▼
   ┌───────────┐                         ┌────────────────┐ ┌────────────────┐
   │ Root Cause│◄─ GPT-4o / Claude Opus  │ Code Fix Synth │ │ Triage Classif │
   │ Analysis  │                         │ (Claude Sonnet)│ │ (Mixtral)      │
   └───────────┘                         └────────────────┘ └────────────────┘
       │                                            │          │
       └─────────┬──────────────────────────────────┘          │
                 ▼                                             ▼
        Deterministic Confidence Scoring + Action Gating + UX Formatting
```

Key components:

- **LLM Capability Registry**: metadata describing each model’s strengths, cost, token limits.
- **Router**: chooses model(s) per task (analysis, remediation, classification).
- **Task Coordinator**: orchestrates parallel/serial execution, aggregates outputs.
- **Evaluator**: runs consistency checks (e.g., cross-model validation) before feeding into existing deterministic layers.

---

## Cost & Efficiency Principles

- **Selective Execution**: Avoid running multiple large models per request unless necessary. Default to a single high-value model, invoke secondary models only for specific tasks (code fixes, tie-breaking analyses).
- **Task-Tiered Models**: Assign cheaper/faster LLMs to summaries and classification while reserving GPT-4o/Claude Opus for deep reasoning.
- **Sequential Fallbacks**: Prefer fallback chains (primary → secondary on failure) over parallel execution to reduce duplicated token spend.
- **Tenant Budgets**: Router must honor per-tenant cost caps/tiers; premium tenants can opt into ensembles, standard tenants stick to the base model.
- **Observability**: Track per-model token usage, latency, and failure rates. Automatically disable or downgrade expensive paths when budgets spike.

These guardrails should influence every phase to ensure multi-LLM support remains cost-effective.

---

## Phase 0 – Design & Instrumentation (Week 0-1)

1. **Capability Matrix**
   - Document available models (OpenAI GPT-4o mini, GPT-4 Turbo, Claude Opus/Sonnet, Mixtral, etc.).
   - For each: token window, latency, cost, strengths (code reasoning, summarization, classification).
   - Store as config (JSON/YAML) in repo for easy updates.

2. **Task Taxonomy**
   - Define canonical tasks:
     - Root cause analysis (long-form reasoning).
     - Code fix synthesis.
     - Short summaries / Slack captions.
     - Classification (risk level, action category).
     - Follow-up Q&A (interactive Slack).
   - Map each to requirements (context size, determinism, latency).

3. **Telemetry Hooks**
   - Instrument LLM calls with tags (task, model, latency, token usage).
   - Capture per-model success/failure for future routing decisions.

Deliverables: capability config, task taxonomy doc, telemetry scaffolding.

---

## Phase 1 – Router & Task Coordinator (Week 2-3)

1. **Router Module**
   - New shared module `packages/shared/src/llm/router.ts`.
   - Inputs: task type, context size, tenant preferences, cost budget.
   - Outputs: `LLMSelection` (provider, model id, max tokens, temperature).
   - Policies:
     - Default mapping (e.g., GPT-4o-mini for analysis, Claude Sonnet for summaries).
     - Override via config or tenant settings.
     - Fallback chain (primary, secondary, tertiary) per task.

2. **Task Coordinator**
   - Service-level orchestrator (e.g., `services/api/src/services/multiLlmCoordinator.ts`).
   - Handles:
     - Sequential tasks (analysis → fixes → classification).
     - Parallel tasks (multiple analyses for self-consistency).
     - Aggregation logic (choose best response, merge insights).
   - Provide structured result with provenance per model.

3. **Prompt Templates per Task**
   - Factor prompt logic into task-specific templates.
   - Ensure each template captures necessary constraints (safety, JSON schema).

Deliverables: router module, coordinator service, task templates.

---

## Phase 2 – Task Specialization & Consistency (Week 4-5)

1. **Root Cause Ensemble**
   - Run two different models on the same analysis prompt (e.g., GPT-4o + Claude Opus).
   - Compare outputs:
     - Agreement check: if both diagnoses align, boost confidence.
     - Disagreement path: flag for manual review or trigger third model as tie-breaker.

2. **Code Fix Synthesizer**
   - Use a model tuned for code generation (Claude Sonnet / GPT-4 Turbo).
   - Input: failure context + relevant diff chunks + source snippet.
   - Output: structured patch suggestions (to surface in PR comments).

3. **Risk Classification**
   - Lightweight, fast model (Mixtral 8x7B or GPT-3.5 Turbo) classifies severity, risk level, action categories.
   - Feed classification into confidence scoring as an additional signal.

4. **Summaries/UX Copy**
   - Use cheaper model for Slack/GitHub summaries to keep costs low.

5. **Consistency Engine**
   - Add deterministic checks:
     - Compare root cause and code fix outputs for alignment.
     - Validate that code fixes reference files present in evidence.

Deliverables: multi-model pipelines for analysis + code fixes + classification; consistency guardrails.

---

## Phase 3 – Tenant Controls & Cost Management (Week 6)

1. **Tenant Preferences**
   - Extend `tenant_settings` to include:
     - Allowed providers/models.
     - Budget tiers (basic vs premium).
     - Opt-in/out flags for ensemble analysis.

2. **Dynamic Budgeting**
   - Router considers per-tenant cost cap when assigning models.
   - Provide fallback to cheaper models when budget nearly exhausted.

3. **Usage Dashboard**
   - Track per-model token usage, cost, latency.
   - Alert when certain models degrade or exceed SLA.

4. **Feature Flags**
   - Enable gradual rollout per tenant or environment.

Deliverables: tenant config schema updates, router respecting budgets, dashboards/alerts.

---

## Phase 4 – Advanced Enhancements (Post Week 6)

1. **Task-Specific Fine-Tuning**
   - Fine-tune smaller models for classification tasks using Kenchi data.

2. **Adaptive Routing**
   - Apply ML/heuristics to automatically select models based on historical quality/cost for each tenant or repo.

3. **Asynchronous Pipelines**
   - Offload expensive tasks (code fixes) to async workers; return quick analysis first.

4. **Human-in-the-Loop Tools**
   - Provide UI to compare outputs from multiple models side-by-side.
   - Allow engineers to vote/select preferred analysis; feed back into routing logic.

5. **Self-Healing**
   - If primary model fails or deviates, automatically switch providers and log incident.

---

## Safety & Compliance Considerations

- **Deterministic Layers Unchanged**: Confidence scoring, action gating, secret redaction remain model-agnostic.
- **Logging/Audit**: Store per-model prompts/responses (redacted) for auditing.
- **Rate Limits**: Router must respect provider quotas; include exponential backoff + failover.
- **Privacy**: Honor tenant-level redaction and data residency requirements when routing to third-party providers.

---

## Deliverables Checklist

- [ ] Capability matrix config + telemetry instrumentation.
- [ ] Router + task coordinator modules.
- [ ] Task-specific prompt templates.
- [ ] Multi-model ensembles for analysis and code fixes.
- [ ] Consistency checks + deterministic validations.
- [ ] Tenant controls & budgeting.
- [ ] Monitoring dashboards + feature flags.
- [ ] Backlog items: adaptive routing, human-in-loop UI, fine-tuning.

Update this plan as we iterate; reference it when opening issues/PRs related to multi-LLM orchestration.
