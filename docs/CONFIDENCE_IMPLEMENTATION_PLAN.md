# Confidence Scoring Implementation Plan

## Purpose

Deliver a comprehensive roadmap for maintaining and evolving Kenchi’s deterministic confidence scoring system, aligning with the architecture described in `docs/SYSTEM_ARCHITECTURE.md` (Section 4.1) and the six-factor model captured in `docs/CONFIDENCE_SCORING.md`. The plan ensures confidence scores remain trustworthy, explainable, and tightly coupled to action gating and audit requirements.

---

## Current State Snapshot

- Confidence scoring is implemented as a deterministic, six-factor heuristic located in `packages/shared/src/safety`.
- Inputs: `LLMAnalysisResult` (summary, cause, recommended actions, uncertainties) and `Evidence`.
- Outputs: `ConfidenceScoreResult` (final score + factor breakdown) used to gate action proposals.
- Action gating uses fixed thresholds (see `docs/CONFIDENCE_SCORING.md:Action Gating Rules`).
- Storage: scores and breakdowns are logged but not persisted long-term.

Key gaps:

- No persistent record for analytics or tuning.
- Weight tuning is manual; no calibration loop.
- Missing observability on hedging detection or evidence alignment failures.
- Future features (RAG, multi-LLM) may introduce new signals that need formal ingestion.

---

## Phase 0 – Foundations & Instrumentation (Week 0-1)

1. **Code Audit**
   - Review `packages/shared/src/safety` to map every factor to the spec in `docs/CONFIDENCE_SCORING.md`.
   - Confirm integration points in API (`services/api/src/services/analysisService.ts`) and GitHub app aggregator.

2. **Persistence Layer**
   - Extend schema (e.g., new `analysis_confidence` table or columns on `analyses`) to store:
     - `analysis_id`, `event_id`
     - `final_score`
     - Breakdown map (JSONB)
     - Detected uncertainty phrases
     - Evidence alignment verdict
     - Timestamp + environment
   - Migration script under `database/init`.

3. **Logging & Telemetry**
   - Structured logs for factor contributions.
   - Metrics:
     - Score histogram (e.g., buckets: <0.3, 0.3-0.5, etc.).
     - Frequency of hedging detections.
     - Alignment failures vs successes.
   - Hook into existing logging pipeline (Winston/Pino).

4. **Testing Harness**
   - Unit tests covering:
     - Base score mapping.
     - Each uncertainty category.
     - Evidence alignment positive/negative cases.
     - Completeness checks (missing sections).
   - Snapshot tests to ensure breakdown outputs remain stable.

Deliverables:

- Schema update PR.
- Enhanced logging/metrics.
- Expanded test suite coverage (target >90% lines in safety module).

---

## Phase 1 – Factor Enhancements (Week 2-3)

1. **Uncertainty Detection Upgrade**
   - Move regex patterns to centrally managed config (e.g., YAML/JSON) so they can be updated without redeploying code.
   - Add language-aware detection (e.g., multi-language hedging keywords) for future international tenants.
   - Provide severity weights per keyword group for easier tuning.

2. **Evidence Alignment**
   - Implement cross-check between identified cause and evidence summary:
     - Keyword overlap scoring (TF-IDF or simple set matching).
     - Ensure referenced files/tests appear in evidence/test-failure list.
   - Add penalty when cause references files not present in evidence.

3. **Completeness Checks**
   - Validate required fields (summary, identifiedCause, recommendedActions, evidenceUsed).
   - Add penalty if fewer than N recommended actions or missing confidence field.

4. **Knowledge Validation (Future Hook)**
   - Prepare interface to verify whether retrieved RAG docs were cited; for now log placeholder.

Deliverables:

- Config-driven uncertainty module.
- Evidence alignment helper with tests (use sample logs/diffs).
- Updated scoring weights documented in `docs/CONFIDENCE_SCORING.md`.

---

## Phase 2 – Integration & Gating Refinement (Week 4)

1. **API & UI Updates**
   - Include score + short rationale in Slack/GitHub payloads (`analysis.confidenceDetails`).
   - Provide quick link to breakdown for debugging (admin only).

2. **Gating Logic Sync**
   - Revisit thresholds (System Architecture Table 4) to ensure they align with real-world usage.
   - Introduce tenant-level overrides:
     - Safe actions auto-run threshold (default 0.75).
     - Block threshold (default 0.3) configurable per tenant via `tenant_settings`.

3. **Approvals UX**
   - In Slack interactive blocks, show “Confidence: 62% (Medium – approval required)” to provide context.
   - Provide admin command to override gating for a single event if necessary.

4. **Storage Query APIs**
   - Expose internal endpoints (`GET /api/analysis/:id/confidence`) for dashboards and audits.

Deliverables:

- Updated Slack/GitHub formatters.
- Tenant-configurable gating.
- API surface for retrieving score history.

---

## Phase 3 – Calibration & Feedback Loop (Week 5-6)

1. **Outcome Tracking**
   - After human review, store `outcome` field (correct/incorrect/uncertain) in confidence record.
   - Capture if recommended actions were accepted/executed successfully.

2. **Calibration Jobs**
   - Offline job comparing predicted scores vs actual outcomes.
   - Identify bias (e.g., over-confident on dependency issues).
   - Suggest weight adjustments (semi-automatic) recorded in changelog.

3. **Auto-Tuning Framework**
   - Parameterize factor weights (base score multiplier, penalties) via config with feature flag.
   - Provide admin UI/CLI to test new configurations on historical data before deployment.

4. **Reporting**
   - Dashboard showing:
     - Score distribution.
     - False-positive/negative rate per bucket.
     - Top uncertainty triggers.

Deliverables:

- Outcome logging pipeline.
- Calibration script (tsx job) + documentation.
- Dashboard (Grafana/Looker) or at least CSV exports.

---

## Phase 4 – Advanced Capabilities (Post Week 6)

1. **Multi-LLM Signals**
   - When multiple analyses are run (self-consistency), aggregate scores (e.g., average, worst-case) and incorporate into gating.

2. **Model-Specific Profiles**
   - Maintain per-model bias adjustments (e.g., GPT-4 vs Claude) stored in config.

3. **Context-Aware Factors**
   - Adjust scores based on incident type/severity (e.g., production outage vs flaky test).
   - Integrate RAG signal (did retrieved doc increase confidence?).

4. **Explainability**
   - Provide human-readable breakdown (“-0.12 due to hedging: ‘possibly’”).
   - Offer quick debug view for on-call engineers.

5. **Resilience**
   - Gracefully handle missing factors (e.g., evidence unavailable) by reweighting the remaining components.

---

## Deliverables Checklist

- [ ] Schema migration for persistence.
- [ ] Enhanced logging/metrics + dashboards.
- [ ] Config-driven uncertainty detection.
- [ ] Evidence alignment module + tests.
- [ ] Updated `docs/CONFIDENCE_SCORING.md` with new weights + instructions.
- [ ] Tenant-aware gating controls.
- [ ] Outcome tracking + calibration tooling.
- [ ] Advanced roadmap items (multi-LLM, explainability) tracked via backlog.

Keep this plan updated as phases progress. Reference this document when filing issues/PRs related to confidence scoring or action gating.
