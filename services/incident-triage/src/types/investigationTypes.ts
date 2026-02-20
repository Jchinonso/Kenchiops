/**
 * Investigation Types
 *
 * Type definitions for the interactive investigation feature.
 * Covers intent parsing, evidence gathering, correlation,
 * diagnosis, port interfaces, and worker control.
 *
 * @module types/investigationTypes
 */

import type { RequestContext } from "@kenchi/shared";

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
    limit: number
  ) => Promise<readonly InvestigationEvidenceItem[]>;

  readonly searchRecentAnalyses: (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number
  ) => Promise<readonly InvestigationEvidenceItem[]>;

  readonly searchRecentTriageResults: (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number
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

// ==================== Worker Types ====================

/**
 * Internal mutable state for the investigation worker.
 * Uses mutable fields since these are modified during the polling loop.
 */
export interface InvestigationWorkerState {
  running: boolean; // Mutable: toggled by stop()
  totalProcessed: number; // Mutable: incremented per job
  totalErrors: number; // Mutable: incremented per error
}

/**
 * Statistics snapshot returned by the investigation worker control interface.
 */
export interface InvestigationWorkerStats {
  readonly totalProcessed: number;
  readonly totalErrors: number;
  readonly isRunning: boolean;
}

/**
 * Control interface for the investigation worker.
 */
export interface InvestigationWorkerControl {
  readonly stop: () => void;
  readonly getStats: () => InvestigationWorkerStats;
}

// ==================== Queue Payload Types ====================

/**
 * Queue message payload shape for investigation jobs.
 */
export interface InvestigationQueuePayload {
  readonly investigationId: string;
  readonly tenantId: string;
  readonly initiatedBy: string;
}

// ==================== Constants ====================

/**
 * Default configuration for the investigation worker.
 */
export const INVESTIGATION_WORKER_DEFAULTS = {
  POLL_INTERVAL_MS: 2000,
} as const;

/**
 * Timeout for investigation LLM calls (intent parsing + diagnosis).
 */
export const INVESTIGATION_LLM_TIMEOUT_MS = 45000;
