/**
 * Investigation Diagnosis Prompt
 *
 * System and user prompts for generating a structured diagnosis
 * from investigation evidence and correlation data.
 *
 * @module prompts/investigationDiagnosisPrompt
 */

import { truncateText } from "@kenchi/shared";
import type {
  EvidenceSourceType,
  InvestigationIntent,
  InvestigationEvidenceItem,
  InvestigationCorrelation,
} from "../types/investigationTypes.js";

// ==================== System Prompt ====================

/**
 * System prompt for the investigation diagnosis LLM call.
 * Instructs the LLM to produce a structured diagnosis from verified evidence.
 */
export const INVESTIGATION_DIAGNOSIS_SYSTEM_PROMPT =
  `You are a senior SRE diagnosing a production issue based on evidence collected from an automated investigation pipeline. You provide structured, evidence-based diagnoses to help on-call engineers resolve incidents quickly.

## YOUR TASK

Analyze the provided investigation intent, gathered evidence, and correlation data to produce a structured diagnosis. Every claim you make must be directly supported by evidence provided to you.

## ABSOLUTE RULES

1. **CITE EVIDENCE**: Every factual claim in your diagnosis must reference at least one evidence ID from the provided evidence list. Include all referenced IDs in the "evidenceCited" array.
2. **NO FABRICATION**: Do not reference services, metrics, incidents, or analyses not present in the evidence. Do not invent evidence IDs.
3. **ACKNOWLEDGE GAPS**: If the evidence is insufficient to form a confident diagnosis, say so explicitly. Set a low confidence score and state what additional information would be needed.
4. **NO SPECULATION BEYOND EVIDENCE**: Your root cause hypothesis must be grounded in the evidence. If evidence only suggests symptoms without clear causation, frame it as a hypothesis, not a conclusion.
5. **ACTIONABLE SUGGESTIONS**: Every suggested action must be concrete enough for an on-call engineer to execute. Do not use vague phrases like "investigate further" or "look into it."
6. **STRUCTURED OUTPUT ONLY**: Respond with a single valid JSON object matching the schema below. No markdown, no explanation, no commentary outside the JSON. Do not wrap the JSON in code fences.

## EVIDENCE TYPES

Evidence items have an "id" field and a "source" field indicating where they came from:

- **past_incidents**: Previous incidents involving the same or related services. These show historical patterns and how similar issues were resolved.
- **ci_analyses**: CI/CD analysis results (build failures, test failures, deployment issues). These may reveal recent changes that could have caused the issue.
- **triage_results**: Previous automated triage results with severity scores and summaries. These provide context on how similar alerts were previously assessed.
- **datadog_metrics**: Time-series metric data from Datadog (CPU, memory, latency, error rates). These provide quantitative measurements of system behavior during the incident window.
- **datadog_events**: Datadog events and alerts (deployments, config changes, triggered monitors). These provide temporal markers that may correlate with the incident.
- **grafana_alerts**: Active Grafana alert rules and annotations. Firing alerts are strong signals of ongoing issues; annotations mark manual events or automated deployments.
- **prometheus_alerts**: Active Prometheus alerts and metric range data. Firing/pending alerts indicate threshold violations; metric ranges show system behavior trends during the incident window.
- **pagerduty_incidents**: Active PagerDuty incidents (triggered or acknowledged). These show what the on-call team is currently responding to and provide urgency/assignment context.
- **vercel_deployments**: Recent failed or errored Vercel deployments. These may indicate deployment-related root causes, especially for frontend or serverless issues.
- **netlify_deploys**: Recent failed Netlify deploys. These may indicate build failures or deployment issues for static sites and Jamstack applications.

## CORRELATION DATA

The correlation section provides cross-evidence analysis:
- **patterns**: Recurring patterns detected across evidence items
- **timelineEvents**: Chronologically ordered events from all sources
- **relatedServices**: Other services that appear across multiple evidence items
- **commonFactors**: Shared characteristics across evidence items (e.g., same error type, same deployment window)

## CONFIDENCE SCORING

Set the confidence score (0.0 to 1.0) based on evidence quality:
- 0.8-1.0: Strong evidence directly explains the root cause, multiple corroborating sources
- 0.6-0.79: Good evidence pointing to a likely cause, some corroboration
- 0.4-0.59: Moderate evidence, hypothesis is plausible but alternative explanations exist
- 0.2-0.39: Limited evidence, hypothesis is speculative
- 0.0-0.19: Insufficient evidence, diagnosis is mostly guesswork

## ACTION PRIORITY GUIDE

- **immediate**: Needs action within minutes. Examples: restart service, rollback deployment, scale up resources, follow runbook.
- **short_term**: Within hours or next business day. Examples: root cause analysis, deploy targeted fix, review monitoring thresholds.
- **long_term**: Systemic improvements. Examples: add load testing, improve observability, refactor error-prone code, create runbook.

## OUTPUT SCHEMA

{
  "summary": "string (1-2 sentence overview of the diagnosis)",
  "rootCauseHypothesis": "string (detailed hypothesis with evidence citations)",
  "confidence": 0.0,
  "suggestedActions": [
    {
      "action": "string (concrete action to take)",
      "reasoning": "string (why, citing evidence IDs)",
      "priority": "immediate | short_term | long_term"
    }
  ],
  "evidenceCited": ["string (evidence IDs referenced)"],
  "diagnosisSource": "ai"
}

## CONSTRAINTS

- suggestedActions: minimum 1, maximum 5, ordered by priority (immediate first)
- priority must be one of: "immediate", "short_term", "long_term"
- diagnosisSource must always be "ai"
- Every evidence ID in evidenceCited must appear in the provided evidence list
- No markdown formatting in any JSON field value (plain text only)
- summary: max 300 characters
- rootCauseHypothesis: max 1000 characters
- action text: max 300 characters
- reasoning text: max 500 characters` as const;

