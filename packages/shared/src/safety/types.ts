/**
 * Safety Module Types
 *
 * Consolidated type definitions for AI/LLM output validation, confidence scoring,
 * risk assessment, sanitization, injection detection, restrictions, and auditing.
 *
 * @module safety/types
 */

import type { ConfidenceRange } from "../constants/index.js";

// ==================== Gating Types ====================

/**
 * Gating decision for action execution.
 * - "auto_approve": High confidence + safe action, execute automatically
 * - "require_approval": Needs human review before execution
 * - "block": Too risky or low confidence, do not execute
 */
export type GatingDecision = "auto_approve" | "require_approval" | "block";

/**
 * Result of action gating evaluation.
 *
 * Semantic states:
 * - block:            requiresApproval=false, canExecute=false
 * - require_approval: requiresApproval=true,  canExecute=true
 * - auto_approve:     requiresApproval=false, canExecute=true
 */
export interface ActionGatingResult {
  /**
   * Whether human approval is required before execution.
   * False when blocked (approval can't help) or auto-approved.
   */
  readonly requiresApproval: boolean;
  /**
   * Whether the action is permitted to execute at all.
   * False only when blocked due to very low confidence or invalid action.
   */
  readonly canExecute: boolean;
  /** Human-readable explanation of the gating decision */
  readonly message: string;
}

/**
 * Threshold entry for confidence range lookup.
 */
export interface ThresholdEntry {
  /** Score threshold value */
  readonly threshold: number;
  /** Confidence range category */
  readonly range: ConfidenceRange;
}

// ==================== Validation Check Types ====================

/**
 * Alignment check configuration for evidence validation.
 */
export interface AlignmentCheck {
  /** Condition function that checks alignment */
  readonly condition: (analysis: LLMAnalysisLike, evidence: EvidenceLike) => boolean;
  /** Score adjustment when condition is met */
  readonly adjustment: number;
}

/**
 * Completeness check configuration for analysis validation.
 */
export interface CompletenessCheck {
  /** Condition function that checks completeness */
  readonly condition: (analysis: LLMAnalysisLike) => boolean;
  /** Score adjustment when condition is met */
  readonly adjustment: number;
}

// ==================== Minimal Type Interfaces ====================
// These allow the safety module to work with partial data

/**
 * Minimal LLM analysis interface for safety checks.
 * Allows checking incomplete or partial analysis results.
 */
export interface LLMAnalysisLike {
  readonly confidence?: string;
  readonly summary?: string;
  readonly reasoning?: string;
  readonly identifiedCause?: string;
  readonly impactAssessment?: unknown;
  readonly uncertainties?: readonly string[];
  readonly relatedIncidents?: readonly string[];
  readonly recommendedActions?: ReadonlyArray<{
    readonly description: string;
    readonly actionType: string;
  }>;
}

/**
 * Minimal evidence interface for safety checks.
 */
export interface EvidenceLike {
  readonly eventId: string;
  readonly collectedAt?: string;
  readonly logs?: ReadonlyArray<{ readonly message: string }>;
  readonly gitHistory?: ReadonlyArray<{ readonly sha: string }>;
  readonly metrics?: { readonly summary?: unknown };
  readonly relatedDocs?: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly similarity: number;
  }>;
}

// ==================== Risk Scoring Types ====================

/**
 * Blast radius of an action - how many systems/services are affected.
 */
export type BlastRadius = "single_service" | "multiple_services" | "infrastructure";

/**
 * How easily an action can be reversed.
 */
export type Reversibility = "instant" | "minutes" | "manual_only" | "irreversible";

/**
 * Impact on data.
 */
export type DataImpact = "none" | "read_only" | "write" | "destructive";

/**
 * Complete risk assessment for an action.
 */
export interface ActionRiskScore {
  /** How many systems are affected */
  readonly blastRadius: BlastRadius;
  /** How easily the action can be undone */
  readonly reversibility: Reversibility;
  /** Impact on data */
  readonly dataImpact: DataImpact;
  /** Composite risk score (0-1, higher = more risky) */
  readonly score: number;
  /** Human-readable risk summary */
  readonly summary: string;
}

/**
 * Configuration for risk assessment rules.
 */
export interface RiskAssessmentRule {
  /** Action types that match this rule */
  readonly actionTypes: ReadonlySet<string>;
  /** Default blast radius for these actions */
  readonly blastRadius: BlastRadius;
  /** Default reversibility for these actions */
  readonly reversibility: Reversibility;
  /** Default data impact for these actions */
  readonly dataImpact: DataImpact;
}

