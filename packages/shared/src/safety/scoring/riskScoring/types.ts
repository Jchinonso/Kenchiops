/**
 * Type definitions for risk scoring.
 *
 * ## Scoring Math Contract
 *
 * The risk scoring follows this deterministic formula:
 *
 * ```
 * 1. compositeScore = Σ(factor_score × factor_weight) for blast_radius, reversibility, data_impact
 * 2. preContextScore = clamp(compositeScore + scoreModifier, 0, 1)
 * 3. contextMultiplier = Π(applicable_multipliers) for production, incident_mode, off_hours
 * 4. finalScore = clamp(preContextScore × contextMultiplier, 0, 1)
 * 5. contextAdjustment = finalScore - preContextScore (stored for audit, never raw multipliers)
 * ```
 *
 * This ensures:
 * - Scores are always in [0, 1] range
 * - contextAdjustment represents the NET EFFECT of context, not raw multipliers
 * - Multipliers compound multiplicatively (production + incident = 1.3 × 1.5 = 1.95x)
 *
 * @module safety/scoring/riskScoring/types
 */

import type { BlastRadius, Reversibility, DataImpact, RiskAssessmentRule } from "../../types.js";
import type { RiskLevel, RiskRuleCategory } from "../../../constants/safety.js";
import type { RiskEnvironment } from "../../../database/riskRules/types.js";

// ==================== Risk Assessment Types ====================

/**
 * Complete risk assessment for an action.
 * Extended with matchedRule for audit/debug.
 */
export interface ActionRiskAssessment {
  /** How many systems are affected */
  readonly blastRadius: BlastRadius;
  /** How easily the action can be undone */
  readonly reversibility: Reversibility;
  /** Impact on data */
  readonly dataImpact: DataImpact;
  /** Composite risk score (0-1, higher = more risky) */
  readonly score: number;
  /** Categorized risk level */
  readonly riskLevel: RiskLevel;
  /** Human-readable risk summary */
  readonly summary: string;
  /** Which rule category matched (for audit/debug) */
  readonly matchedRule: RiskRuleCategory;
}

// ==================== Context Types ====================

/**
 * Caller-provided context hints for risk assessment.
 *
 * SECURITY NOTE: Fields ending in `Hint` are NOT authoritative.
 * The system will verify these against authoritative sources.
 * Callers cannot lower risk by lying about context.
 *
 * - `environment`: Trusted - caller knows their target environment
 * - `tenantId`: Trusted - validated against authenticated principal
 * - `incidentModeHint`: HINT - system verifies against incident service
 * - `offHoursHint`: HINT - system verifies against current time
 */
export interface RiskAssessmentContext {
  /** Target environment (production increases risk) - TRUSTED */
  readonly environment?: RiskEnvironment;
  /**
   * Hint: whether incident mode is active.
   * System will use MAX(caller_hint, system_detected) to prevent risk reduction.
   * Named with `Hint` suffix to signal this is not authoritative.
   */
  readonly incidentModeHint?: boolean;
  /**
   * Hint: whether current time is off-hours.
   * System will use MAX(caller_hint, system_detected) to prevent risk reduction.
   * Named with `Hint` suffix to signal this is not authoritative.
   */
  readonly offHoursHint?: boolean;
  /** Tenant ID for custom rule lookup - TRUSTED (validated against auth) */
  readonly tenantId?: string;
  /** Request ID for correlation/audit */
  readonly requestId?: string;
  /** Action proposal ID for linking to audit trail */
  readonly actionProposalId?: string;
}

/**
 * Resolved context with all fields populated.
 * This is the AUTHORITATIVE context used for scoring.
 *
 * System-resolved values (incidentModeActive, isOffHours) use the
 * MORE RESTRICTIVE of caller hint vs system detection.
 */
export interface ResolvedRiskContext {
  readonly environment: RiskEnvironment;
  /** Authoritative: MAX(caller_hint, system_detected) */
  readonly incidentModeActive: boolean;
  /** Authoritative: MAX(caller_hint, system_detected) */
  readonly isOffHours: boolean;
  readonly tenantId: string;
  readonly requestId: string;
  readonly actionProposalId: string | null;
}

