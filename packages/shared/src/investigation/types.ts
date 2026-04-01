/**
 * Investigation Types
 *
 * Type definitions for the interactive investigation feature.
 * Covers intent parsing, evidence gathering, correlation,
 * diagnosis, port interfaces, and LLM completion.
 *
 * @module investigation/types
 */

import type { RequestContext } from "../core/types.js";

// ==================== Investigation Symptom ====================

/**
 * Recognized symptom categories for investigation intent parsing.
 */
export type InvestigationSymptom =
  | "slow_response"
  | "errors"
  | "downtime"
  | "high_latency"
  | "memory_leak"
  | "cpu_spike"
  | "deployment_failure"
  | "data_inconsistency"
  | "unknown";

// ==================== Investigation Intent ====================

/**
 * Structured intent extracted from a natural-language investigation request.
 * Produced by LLM intent parsing.
 */
export interface InvestigationIntent {
  readonly serviceName: string | null;
  readonly endpoint: string | null;
  readonly symptom: InvestigationSymptom;
  readonly environment: string | null;
  readonly timeRangeFrom: string | null;
  readonly timeRangeTo: string | null;
  readonly confidenceScore: number;
}

// ==================== Evidence ====================

/**
 * Discriminator for the source of an investigation evidence item.
 */
export type EvidenceSourceType =
  | "past_incidents"
  | "ci_analyses"
  | "triage_results"
  | "datadog_metrics"
  | "datadog_events"
  | "grafana_alerts"
  | "prometheus_alerts"
  | "pagerduty_incidents"
  | "vercel_deployments"
  | "netlify_deploys";

/**
 * A single piece of evidence gathered during investigation.
 */
export interface InvestigationEvidenceItem {
  readonly id: string;
  readonly source: EvidenceSourceType;
  readonly title: string;
  readonly summary: string;
  readonly relevance: number;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ==================== Correlation ====================

/**
 * A single event on the investigation timeline.
 */
export interface TimelineEvent {
  readonly timestamp: string;
  readonly type: string;
  readonly description: string;
  readonly sourceId: string;
}

/**
 * Correlation result from cross-referencing gathered evidence.
 */
export interface InvestigationCorrelation {
  readonly patterns: readonly string[];
  readonly timelineEvents: readonly TimelineEvent[];
  readonly relatedServices: readonly string[];
  readonly commonFactors: readonly string[];
}

// ==================== Diagnosis ====================

/**
 * An individual recommended action from the diagnosis.
 */
export interface SuggestedInvestigationAction {
  readonly action: string;
  readonly reasoning: string;
  readonly priority: "immediate" | "short_term" | "long_term";
}

/**
 * Complete diagnosis produced by the investigation pipeline.
 */
export interface InvestigationDiagnosis {
  readonly summary: string;
  readonly rootCauseHypothesis: string;
  readonly confidence: number;
  readonly suggestedActions: readonly SuggestedInvestigationAction[];
  readonly evidenceCited: readonly string[];
  readonly diagnosisSource: "ai" | "fallback";
}

// ==================== Port Interfaces ====================

/**
 * Port for searching historical data across incident, CI, and triage sources.
 * Decouples the investigation service from concrete repository implementations.
 */
export interface InvestigationSearchPort {
  readonly searchRecentIncidents: (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;

  readonly searchRecentAnalyses: (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;

  readonly searchRecentTriageResults: (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;
}

// ==================== Service Interface ====================

/**
 * Public interface for the investigation service.
 */
export interface InvestigationService {
  readonly parseIntent: (
    description: string,
    context: RequestContext
  ) => Promise<InvestigationIntent>;

  readonly gatherEvidence: (
    intent: InvestigationIntent,
    tenantId: string,
    context: RequestContext
  ) => Promise<readonly InvestigationEvidenceItem[]>;

  readonly correlateEvidence: (
    evidence: readonly InvestigationEvidenceItem[],
    intent: InvestigationIntent,
    context: RequestContext
  ) => Promise<InvestigationCorrelation>;

  readonly diagnose: (
    intent: InvestigationIntent,
    evidence: readonly InvestigationEvidenceItem[],
    correlation: InvestigationCorrelation,
    context: RequestContext
  ) => Promise<InvestigationDiagnosis>;
}

// ==================== LLM Completion Port ====================

/**
 * Options for an LLM completion call.
 */
export interface LLMCompletionOptions {
  readonly model: string;
  readonly timeoutMs: number;
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Descriptive operation name for observability logs (e.g., "parseIntent", "generateDiagnosis") */
  readonly operationName?: string;
}

/**
 * Port interface for LLM text completion.
 * Keeps the OpenAI SDK out of the service layer.
 */
export interface LLMCompletionPort {
  readonly complete: (
    systemPrompt: string,
    userPrompt: string,
    options: LLMCompletionOptions,
    context: RequestContext
  ) => Promise<string>;
}

// ==================== Service Options ====================

/**
 * Options for configuring the investigation service factory.
 */
export interface InvestigationServiceOptions {
  readonly llmModel?: string;
}

// ==================== Constants ====================

/**
 * Timeout for investigation LLM calls (intent parsing + diagnosis).
 */
export const INVESTIGATION_LLM_TIMEOUT_MS = 45000;
