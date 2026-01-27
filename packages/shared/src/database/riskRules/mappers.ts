/**
 * Risk Rules Mappers
 *
 * Row-to-domain mappers for risk rules and assessments.
 * Converts database rows (snake_case) to domain objects (camelCase).
 *
 * @module database/riskRules/mappers
 */

import type {
  CustomRiskRule,
  CustomRiskRuleRow,
  RiskAssessmentRecord,
  RiskAssessmentRow,
  RiskEnvironment,
} from "./types.js";
import type { BlastRadius, Reversibility, DataImpact } from "../../safety/types.js";
import type { RiskLevel, RiskRuleCategory } from "../../constants/safety.js";

// ==================== Row Mappers ====================

/**
 * Maps database row to CustomRiskRule domain object.
 * Converts snake_case to camelCase and parses numeric strings.
 *
 * @param row - Database row from custom_risk_rules table
 * @returns Immutable domain object
 */
export const mapRowToCustomRiskRule = (row: CustomRiskRuleRow): CustomRiskRule => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  description: row.description,
  actionTypes: Object.freeze([...row.action_types]),
  environment: row.environment as RiskEnvironment | null,
  blastRadius: row.blast_radius as BlastRadius | null,
  reversibility: row.reversibility as Reversibility | null,
  dataImpact: row.data_impact as DataImpact | null,
  scoreModifier: parseFloat(row.score_modifier),
  productionMultiplier: parseFloat(row.production_multiplier),
  incidentModeMultiplier: parseFloat(row.incident_mode_multiplier),
  offHoursMultiplier: parseFloat(row.off_hours_multiplier),
  requireApprovalThreshold: row.require_approval_threshold
    ? parseFloat(row.require_approval_threshold)
    : null,
  blockThreshold: row.block_threshold ? parseFloat(row.block_threshold) : null,
  enabled: row.enabled,
  priority: row.priority,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Maps database row to RiskAssessmentRecord domain object.
 *
 * @param row - Database row from risk_assessments table
 * @returns Immutable domain object
 */
export const mapRowToRiskAssessment = (row: RiskAssessmentRow): RiskAssessmentRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  actionProposalId: row.action_proposal_id,
  actionType: row.action_type,
  blastRadius: row.blast_radius as BlastRadius,
  reversibility: row.reversibility as Reversibility,
  dataImpact: row.data_impact as DataImpact,
  baseScore: parseFloat(row.base_score),
  contextAdjustment: parseFloat(row.context_adjustment),
  finalScore: parseFloat(row.final_score),
  riskLevel: row.risk_level as RiskLevel,
  environment: row.environment as RiskEnvironment | null,
  incidentModeActive: row.incident_mode_active,
  isOffHours: row.is_off_hours,
  matchedRuleId: row.matched_rule_id,
  matchedRuleCategory: row.matched_rule_category as RiskRuleCategory | "custom",
  summary: row.summary,
  requestId: row.request_id,
  assessedAt: row.assessed_at,
});

/**
 * Extracts the first rule from rows, or null if empty.
 *
 * @param rows - Array of database rows
 * @returns First rule or null
 */
export const extractFirstRule = (rows: readonly CustomRiskRuleRow[]): CustomRiskRule | null =>
  rows.length > 0 ? mapRowToCustomRiskRule(rows[0]) : null;

/**
 * Maps multiple rows to domain objects with immutable array.
 *
 * @param rows - Array of database rows
 * @returns Frozen array of domain objects
 */
export const mapRowsToRules = (rows: readonly CustomRiskRuleRow[]): readonly CustomRiskRule[] =>
  Object.freeze(rows.map(mapRowToCustomRiskRule));

/**
 * Maps multiple assessment rows to domain objects.
 *
 * @param rows - Array of database rows
 * @returns Frozen array of domain objects
 */
export const mapRowsToAssessments = (
  rows: readonly RiskAssessmentRow[]
): readonly RiskAssessmentRecord[] => Object.freeze(rows.map(mapRowToRiskAssessment));
