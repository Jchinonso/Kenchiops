/**
 * Safety analysis constants - patterns and rules for confidence scoring.
 */

import { UNCERTAINTY_PENALTIES } from "./confidence.js";
import type { UncertaintyPattern, RelevanceRule } from "./types.js";

export type { UncertaintyPattern, RelevanceRule, RiskLevel, RiskRuleCategory } from "./types.js";

/**
 * Compiled uncertainty patterns with penalties.
 * Ordered by severity (strongest first).
 */
export const UNCERTAINTY_PATTERNS: Readonly<UncertaintyPattern[]> = [
  {
    pattern:
      /\b(not sure|unclear|cannot determine|insufficient information|unable to identify|unknown)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.STRONG,
  },
  {
    pattern: /\b(possibly|might be|could be|may be|potentially|perhaps)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MODERATE,
  },
  {
    pattern: /\b(appears to|seems like|suggests that|probably)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MILD,
  },
] as const;

/**
 * Metric keywords to detect in reasoning.
 */
export const METRIC_KEYWORDS: Readonly<Set<string>> = new Set([
  "cpu",
  "memory",
  "error rate",
  "latency",
]);

/**
 * Invalid cause keywords that indicate an invalid root cause identification.
 */
export const INVALID_CAUSE_KEYWORDS: Readonly<Set<string>> = new Set(["unknown"]);

/**
 * Relevance rules for matching causes to actions.
 * Keywords are pre-normalized (lowercase) for efficient matching.
 * Expanded with synonyms to reduce false negatives.
 */
export const RELEVANCE_RULES: Readonly<RelevanceRule[]> = [
  {
    // Environment variable / secret issues
    causeKeywords: [
      "secret",
      "env",
      "environment",
      "variable",
      "credential",
      "token",
      "key",
      "auth",
    ],
    actionKeywords: ["environment", "secret", "variable", "credential", "config", "add", "set"],
  },
  {
    // Deployment / release issues
    causeKeywords: ["deploy", "deployment", "release", "version", "upgrade"],
    actionKeywords: ["rollback", "revert", "deploy", "redeploy", "release"],
  },
  {
    // Configuration issues
    causeKeywords: ["config", "configuration", "setting", "settings", "parameter"],
    actionKeywords: ["configuration", "config", "setting", "update", "fix", "correct"],
  },
  {
    // Test failures
    causeKeywords: ["test", "tests", "testing", "assertion", "spec", "unit", "integration"],
    actionKeywords: ["rerun", "test", "fix", "update", "retry"],
  },
  {
    // Pipeline / CI issues
    causeKeywords: ["pipeline", "ci", "build", "workflow", "job", "action"],
    actionKeywords: ["rerun", "pipeline", "rebuild", "retry", "trigger"],
  },
  {
    // Dependency issues
    causeKeywords: ["dependency", "dependencies", "package", "module", "library", "npm", "yarn"],
    actionKeywords: ["install", "update", "upgrade", "dependency", "package", "fix"],
  },
  {
    // Database / data issues
    causeKeywords: ["database", "db", "data", "migration", "schema", "query"],
    actionKeywords: ["migrate", "rollback", "fix", "update", "database", "query"],
  },
  {
    // Network / connectivity issues
    causeKeywords: ["network", "connection", "timeout", "dns", "connectivity", "socket"],
    actionKeywords: ["retry", "restart", "check", "network", "connection"],
  },
  {
    // Resource / capacity issues
    causeKeywords: ["memory", "cpu", "disk", "resource", "capacity", "limit", "quota"],
    actionKeywords: ["scale", "increase", "limit", "resource", "restart"],
  },
  {
    // Permission / access issues
    causeKeywords: ["permission", "access", "denied", "forbidden", "unauthorized", "role"],
    actionKeywords: ["permission", "access", "grant", "role", "fix"],
  },
] as const;

/**
 * Generic remediation actions that provide partial relevance credit.
 * These are common actions that may be relevant to many cause types.
 */
export const GENERIC_REMEDIATION_KEYWORDS: Readonly<string[]> = [
  "check",
  "logs",
  "investigate",
  "review",
  "restart",
  "notify",
  "escalate",
  "monitor",
] as const;

/**
 * Safety levels that allow auto-approval with high confidence.
 */
export const AUTO_APPROVABLE_SAFETY_LEVELS: Readonly<Set<string>> = new Set(["safe", "low_risk"]);

/**
 * Safety-related messages for action gating and validation.
 */
export const SAFETY_MESSAGES = {
  INVALID_ACTION: "Invalid action proposal. Manual review required.",
} as const;

