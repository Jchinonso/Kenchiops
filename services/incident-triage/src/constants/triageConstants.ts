/**
 * Triage Constants
 *
 * Configuration constants for deduplication, severity classification,
 * and the triage worker polling loop.
 */

import type {
  SeverityConfig,
  KeywordPattern,
  SeverityThreshold,
  ServiceTier,
} from "../types/severityTypes.js";
import type { ConfidenceWeights, CompletenessFieldConfig } from "../types/evidenceTypes.js";

// ==================== Deduplication ====================

/** Default dedup window in minutes. Alerts with the same fingerprint within this window are merged. */
export const DEDUP_WINDOW_MINUTES = 30;

// ==================== Severity Weights ====================

/**
 * Maximum score contribution per severity factor.
 * All weights sum to 100 (the max total score).
 */
export const SEVERITY_WEIGHTS = {
  SOURCE_SEVERITY: 25,
  SERVICE_CRITICALITY: 25,
  ENVIRONMENT: 20,
  KEYWORD_PATTERNS: 15,
  TIME_OF_DAY: 10,
  METRICS_BREACH: 5,
} as const;

// ==================== Source Severity Mapping ====================

/**
 * Maps source-reported severity/urgency to a base score (0-100 scale).
 * Normalized across providers (PagerDuty urgency, Datadog priority, etc.).
 */
export const SOURCE_SEVERITY_MAP: Readonly<Record<string, number>> = {
  critical: 90,
  high: 70,
  medium: 50,
  low: 30,
  info: 10,
  // PagerDuty urgency variants
  urgent: 90,
  warning: 50,
} as const;

// ==================== Service Tiers ====================

/**
 * Score contribution per service criticality tier.
 */
export const SERVICE_TIER_SCORES: Readonly<Record<ServiceTier | "unknown", number>> = {
  tier1: 25,
  tier2: 20,
  tier3: 15,
  tier4: 10,
  unknown: 5,
} as const;

/**
 * Service name to tier mapping.
 * Initially empty -- populated by tenant configuration.
 * Service names are matched case-insensitively.
 */
export const DEFAULT_SERVICE_TIERS: Readonly<Record<string, ServiceTier>> = {} as const;

// ==================== Environment Scores ====================

/**
 * Score contribution per environment.
 * Production gets the highest score since production alerts are most concerning.
 */
export const ENVIRONMENT_SCORES: Readonly<Record<string, number>> = {
  production: 20,
  prod: 20,
  staging: 10,
  stage: 10,
  development: 5,
  dev: 5,
} as const;

/** Score for environments not in the lookup table. */
export const UNKNOWN_ENVIRONMENT_SCORE = 8;

// ==================== Keyword Patterns ====================

/**
 * Keyword patterns that boost severity when found in alert title or description.
 * Matched case-insensitively. Highest boost returned when multiple match.
 */
export const KEYWORD_PATTERNS: readonly KeywordPattern[] = [
  { pattern: /\boutage\b/i, boost: 15, label: "outage" },
  { pattern: /\bdown\b/i, boost: 12, label: "down" },
  { pattern: /\btimeout\b/i, boost: 10, label: "timeout" },
  { pattern: /\blatency\b/i, boost: 8, label: "latency" },
  { pattern: /\berror\b/i, boost: 6, label: "error" },
  { pattern: /\bwarning\b/i, boost: 3, label: "warning" },
  { pattern: /\bcircuit.?breaker\b/i, boost: 12, label: "circuit breaker" },
  { pattern: /\bOOM\b|out.?of.?memory/i, boost: 14, label: "OOM" },
  { pattern: /\bcrash\b/i, boost: 13, label: "crash" },
  { pattern: /\bdisk.?full\b|disk.?space/i, boost: 11, label: "disk space" },
  { pattern: /\bcertificate\b.*\bexpir/i, boost: 10, label: "certificate expiry" },
  { pattern: /\bdata.?loss\b/i, boost: 15, label: "data loss" },
  { pattern: /\bunreachable\b/i, boost: 13, label: "unreachable" },
] as const;