/**
 * Extended risk assessment with context information.
 * Includes all fields for full traceability.
 *
 * ## Rule Resolution Model
 *
 * When multiple custom rules match:
 * - `scoreModifier`: SUM of all matched rules (modifiers compose)
 * - `blastRadius`, `reversibility`, `dataImpact`: Highest-priority rule wins
 * - `requireApprovalThreshold`, `blockThreshold`: Highest-priority rule wins
 * - Multipliers: Highest value from any matched rule (most restrictive)
 *
 * ## Threshold Precedence
 *
 * Rule-defined thresholds OVERRIDE global risk-level-based decisions:
 * 1. Final score is calculated
 * 2. Risk level is determined (for observability/reporting)
 * 3. Rule thresholds are evaluated and may force approval/block regardless of risk level
 */
export interface ContextualActionRiskAssessment extends ActionRiskAssessment {
  /** Score before context adjustments (after scoreModifier applied) */
  readonly baseScore: number;
  /**
   * Net effect of context multipliers: finalScore - baseScore
   * This is the RESULT of applying multipliers, not raw multipliers.
   */
  readonly contextAdjustment: number;
  /** Combined context multiplier that was applied (for transparency) */
  readonly contextMultiplier: number;
  /** Human-readable score as percentage (0-100) for UI/debugging */
  readonly scorePercent: number;
  /** Context that was used for assessment */
  readonly context: ResolvedRiskContext;
  /**
   * Context factors breakdown for forensics/debugging.
   * Explains WHY contextAdjustment had its value.
   */
  readonly contextFactors: ContextFactorsBreakdown;
  /**
   * Primary custom rule that was applied (if any).
   * @deprecated Use appliedCustomRules[0] for primary rule
   */
  readonly appliedCustomRule?: {
    readonly id: string;
    readonly name: string;
  };
  /**
   * All custom rules that matched, ordered by priority (lowest first).
   * First element is the primary rule.
   */
  readonly appliedCustomRules: readonly AppliedRuleSummary[];
  /** Approval requirements based on risk and context */
  readonly approvalRequirements: ApprovalRequirements;
  /** Scoring algorithm version for audit traceability */
  readonly scoringVersion: string;
}

/**
 * Context factors breakdown for audit trail and debugging.
 * Explains which context factors were active and their effect.
 */
export interface ContextFactorsBreakdown {
  /** Whether production multiplier was applied */
  readonly production: boolean;
  /** Whether incident mode multiplier was applied */
  readonly incidentMode: boolean;
  /** Whether off-hours multiplier was applied */
  readonly offHours: boolean;
  /** Combined multiplier from all active factors */
  readonly multiplier: number;
}

/**
 * Summary of an applied custom rule for audit trail.
 */
export interface AppliedRuleSummary {
  /** Rule ID */
  readonly id: string;
  /** Rule name */
  readonly name: string;
  /** Rule priority (lower = higher precedence) */
  readonly priority: number;
  /** Score modifier contributed by this rule */
  readonly scoreModifier: number;
  /** Which overrides this rule provided (if it was the primary rule) */
  readonly overridesApplied?: {
    readonly blastRadius?: boolean;
    readonly reversibility?: boolean;
    readonly dataImpact?: boolean;
    readonly thresholds?: boolean;
  };
}

/**
 * Approval requirements derived from risk assessment.
 */
export interface ApprovalRequirements {
  /** Whether any approval is required */
  readonly requiresApproval: boolean;
  /** Whether additional approval is required (e.g., during incident mode) */
  readonly requiresAdditionalApproval: boolean;
  /** Reason for approval requirement */
  readonly reason: string;
}

/**
 * Risk score constants structure for external inspection.
 */
export interface RiskScoreConstants {
  readonly weights: {
    readonly BLAST_RADIUS: number;
    readonly REVERSIBILITY: number;
    readonly DATA_IMPACT: number;
  };
  readonly blastRadiusScores: Record<BlastRadius, number>;
  readonly reversibilityScores: Record<Reversibility, number>;
  readonly dataImpactScores: Record<DataImpact, number>;
  readonly riskLevelThresholds: {
    readonly LOW: number;
    readonly MODERATE: number;
    readonly HIGH: number;
  };
}