// ==================== Audit Constants ====================

/**
 * Default limit for audit queries.
 */
export const AUDIT_DEFAULT_QUERY_LIMIT = 100;

/**
 * Maximum in-memory audit entries (for default store).
 */
export const AUDIT_MAX_IN_MEMORY_ENTRIES = 10000;

/**
 * Maximum patterns to include in injection detection summary.
 * Prevents huge log entries when many patterns are detected.
 */
export const AUDIT_MAX_PATTERNS_IN_SUMMARY = 5;

// ==================== Prompt Injection Constants ====================

/**
 * Risk thresholds for prompt injection detection.
 * Named as minimums for clarity: score >= threshold triggers that action.
 * Order: REVIEW_MIN < SANITIZE_MIN < BLOCK_MIN
 */
export const INJECTION_RISK_THRESHOLDS = {
  /** Minimum score to trigger review (flag for human review) */
  REVIEW_MIN: 0.2,
  /** Minimum score to trigger sanitization */
  SANITIZE_MIN: 0.5,
  /** Minimum score to block input entirely */
  BLOCK_MIN: 0.75,
} as const;

/**
 * Maximum weight contribution per pattern type to prevent score saturation.
 */
export const INJECTION_MAX_WEIGHT_PER_TYPE = 1.2;

/**
 * Weight multiplier for matches found in code fences.
 * Lower because these are often benign (pasted logs, code examples).
 */
export const INJECTION_CODE_FENCE_WEIGHT_MULTIPLIER = 0.3;

// ==================== Hallucination Detection Constants ====================

/**
 * Default threshold for marking content as likely hallucinated.
 */
export const HALLUCINATION_DEFAULT_THRESHOLD = 0.6;

/**
 * Patterns that indicate potential hallucinations.
 */
export const HALLUCINATION_PATTERNS = [
  {
    pattern: /\b(?:exactly|precisely)\s+\d+(?:\.\d+)?%/gi,
    type: "overly_precise" as const,
    weight: 0.3,
  },
  { pattern: /\b\d+\.\d{3,}%/g, type: "overly_precise" as const, weight: 0.25 },
  {
    pattern: /(?:studies?\s+(?:show|prove|confirm)|research\s+(?:indicates|suggests))\s+that/gi,
    type: "specific_claim_without_source" as const,
    weight: 0.2,
  },
  {
    pattern: /according\s+to\s+(?:experts?|scientists?|researchers?)\b/gi,
    type: "specific_claim_without_source" as const,
    weight: 0.15,
  },
  {
    pattern: /(?:said|stated|wrote|noted)\s*[,:]?\s*[""][^""]{50,}[""]/gi,
    type: "invented_quote" as const,
    weight: 0.35,
  },
  {
    pattern: /\b(?:definitely|certainly|absolutely|undoubtedly)\s+(?:will|would|is|are)\b/gi,
    type: "confident_uncertainty" as const,
    weight: 0.2,
  },
  {
    pattern:
      /(?:published\s+in|appeared\s+in)\s+(?:the\s+)?[A-Z][a-z]+\s+(?:Journal|Review|Quarterly)/gi,
    type: "nonexistent_reference" as const,
    weight: 0.25,
  },
] as const;

/**
 * Patterns for extracting factual claims from text.
 */
export const CLAIM_PATTERNS: readonly RegExp[] = [
  /[^.!?]*\b(?:is|are|was|were|has|have|had)\s+(?:a|an|the)?\s*[^.!?]+[.!?]/gi,
  /[^.!?]*\b(?:shows?|proves?|indicates?|suggests?|demonstrates?)\s+[^.!?]+[.!?]/gi,
  /[^.!?]*\b(?:caused?|results?\s+in|leads?\s+to)\s+[^.!?]+[.!?]/gi,
  /[^.!?]*\b(?:run|execute|use|install|configure|set|add|create|delete|remove)\s+[^.!?]+[.!?]/gi,
] as const;

/** Temporal pattern for detecting future years in past tense */
export const TEMPORAL_PATTERN = /in\s+(20\d{2})\s+(?:it\s+)?(?:was|had|became)/gi;

/** Confidence level thresholds for hallucination detection */
export const HALLUCINATION_CONFIDENCE_THRESHOLDS = { HIGH: 2, MEDIUM: 1 } as const;

/**
 * Weight factors for hallucination risk score calculation.
 */
