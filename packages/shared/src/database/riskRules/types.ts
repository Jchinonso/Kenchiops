/**
 * Risk Rules Types
 *
 * Type definitions for custom risk rules and risk assessment audit trail.
 * Supports user-configurable risk scoring with context awareness.
 *
 * @module database/riskRules/types
 */

import type { BlastRadius, Reversibility, DataImpact } from "../../safety/types.js";
import type { RiskLevel, RiskRuleCategory } from "../../constants/safety.js";

// ==================== Environment Types ====================

/**
 * Target environment for risk assessment.
 */
export type RiskEnvironment = "production" | "staging" | "development";

// ==================== Database Row Types ====================

/**
 * Database row for custom_risk_rules table.
 * Maps directly to PostgreSQL column names (snake_case).
 */
export interface CustomRiskRuleRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly action_types: readonly string[];
  readonly environment: string | null;
  readonly blast_radius: string | null;
  readonly reversibility: string | null;
  readonly data_impact: string | null;
  readonly score_modifier: string;
  readonly production_multiplier: string;
  readonly incident_mode_multiplier: string;
  readonly off_hours_multiplier: string;
  readonly require_approval_threshold: string | null;
  readonly block_threshold: string | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Database row for risk_assessments table.
 * Maps directly to PostgreSQL column names (snake_case).
 */
export interface RiskAssessmentRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly action_proposal_id: string | null;
  readonly action_type: string;
  readonly blast_radius: string;
  readonly reversibility: string;
  readonly data_impact: string;
  readonly base_score: string;
  readonly context_adjustment: string;
  readonly final_score: string;
  readonly risk_level: string;
  readonly environment: string | null;
  readonly incident_mode_active: boolean;
  readonly is_off_hours: boolean;
  readonly matched_rule_id: string | null;
  readonly matched_rule_category: string;
  readonly summary: string;
  readonly request_id: string | null;
  readonly assessed_at: Date;
}

// ==================== Domain Types ====================

/**
 * Custom risk rule domain object.
 * Used throughout the application after mapping from database row.
 */
export interface CustomRiskRule {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly actionTypes: readonly string[];
  readonly environment: RiskEnvironment | null;
  readonly blastRadius: BlastRadius | null;
  readonly reversibility: Reversibility | null;
  readonly dataImpact: DataImpact | null;
  readonly scoreModifier: number;
  readonly productionMultiplier: number;
  readonly incidentModeMultiplier: number;
  readonly offHoursMultiplier: number;
  readonly requireApprovalThreshold: number | null;
  readonly blockThreshold: number | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Risk assessment record from database.
 * Immutable audit trail entry.
 */
export interface RiskAssessmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly actionProposalId: string | null;
  readonly actionType: string;
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly baseScore: number;
  readonly contextAdjustment: number;
  readonly finalScore: number;
  readonly riskLevel: RiskLevel;
  readonly environment: RiskEnvironment | null;
  readonly incidentModeActive: boolean;
  readonly isOffHours: boolean;
  readonly matchedRuleId: string | null;
  readonly matchedRuleCategory: RiskRuleCategory | "custom";
  readonly summary: string;
  readonly requestId: string | null;
  readonly assessedAt: Date;
}

// ==================== Input Types ====================

/**
 * Input for creating a custom risk rule.
 * All fields except tenantId and name are optional.
 */
export interface CreateCustomRiskRuleInput {
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string;
  readonly actionTypes: readonly string[];
  readonly environment?: RiskEnvironment;
  readonly blastRadius?: BlastRadius;
  readonly reversibility?: Reversibility;
  readonly dataImpact?: DataImpact;
  readonly scoreModifier?: number;
  readonly productionMultiplier?: number;
  readonly incidentModeMultiplier?: number;
  readonly offHoursMultiplier?: number;
  readonly requireApprovalThreshold?: number;
  readonly blockThreshold?: number;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly createdBy?: string;
}