// ==================== Severity Thresholds ====================

/**
 * Score-to-label mapping. Evaluated in descending order; first match wins.
 */
export const SEVERITY_THRESHOLDS: readonly SeverityThreshold[] = [
  { minScore: 85, label: "critical" },
  { minScore: 65, label: "high" },
  { minScore: 40, label: "medium" },
  { minScore: 20, label: "low" },
  { minScore: 0, label: "info" },
] as const;

// ==================== Time-of-Day Scoring ====================

/** Start of business hours (UTC), inclusive. */
export const BUSINESS_HOURS_START_UTC = 9;

/** End of business hours (UTC), exclusive. */
export const BUSINESS_HOURS_END_UTC = 17;

/** Score during business hours (less concerning -- people are available). */
export const BUSINESS_HOURS_SCORE = 5;

/** Score during off-hours (more concerning -- less coverage). */
export const OFF_HOURS_SCORE = 10;

// ==================== Metrics Breach ====================

/** Score when alert includes metrics that breach a threshold. */
export const METRICS_BREACH_SCORE = 5;

/** Score when no metrics breach is detected. */
export const METRICS_NO_BREACH_SCORE = 0;

// ==================== Worker Defaults ====================

/**
 * Triage worker polling loop configuration.
 */
export const TRIAGE_WORKER_DEFAULTS = {
  /** Delay between poll cycles when no messages found (ms) */
  POLL_INTERVAL_MS: 2000,
  /** Delay between processing cycles (ms) */
  PROCESS_DELAY_MS: 100,
  /** Maximum concurrent jobs to process */
  MAX_CONCURRENT: 3,
} as const;

// ==================== Default Config ====================

/**
 * Default severity configuration. Assembled from the constants above.
 */
export const DEFAULT_SEVERITY_CONFIG: SeverityConfig = {
  serviceTiers: DEFAULT_SERVICE_TIERS,
  environmentScores: ENVIRONMENT_SCORES,
  keywordPatterns: KEYWORD_PATTERNS,
  sourceSeverityMap: SOURCE_SEVERITY_MAP,
  severityThresholds: SEVERITY_THRESHOLDS,
} as const;

// ==================== Runbook Matching ====================

/**
 * Defaults for runbook matching via vector similarity search.
 */
export const RUNBOOK_MATCH_DEFAULTS = {
  /** Maximum number of runbook matches to return */
  MAX_RESULTS: 5,
  /** Minimum cosine similarity threshold for a match */
  MIN_SIMILARITY: 0.65,
} as const;

// ==================== Incident Correlation ====================

/**
 * Defaults for incident correlation via vector similarity search.
 */
export const CORRELATION_DEFAULTS = {
  /** Maximum number of correlated incidents to return */
  MAX_RESULTS: 10,
  /** Minimum cosine similarity for "same root cause" classification */
  SAME_ROOT_CAUSE_THRESHOLD: 0.92,
  /** Minimum cosine similarity for "similar symptoms" classification */
  SIMILAR_SYMPTOMS_THRESHOLD: 0.75,
  /** Minimum cosine similarity to be included at all */
  MIN_SIMILARITY: 0.6,
} as const;

// ==================== Confidence Scoring ====================

/**
 * Weights for confidence signals. Must sum to 1.0.
 * Higher weight = more impact on confidence when present/absent.
 */
export const CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  has_metrics: 0.2,
  has_runbook: 0.2,
  has_similar_incident: 0.15,
  service_known: 0.15,
  environment_known: 0.1,
  has_description: 0.1,
  has_labels: 0.1,
} as const;

// ==================== Completeness Scoring ====================

/**
 * Field categorization for completeness scoring.
 * - required: must-have fields (weighted 3x)
 * - expected: should-have fields (weighted 2x)
 * - optional: nice-to-have fields (weighted 1x)
 */
export const COMPLETENESS_FIELDS: CompletenessFieldConfig = {
  required: ["title", "source", "severity", "fingerprint"],
  expected: ["serviceName", "environment", "description"],
  optional: ["metrics", "labels", "runbooks", "correlatedIncidents"],
} as const;