// ==================== Sanitization Types ====================

/**
 * Result of sanitization operation.
 */
export interface OutputSanitizationResult {
  /** Sanitized output */
  readonly sanitized: string;
  /** Whether any modifications were made */
  readonly wasModified: boolean;
  /** Types of sanitization applied */
  readonly appliedRules: readonly string[];
  /** Warnings about potentially dangerous content */
  readonly warnings: readonly string[];
}

/**
 * Result of command validation.
 */
export interface CommandValidationResult {
  /** Whether the command is safe to execute */
  readonly isSafe: boolean;
  /** Detected dangerous patterns */
  readonly risks: readonly string[];
  /** Suggested safer alternative (if applicable) */
  readonly alternative?: string;
}

// ==================== Hallucination Detection Types ====================

/**
 * Types of hallucination indicators.
 */
export type HallucinationIndicatorType =
  | "fabricated_statistic"
  | "specific_claim_without_source"
  | "overly_precise"
  | "contradiction"
  | "temporal_impossibility"
  | "nonexistent_reference"
  | "confident_uncertainty"
  | "invented_quote";

/**
 * A specific hallucination indicator found in text.
 */
export interface HallucinationIndicator {
  /** Type of indicator */
  readonly type: HallucinationIndicatorType;
  /** Text that triggered this indicator */
  readonly matchedText: string;
  /** Weight contribution to risk score */
  readonly weight: number;
}

/**
 * Result of hallucination detection analysis.
 */
export interface HallucinationCheckResult {
  /** Overall hallucination risk score (0-1, higher = more likely hallucinated) */
  readonly riskScore: number;
  /** Whether content is likely hallucinated (score >= threshold) */
  readonly isLikelyHallucinated: boolean;
  /** Specific indicators detected */
  readonly indicators: readonly HallucinationIndicator[];
  /** Claims that could not be verified against evidence */
  readonly unverifiedClaims: readonly string[];
  /** Confidence in the detection result */
  readonly detectionConfidence: "high" | "medium" | "low";
}

// ==================== Prompt Injection Types ====================

/**
 * Types of prompt injection patterns.
 */
export type InjectionPatternType =
  | "instruction_override"
  | "role_hijacking"
  | "delimiter_escape"
  | "encoded_payload"
  | "jailbreak_attempt"
  | "system_prompt_leak"
  | "recursive_injection"
  | "context_manipulation";

/**
 * Recommended action after injection detection.
 */
export type InjectionRecommendation = "allow" | "sanitize" | "block" | "review";

/**
 * A specific injection pattern match.
 */
export interface InjectionMatch {
  /** Type of pattern */
  readonly type: InjectionPatternType;
  /** Matched text (truncated for safety) */
  readonly matchedText: string;
  /** Severity of this match */
  readonly severity: "low" | "medium" | "high" | "critical";
}

/**
 * Result of prompt injection detection.
 */
export interface InjectionDetectionResult {
  /** Whether injection was detected */
  readonly isInjection: boolean;
  /** Risk score (0-1, higher = more likely injection) */
  readonly riskScore: number;
  /** Types of injection patterns detected */
  readonly detectedPatterns: readonly InjectionPatternType[];
  /** Specific matches found */
  readonly matches: readonly InjectionMatch[];
  /** Recommended action */
  readonly recommendation: InjectionRecommendation;
}

// ==================== Restriction Types ====================

/**
 * Types of restrictions.
 */
export type RestrictionType =
  | "maintenance_window"
  | "freeze_period"
  | "incident_mode"
  | "off_hours"
  | "rate_limit"
  | "manual_override";

/**
 * Schedule configuration for time-based restrictions.
 */
export interface ScheduleConfig {
  /** Days of week (0 = Sunday, 6 = Saturday) */
  readonly daysOfWeek?: readonly number[];
  /** Start hour (0-23) in UTC */
  readonly startHour: number;
  /** End hour (0-23) in UTC */
  readonly endHour: number;
  /** Timezone override (default: UTC) */
  readonly timezone?: string;
}

/**
 * Restriction rule configuration.
 */
export interface RestrictionRule {
  /** Unique identifier */
  readonly id: string;
  /** Type of restriction */
  readonly type: RestrictionType;
  /** Human-readable name */
  readonly name: string;
  /** Whether this rule is currently enabled */
  readonly enabled: boolean;
  /** Schedule configuration (if time-based) */
  readonly schedule?: ScheduleConfig;
  /** Action types this restriction applies to (empty = all) */
  readonly affectedActions: readonly string[];
}