/**
 * Input for updating a custom risk rule.
 * All fields are optional; undefined means "don't change".
 * Explicit null means "clear the value".
 */
export interface UpdateCustomRiskRuleInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly actionTypes?: readonly string[];
  readonly environment?: RiskEnvironment | null;
  readonly blastRadius?: BlastRadius | null;
  readonly reversibility?: Reversibility | null;
  readonly dataImpact?: DataImpact | null;
  readonly scoreModifier?: number;
  readonly productionMultiplier?: number;
  readonly incidentModeMultiplier?: number;
  readonly offHoursMultiplier?: number;
  readonly requireApprovalThreshold?: number | null;
  readonly blockThreshold?: number | null;
  readonly enabled?: boolean;
  readonly priority?: number;
}

/**
 * Input for recording a risk assessment.
 * Created automatically during risk evaluation.
 */
export interface CreateRiskAssessmentInput {
  readonly tenantId: string;
  readonly actionProposalId?: string;
  readonly actionType: string;
  readonly blastRadius: BlastRadius;
  readonly reversibility: Reversibility;
  readonly dataImpact: DataImpact;
  readonly baseScore: number;
  readonly contextAdjustment: number;
  readonly finalScore: number;
  readonly riskLevel: RiskLevel;
  readonly environment?: RiskEnvironment;
  readonly incidentModeActive: boolean;
  readonly isOffHours: boolean;
  readonly matchedRuleId?: string;
  readonly matchedRuleCategory: RiskRuleCategory | "custom";
  readonly summary: string;
  readonly requestId?: string;
}

// ==================== Query Options ====================

/**
 * Options for querying custom risk rules.
 * Always requires tenantId for security isolation.
 */
export interface RiskRulesQueryOptions {
  /** Required: Tenant to query rules for */
  readonly tenantId: string;
  /** Optional: Filter by specific action type */
  readonly actionType?: string;
  /** Optional: Filter by environment */
  readonly environment?: RiskEnvironment;
  /** Optional: Only return enabled rules (default: true) */
  readonly enabledOnly?: boolean;
  /** Optional: Maximum results (default: 100, max: 1000) */
  readonly limit?: number;
  /** Optional: Offset for pagination */
  readonly offset?: number;
}

/**
 * Options for querying risk assessments.
 * Always requires tenantId for security isolation.
 */
export interface RiskAssessmentsQueryOptions {
  /** Required: Tenant to query assessments for */
  readonly tenantId: string;
  /** Optional: Filter by action proposal ID */
  readonly actionProposalId?: string;
  /** Optional: Filter by action type */
  readonly actionType?: string;
  /** Optional: Filter by minimum risk level */
  readonly minRiskLevel?: RiskLevel;
  /** Optional: Start of time range */
  readonly fromDate?: Date;
  /** Optional: End of time range */
  readonly toDate?: Date;
  /** Optional: Maximum results (default: 100, max: 1000) */
  readonly limit?: number;
  /** Optional: Offset for pagination */
  readonly offset?: number;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateCustomRiskRuleInput fields.
 */
export interface RiskRuleValidationRule {
  readonly field: keyof CreateCustomRiskRuleInput;
  readonly isInvalid: (input: CreateCustomRiskRuleInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateCustomRiskRuleInput) => unknown;
}

/**
 * Validation rule for CreateRiskAssessmentInput fields.
 */
export interface RiskAssessmentValidationRule {
  readonly field: keyof CreateRiskAssessmentInput;
  readonly isInvalid: (input: CreateRiskAssessmentInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateRiskAssessmentInput) => unknown;
}

// ==================== Store Interface ====================

/**
 * Risk rules store interface for pluggable backends.
 * Follows the AuditStore pattern from safety/audit/audit.ts.
 */
export interface RiskRulesStore {
  /**
   * Gets custom rules for a tenant.
   * Rules are returned sorted by priority (ascending).
   *
   * @param options - Query options (tenantId required)
   * @returns Matching rules, frozen for immutability
   */
  getCustomRules(options: RiskRulesQueryOptions): Promise<readonly CustomRiskRule[]>;