// ==================== Helpers ====================

const formatRelevance = (value: number): string => value.toFixed(2);

const isEmpty = (arr: readonly unknown[]): boolean => {
  const { length: count } = arr;
  return count === 0;
};

// ==================== Section Builders ====================

/**
 * Formats the investigation intent section for the diagnosis prompt.
 */
const formatIntentSection = (intent: InvestigationIntent): string => {
  const {
    serviceName,
    endpoint,
    symptom,
    environment,
    timeRangeFrom,
    timeRangeTo,
    confidenceScore,
  } = intent;

  return [
    `Service: ${serviceName ?? "unknown"}`,
    `Endpoint: ${endpoint ?? "not specified"}`,
    `Symptom: ${symptom}`,
    `Environment: ${environment ?? "unknown"}`,
    `Time Range: ${timeRangeFrom ?? "not specified"} to ${timeRangeTo ?? "now"}`,
    `Intent Confidence: ${formatRelevance(confidenceScore)}`,
  ].join("\n");
};

/**
 * Formats a single evidence item for the diagnosis prompt.
 */
const formatEvidenceItemEntry = (item: InvestigationEvidenceItem): string => {
  const { id, source, title, summary, relevance, timestamp } = item;
  const truncatedSummary = truncateText(summary, 300);

  return [
    `  ${id} [${source}] (relevance: ${formatRelevance(relevance)})`,
    `    Title: ${title}`,
    `    Summary: ${truncatedSummary}`,
    `    Timestamp: ${timestamp}`,
  ].join("\n");
};

/**
 * Formats the evidence list section.
 */
const formatEvidenceSection = (evidence: readonly InvestigationEvidenceItem[]): string =>
  isEmpty(evidence)
    ? "No evidence was gathered for this investigation."
    : evidence.map(formatEvidenceItemEntry).join("\n\n");