// ==================== Rule Types ====================

/**
 * Extended rule with category for audit/debug.
 */
export interface CategorizedRule extends RiskAssessmentRule {
  readonly category: RiskRuleCategory;
}

/**
 * Result of rule matching.
 */
export interface RuleMatchResult {
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly category: RiskRuleCategory;
}

/**
 * Result of context adjustment calculation.
 */
export interface ContextAdjustmentResult {
  /** Net adjustment to add to base score */
  readonly adjustment: number;
  /** Combined multiplier that was applied (for audit/debugging) */
  readonly multiplier: number;
}

/**
 * Context multiplier configuration entry for lookup table.
 */
export interface MultiplierEntry {
  /** Condition that determines if this multiplier applies */
  readonly condition: (ctx: ResolvedRiskContext) => boolean;
  /** Gets the multiplier value, using custom value if provided */
  readonly getMultiplier: (custom?: number) => number;
}

/**
 * Custom multipliers configuration from custom risk rules.
 */
export interface CustomMultipliers {
  readonly production?: number;
  readonly incidentMode?: number;
  readonly offHours?: number;
}

/**
 * Detail entry for summary generation lookup table.
 */
export interface SummaryDetailEntry {
  /** Gets the detail string if applicable, or undefined if not */
  readonly getDetail: (ctx: SummaryContext) => string | undefined;
}

/**
 * Context for generating risk assessment summary.
 */
export interface SummaryContext {
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly context: ResolvedRiskContext;
  readonly customRuleName?: string;
}

/**
 * Input for generating contextual summary.
 */
export interface GenerateSummaryInput {
  readonly riskLevel: RiskLevel;
  readonly finalScore: number;
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly context: ResolvedRiskContext;
  readonly customRuleName?: string;
}

/**
 * Approval reason entry for lookup table.
 */
export interface ApprovalReasonEntry {
  /** Condition that determines if this reason applies */
  readonly condition: (ctx: ApprovalReasonContext) => boolean;
  /** Gets the reason string */
  readonly getReason: (ctx: ApprovalReasonContext) => string;
}

/**
 * Context for determining approval reason.
 */
export interface ApprovalReasonContext {
  readonly finalScore: number;
  readonly requiresApproval: boolean;
  readonly requiresAdditionalApproval: boolean;
}

/**
 * Risk level rule entry for lookup table.
 */
export interface RiskLevelRule {
  readonly minScore: number;
  readonly level: RiskLevel;
}

/**
 * Input for recording assessment to audit trail.
 */
export interface RecordAssessmentInput {
  readonly resolvedContext: ResolvedRiskContext;
  readonly action: {
    readonly actionType: string;
  };
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly baseScore: number;
  readonly contextAdjustment: number;
  readonly finalScore: number;
  readonly riskLevel: RiskLevel;
  readonly category: RiskRuleCategory | "custom";
  readonly summary: string;
  readonly customRule?: {
    readonly id: string;
  };
}

/**
 * Off-hours check context.
 */
export interface OffHoursCheckContext {
  readonly utcHour: number;
  readonly utcDay: number;
}

/**
 * Off-hours check entry for lookup table.
 */
export interface OffHoursCheckEntry {
  readonly check: (ctx: OffHoursCheckContext) => boolean;
}

/**
 * Context flag entry for summary generation.
 */
export interface ContextFlagEntry {
  readonly getFlag: (ctx: SummaryContext) => boolean;
  readonly label: string;
}

/**
 * Input for building applied custom rules list.
 */
export interface BuildAppliedRulesInput {
  readonly customRule?: {
    readonly id: string;
    readonly name: string;
    readonly priority: number;
    readonly scoreModifier: number | null;
    readonly blastRadius: BlastRadius | null;
    readonly reversibility: Reversibility | null;
    readonly dataImpact: DataImpact | null;
    readonly requireApprovalThreshold: number | null;
    readonly blockThreshold: number | null;
  };
}

/**
 * Input for building context factors breakdown.
 */
export interface BuildContextFactorsInput {
  readonly resolvedContext: ResolvedRiskContext;
  readonly contextMultiplier: number;
}