  /**
   * Gets a single rule by ID.
   * Returns null if not found or tenant mismatch.
   *
   * @param ruleId - Rule ID
   * @param tenantId - Tenant ID for security validation
   * @returns Rule or null
   */
  getRuleById(ruleId: string, tenantId: string): Promise<CustomRiskRule | null>;

  /**
   * Creates a new custom rule.
   *
   * @param input - Rule data
   * @returns Created rule
   * @throws ValidationError if input is invalid
   */
  addRule(input: CreateCustomRiskRuleInput): Promise<CustomRiskRule>;

  /**
   * Updates an existing rule.
   *
   * @param ruleId - Rule ID
   * @param tenantId - Tenant ID for security validation
   * @param input - Fields to update
   * @returns Updated rule
   * @throws NotFoundError if rule doesn't exist or tenant mismatch
   * @throws ValidationError if input is invalid
   */
  updateRule(
    ruleId: string,
    tenantId: string,
    input: UpdateCustomRiskRuleInput
  ): Promise<CustomRiskRule>;

  /**
   * Deletes a rule.
   *
   * @param ruleId - Rule ID
   * @param tenantId - Tenant ID for security validation
   * @returns True if deleted, false if not found
   */
  deleteRule(ruleId: string, tenantId: string): Promise<boolean>;

  /**
   * Records a risk assessment for audit trail.
   *
   * @param input - Assessment data
   * @returns Created assessment record
   */
  recordAssessment(input: CreateRiskAssessmentInput): Promise<RiskAssessmentRecord>;

  /**
   * Queries risk assessments.
   *
   * @param options - Query options (tenantId required)
   * @returns Matching assessments, newest first
   */
  queryAssessments(options: RiskAssessmentsQueryOptions): Promise<readonly RiskAssessmentRecord[]>;
}

// ==================== Constants ====================

/**
 * Valid environment values.
 */
export const VALID_ENVIRONMENTS: ReadonlySet<RiskEnvironment> = new Set([
  "production",
  "staging",
  "development",
]);

/**
 * Valid blast radius values.
 */
export const VALID_BLAST_RADIUS: ReadonlySet<BlastRadius> = new Set([
  "single_service",
  "multiple_services",
  "infrastructure",
]);

/**
 * Valid reversibility values.
 */
export const VALID_REVERSIBILITY: ReadonlySet<Reversibility> = new Set([
  "instant",
  "minutes",
  "manual_only",
  "irreversible",
]);

/**
 * Valid data impact values.
 */
export const VALID_DATA_IMPACT: ReadonlySet<DataImpact> = new Set([
  "none",
  "read_only",
  "write",
  "destructive",
]);

/**
 * Valid risk levels.
 */
export const VALID_RISK_LEVELS: ReadonlySet<RiskLevel> = new Set([
  "low",
  "moderate",
  "high",
  "critical",
]);

/**
 * Default values for risk rules.
 */
export const RISK_RULE_DEFAULTS = {
  SCORE_MODIFIER: 0,
  PRODUCTION_MULTIPLIER: 1.0,
  INCIDENT_MODE_MULTIPLIER: 1.0,
  OFF_HOURS_MULTIPLIER: 1.0,
  ENABLED: true,
  PRIORITY: 100,
  QUERY_LIMIT: 100,
  MAX_QUERY_LIMIT: 1000,
  MIN_MULTIPLIER: 0,
  MAX_MULTIPLIER: 3.0,
  MIN_SCORE_MODIFIER: -1.0,
  MAX_SCORE_MODIFIER: 1.0,
  MIN_THRESHOLD: 0,
  MAX_THRESHOLD: 1.0,
} as const;