/**
 * Formats the correlation section for the diagnosis prompt.
 */
const formatCorrelationSection = (correlation: InvestigationCorrelation): string => {
  const { patterns, timelineEvents, relatedServices, commonFactors } = correlation;

  const patternsBlock = isEmpty(patterns)
    ? "Patterns: none detected"
    : ["Patterns:", ...patterns.map((pattern) => `  - ${pattern}`)].join("\n");

  const timelineBlock = isEmpty(timelineEvents)
    ? "Timeline: no events"
    : [
        "Timeline:",
        ...timelineEvents.map(
          (evt) =>
            `  - [${evt.timestamp}] ${evt.type}: ${truncateText(evt.description, 200)} (source: ${evt.sourceId})`
        ),
      ].join("\n");

  const servicesBlock = isEmpty(relatedServices)
    ? "Related Services: none"
    : `Related Services: ${relatedServices.join(", ")}`;

  const factorsBlock = isEmpty(commonFactors)
    ? "Common Factors: none"
    : ["Common Factors:", ...commonFactors.map((factor) => `  - ${factor}`)].join("\n");

  return [patternsBlock, "", timelineBlock, "", servicesBlock, "", factorsBlock].join("\n");
};

// ==================== Monitoring Evidence ====================

/**
 * Source types that come from external monitoring providers.
 */
const MONITORING_SOURCES: ReadonlySet<EvidenceSourceType> = new Set([
  "datadog_metrics",
  "datadog_events",
  "grafana_alerts",
  "prometheus_alerts",
  "pagerduty_incidents",
  "vercel_deployments",
  "netlify_deploys",
]) as ReadonlySet<EvidenceSourceType>;

/**
 * Partitions evidence into database-sourced and monitoring-sourced items.
 */
const partitionEvidence = (
  evidence: readonly InvestigationEvidenceItem[]
): {
  readonly dbEvidence: readonly InvestigationEvidenceItem[];
  readonly monitoringEvidence: readonly InvestigationEvidenceItem[];
} => ({
  dbEvidence: evidence.filter((item) => !MONITORING_SOURCES.has(item.source)),
  monitoringEvidence: evidence.filter((item) => MONITORING_SOURCES.has(item.source)),
});

/**
 * Formats the monitoring data section when monitoring evidence is present.
 * Returns empty string when no monitoring evidence exists.
 */
const formatMonitoringSection = (
  monitoringEvidence: readonly InvestigationEvidenceItem[]
): string =>
  isEmpty(monitoringEvidence)
    ? ""
    : [
        "",
        "## MONITORING DATA",
        "The following metrics, alerts, and events were gathered from external monitoring tools:",
        "",
        ...monitoringEvidence.map(formatEvidenceItemEntry),
      ].join("\n");

// ==================== Public API ====================

/**
 * Builds the user prompt for the investigation diagnosis LLM call.
 *
 * Pure function -- all data injected from the investigation pipeline outputs.
 *
 * @param intent - The parsed investigation intent
 * @param evidence - All gathered evidence items
 * @param correlation - Cross-evidence correlation data
 * @returns Formatted user prompt string
 */
export const buildDiagnosisUserPrompt = (
  intent: InvestigationIntent,
  evidence: readonly InvestigationEvidenceItem[],
  correlation: InvestigationCorrelation
): string => {
  const { dbEvidence, monitoringEvidence } = partitionEvidence(evidence);
  const monitoringSection = formatMonitoringSection(monitoringEvidence);

  return [
    "## INVESTIGATION INTENT",
    formatIntentSection(intent),
    "",
    "## GATHERED EVIDENCE",
    formatEvidenceSection(dbEvidence),
    monitoringSection,
    "",
    "## CORRELATION ANALYSIS",
    formatCorrelationSection(correlation),
    "",
    "Produce a structured diagnosis based ONLY on the evidence above. Cite evidence IDs for every claim.",
  ].join("\n");
};
