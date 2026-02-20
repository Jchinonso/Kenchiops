/**
 * Investigation Constants
 *
 * Default configuration for the investigation pipeline.
 *
 * @module constants/investigationConstants
 */

import type { InvestigationSymptom } from "../types/investigationTypes.js";

// ==================== Evidence Gathering ====================

/**
 * Default configuration for the investigation pipeline.
 */
export const INVESTIGATION_DEFAULTS = {
  /** Default lookback window for evidence gathering (hours) */
  EVIDENCE_LOOKBACK_HOURS: 72,
  /** Maximum number of evidence items returned from gatherEvidence */
  MAX_EVIDENCE_ITEMS: 20,
  /** Default per-source query limit for evidence searches */
  PER_SOURCE_LIMIT: 25,
} as const;

// ==================== Pattern Detection ====================

/**
 * Thresholds for deterministic pattern detection in correlateEvidence.
 */
export const INVESTIGATION_PATTERN_THRESHOLDS = {
  /** Minimum occurrences of the same service to detect "recurring_service" */
  RECURRING_SERVICE_MIN: 3,
  /** Minimum recent items to detect "recent_failures" */
  RECENT_FAILURES_MIN: 3,
  /** Hours threshold for "recent" classification in pattern detection */
  RECENT_HOURS: 24,
  /** Minimum distinct services to detect "cross_service" */
  CROSS_SERVICE_MIN: 3,
} as const;

// ==================== Relevance Scoring ====================

/**
 * Default relevance scores for evidence items by source.
 */
export const INVESTIGATION_RELEVANCE = {
  /** Base relevance for incident evidence */
  INCIDENT_BASE: 0.7,
  /** Boosted relevance when service name matches */
  INCIDENT_SERVICE_MATCH: 0.9,
  /** Base relevance for CI analysis evidence */
  ANALYSIS_BASE: 0.6,
  /** Boosted relevance when analysis matches service */
  ANALYSIS_SERVICE_MATCH: 0.85,
  /** Base relevance for triage result evidence */
  TRIAGE_BASE: 0.65,
  /** Boosted relevance when triage matches service */
  TRIAGE_SERVICE_MATCH: 0.88,
} as const;

// ==================== Symptom Validation ====================

/**
 * All valid investigation symptom values.
 */
export const VALID_SYMPTOMS: readonly InvestigationSymptom[] = [
  "slow_response",
  "errors",
  "downtime",
  "high_latency",
  "memory_leak",
  "cpu_spike",
  "deployment_failure",
  "data_inconsistency",
  "unknown",
] as const;

// ==================== Fallback Diagnosis ====================

/**
 * Generic suggested actions by symptom type for fallback diagnosis.
 */
export const FALLBACK_ACTIONS_BY_SYMPTOM: Readonly<
  Record<InvestigationSymptom, readonly string[]>
> = {
  slow_response: [
    "Check application response time metrics and identify slow endpoints",
    "Review recent deployments for performance regressions",
    "Inspect database query performance and connection pool utilization",
  ],
  errors: [
    "Review application error logs for stack traces and error patterns",
    "Check error rate dashboards for affected endpoints",
    "Verify external service dependencies are healthy",
  ],
  downtime: [
    "Verify service health endpoints and container status",
    "Check infrastructure metrics (CPU, memory, disk) for resource exhaustion",
    "Review load balancer and DNS configuration",
  ],
  high_latency: [
    "Inspect network latency between service tiers",
    "Check database and cache response times",
    "Review message queue depths and consumer lag",
  ],
  memory_leak: [
    "Capture and analyze heap dumps from affected instances",
    "Review memory usage trends over the past 24 hours",
    "Check for known memory leak patterns in recent code changes",
  ],
  cpu_spike: [
    "Identify top CPU-consuming processes on affected hosts",
    "Check for runaway threads or infinite loops in application code",
    "Review auto-scaling configuration and current instance count",
  ],
  deployment_failure: [
    "Review CI/CD pipeline logs for the failing deployment",
    "Check for configuration drift between environments",
    "Verify container image builds and artifact registry availability",
  ],
  data_inconsistency: [
    "Check database replication lag and synchronization status",
    "Review recent data migration or schema change operations",
    "Audit write operations for race conditions or missing transactions",
  ],
  unknown: [
    "Gather more information about the specific symptoms observed",
    "Check overall service health dashboards for anomalies",
    "Review recent change logs and deployment history",
  ],
} as const;

/** Fallback diagnosis confidence (low, since template-based) */
export const FALLBACK_DIAGNOSIS_CONFIDENCE = 0.2;

// ==================== Common Factor Extraction ====================

/**
 * Configuration for extracting common keywords across evidence summaries.
 */
export const COMMON_FACTOR_CONFIG = {
  /** Minimum word length to consider for common factors */
  MIN_WORD_LENGTH: 4,
  /** Minimum occurrences across evidence items for a word to be "common" */
  MIN_OCCURRENCES: 2,
  /** Maximum number of common factors to return */
  MAX_FACTORS: 10,
} as const;