/**
 * An active restriction.
 */
export interface ActiveRestriction {
  /** Type of restriction */
  readonly type: RestrictionType;
  /** Name/description of the restriction */
  readonly name: string;
  /** When it started */
  readonly startedAt: Date;
  /** When it ends (undefined = indefinite) */
  readonly endsAt?: Date;
}

/**
 * Context for checking restrictions.
 */
export interface RestrictionContext {
  /** Current timestamp (for testing, defaults to now) */
  readonly now?: Date;
  /** Action type being checked */
  readonly actionType?: string;
  /** Whether to ignore certain restriction types */
  readonly ignoreTypes?: readonly RestrictionType[];
}

/**
 * Result of restriction check.
 */
export interface RestrictionCheckResult {
  /** Whether the action is allowed */
  readonly isAllowed: boolean;
  /** Active restrictions that apply */
  readonly activeRestrictions: readonly ActiveRestriction[];
  /** When restrictions will lift (if applicable) */
  readonly restrictedUntil?: Date;
  /** Human-readable explanation */
  readonly reason: string;
}

// ==================== Audit Types ====================

/**
 * Types of safety events.
 */
export type SafetyEventType =
  | "action_proposed"
  | "action_approved"
  | "action_blocked"
  | "action_executed"
  | "confidence_check"
  | "injection_detected"
  | "hallucination_detected"
  | "restriction_applied"
  | "restriction_overridden"
  | "sanitization_applied"
  | "risk_assessment";

/**
 * Audit entry severity levels.
 */
export type AuditSeverity = "info" | "warning" | "error" | "critical";

/**
 * Decision recorded in audit.
 */
export type AuditDecision =
  | "allowed"
  | "blocked"
  | "requires_approval"
  | "auto_approved"
  | "sanitized"
  | "flagged";

/**
 * Minimal request context for audit entries.
 */
export interface SafetyRequestContext {
  readonly requestId: string;
  readonly tenantId: string;
  readonly actor?: string;
}

/**
 * A safety audit entry.
 */
export interface SafetyAuditEntry {
  /** Unique identifier */
  readonly id: string;
  /** When the entry was created */
  readonly timestamp: Date;
  /** Type of audit event */
  readonly eventType: SafetyEventType;
  /** Severity level */
  readonly severity: AuditSeverity;
  /** Associated action (if applicable) */
  readonly actionType?: string;
  /** Decision made */
  readonly decision: AuditDecision;
  /** Confidence score (if applicable) */
  readonly confidenceScore?: number;
  /** Risk score (if applicable) */
  readonly riskScore?: number;
  /** Human-readable summary */
  readonly summary: string;
  /** Additional context */
  readonly context: Readonly<Record<string, unknown>>;
  /** Request context (requestId, tenantId) */
  readonly requestContext?: SafetyRequestContext;
}

/**
 * Input for creating an audit entry.
 */
export interface CreateAuditEntryInput {
  readonly eventType: SafetyEventType;
  readonly severity: AuditSeverity;
  readonly decision: AuditDecision;
  readonly summary: string;
  readonly actionType?: string;
  readonly confidenceScore?: number;
  readonly riskScore?: number;
  readonly context?: Record<string, unknown>;
  readonly requestContext?: SafetyRequestContext;
}

/**
 * Query options for retrieving audit entries.
 */
export interface AuditQueryOptions {
  /** Filter by event types */
  readonly eventTypes?: readonly SafetyEventType[];
  /** Filter by severity levels */
  readonly severities?: readonly AuditSeverity[];
  /** Filter by decisions */
  readonly decisions?: readonly AuditDecision[];
  /** Filter by tenant */
  readonly tenantId?: string;
  /** Filter by request */
  readonly requestId?: string;
  /** Start of time range */
  readonly fromDate?: Date;
  /** End of time range */
  readonly toDate?: Date;
  /** Maximum entries to return */
  readonly limit?: number;
  /** Offset for pagination */
  readonly offset?: number;
}

/**
 * Audit store interface for pluggable backends.
 */
export interface AuditStore {
  /** Appends an entry to the audit log */
  append(entry: SafetyAuditEntry): Promise<void>;
  /** Queries entries based on options */
  query(options: AuditQueryOptions): Promise<readonly SafetyAuditEntry[]>;
  /** Gets entry count matching options */
  count(options: AuditQueryOptions): Promise<number>;
}

// ==================== Re-exports ====================

export type { ConfidenceRange };