export const HALLUCINATION_RISK_WEIGHTS = {
  /** Weight for pattern-based indicators */
  PATTERN_INDICATORS: 0.4,
  /** Weight for unverified claims */
  UNVERIFIED_CLAIMS: 0.35,
  /** Weight for text characteristics */
  TEXT_CHARACTERISTICS: 0.25,
} as const;

// ==================== Risk Scoring Constants ====================

/**
 * Weight factors for action risk score calculation.
 */
export const ACTION_RISK_WEIGHTS = {
  BLAST_RADIUS: 0.35,
  REVERSIBILITY: 0.4,
  DATA_IMPACT: 0.25,
} as const;

/**
 * Numeric scores for blast radius levels.
 */
export const BLAST_RADIUS_SCORES = {
  single_service: 0.2,
  multiple_services: 0.6,
  infrastructure: 1.0,
} as const;

/**
 * Numeric scores for reversibility levels.
 */
export const REVERSIBILITY_SCORES = {
  instant: 0.1,
  minutes: 0.4,
  manual_only: 0.7,
  irreversible: 1.0,
} as const;

/**
 * Numeric scores for data impact levels.
 */
export const DATA_IMPACT_SCORES = {
  none: 0.0,
  read_only: 0.2,
  write: 0.6,
  destructive: 1.0,
} as const;

/**
 * Default risk assessment for unknown action types.
 */
export const DEFAULT_ACTION_RISK = {
  blastRadius: "single_service",
  reversibility: "minutes",
  dataImpact: "write",
} as const;

/**
 * Risk level thresholds for categorization.
 * Aligned with gating thresholds for consistency.
 */
export const RISK_LEVEL_THRESHOLDS = {
  /** Below this is "low" risk */
  LOW: 0.3,
  /** Below this is "moderate" risk */
  MODERATE: 0.5,
  /** Below this is "high" risk, at or above is "critical" */
  HIGH: 0.7,
} as const;

// ==================== Context Multipliers ====================

/**
 * Default multipliers for context-aware risk scoring.
 * Applied when custom rules don't specify custom multipliers.
 */
export const CONTEXT_MULTIPLIERS = {
  /** Multiplier for production environment actions */
  PRODUCTION: 1.3,
  /** Multiplier when incident mode is active */
  INCIDENT_MODE: 1.5,
  /** Multiplier during off-hours (weekends, nights) */
  OFF_HOURS: 1.2,
} as const;

/**
 * Off-hours detection configuration.
 * Uses UTC to ensure consistent behavior across timezones.
 *
 * NOTE: Off-hours are currently evaluated in UTC. Tenant-local business
 * hours are a planned enhancement. Until then, tenants in different
 * timezones may experience incorrect off-hours classification.
 */
export const OFF_HOURS_CONFIG = {
  /** Start of night hours (UTC) */
  NIGHT_START_HOUR: 22,
  /** End of night hours (UTC) */
  NIGHT_END_HOUR: 6,
  /** Weekend days (0 = Sunday, 6 = Saturday) */
  WEEKEND_DAYS: [0, 6] as readonly number[],
} as const;

// ==================== Platform Baseline Thresholds ====================

/**
 * Platform baseline thresholds representing maximum leniency.
 * Tenants can only move thresholds DOWN (more strict), never UP (more lenient).
 *
 * These are CEILINGS on leniency, not floors on strictness.
 * A tenant rule with blockThreshold: 0.95 would be clamped to 0.9.
 *
 * Enforcement: effectiveThreshold = min(rule ?? 1.0, platformMax)
 */
export const PLATFORM_THRESHOLDS = {
  /** Maximum block threshold allowed - rules cannot be more lenient than this */
  MAX_BLOCK_THRESHOLD: 0.9,
  /** Maximum approval threshold allowed - rules cannot be more lenient than this */
  MAX_APPROVAL_THRESHOLD: 0.5,
} as const;

/**
 * Guard rail for context multiplier products.
 * Prevents extreme multiplier combinations from always saturating to 1.0.
 *
 * Example: Without guard rail, production(1.3) × incident(1.5) × offHours(1.2) = 2.34x
 * A base score of 0.5 would become 1.17, clamped to 1.0.
 * With guard rail at 3.0, the multiplier is capped first.
 */
export const CONTEXT_MULTIPLIER_BOUNDS = {
  /** Minimum multiplier (no context should reduce risk) */
  MIN: 1.0,
  /** Maximum multiplier (prevents saturation) */
  MAX: 3.0,
} as const;

/**
 * Risk scoring version for audit traceability.
 * Increment when scoring logic changes materially.
 */
export const RISK_SCORING_VERSION = "risk_v1" as const;
