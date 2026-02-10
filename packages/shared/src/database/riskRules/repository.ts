/**
 * Risk Rules Repository
 *
 * Database operations for custom risk rules and risk assessments.
 * Provides CRUD operations with tenant isolation and audit trail.
 *
 * @module database/riskRules/repository
 */

import { query, createLogger, getErrorMessage, NotFoundError, generateEventId } from "../common.js";
import {
  RISK_RULE_DEFAULTS,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
  type CustomRiskRule,
  type CustomRiskRuleRow,
  type RiskAssessmentRecord,
  type RiskAssessmentRow,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
} from "./types.js";
import {
  validateCreateRiskRuleInput,
  validateUpdateRiskRuleInput,
  validateRiskAssessmentInput,
  validateRiskRulesQueryOptions,
  validateAssessmentsQueryOptions,
} from "./validation.js";
import { mapRowToCustomRiskRule, mapRowToRiskAssessment } from "./mappers.js";
import { createRuleLogContext } from "./helpers.js";

const logger = createLogger("risk-rules-repository");

// ==================== SQL Queries ====================

const RISK_RULE_QUERIES = {
  INSERT_RULE: `
    INSERT INTO custom_risk_rules (
      id, tenant_id, name, description, action_types, environment,
      blast_radius, reversibility, data_impact,
      score_modifier, production_multiplier, incident_mode_multiplier, off_hours_multiplier,
      require_approval_threshold, block_threshold, enabled, priority, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `,

  SELECT_RULES: `
    SELECT * FROM custom_risk_rules
    WHERE tenant_id = $1
    AND ($2::boolean IS NULL OR enabled = $2)
    ORDER BY priority ASC, created_at DESC
    LIMIT $3 OFFSET $4
  `,

  SELECT_RULE_BY_ID: `
    SELECT * FROM custom_risk_rules
    WHERE id = $1 AND tenant_id = $2
  `,

  UPDATE_RULE: `
    UPDATE custom_risk_rules SET
      name = COALESCE($3, name),
      description = CASE WHEN $4::boolean THEN $5 ELSE description END,
      action_types = COALESCE($6, action_types),
      environment = CASE WHEN $7::boolean THEN $8 ELSE environment END,
      blast_radius = CASE WHEN $9::boolean THEN $10 ELSE blast_radius END,
      reversibility = CASE WHEN $11::boolean THEN $12 ELSE reversibility END,
      data_impact = CASE WHEN $13::boolean THEN $14 ELSE data_impact END,
      score_modifier = COALESCE($15, score_modifier),
      production_multiplier = COALESCE($16, production_multiplier),
      incident_mode_multiplier = COALESCE($17, incident_mode_multiplier),
      off_hours_multiplier = COALESCE($18, off_hours_multiplier),
      require_approval_threshold = CASE WHEN $19::boolean THEN $20 ELSE require_approval_threshold END,
      block_threshold = CASE WHEN $21::boolean THEN $22 ELSE block_threshold END,
      enabled = COALESCE($23, enabled),
      priority = COALESCE($24, priority),
      updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `,

  DELETE_RULE: `
    DELETE FROM custom_risk_rules
    WHERE id = $1 AND tenant_id = $2
    RETURNING id
  `,

  INSERT_ASSESSMENT: `
    INSERT INTO risk_assessments (
      id, tenant_id, action_proposal_id, action_type,
      blast_radius, reversibility, data_impact,
      base_score, context_adjustment, final_score, risk_level,
      environment, incident_mode_active, is_off_hours,
      matched_rule_id, matched_rule_category, summary, request_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `,

  SELECT_ASSESSMENTS: `
    SELECT * FROM risk_assessments
    WHERE tenant_id = $1
    AND ($2::text IS NULL OR action_proposal_id = $2)
    AND ($3::text IS NULL OR action_type = $3)
    AND ($4::timestamptz IS NULL OR assessed_at >= $4)
    AND ($5::timestamptz IS NULL OR assessed_at <= $5)
    ORDER BY assessed_at DESC
    LIMIT $6 OFFSET $7
  `,
} as const;

// ==================== Rule Operations ====================

/**
 * Creates a new custom risk rule.
 *
 * @param input - Rule data
 * @returns Created rule
 * @throws ValidationError if input is invalid
 */
export const createCustomRiskRule = async (
  input: CreateCustomRiskRuleInput
): Promise<CustomRiskRule> => {
  validateCreateRiskRuleInput(input);

  const id = generateEventId();

  try {
    const result = await query<CustomRiskRuleRow>(RISK_RULE_QUERIES.INSERT_RULE, [
      id,
      input.tenantId,
      input.name,
      input.description ?? null,
      input.actionTypes,
      input.environment ?? null,
      input.blastRadius ?? null,
      input.reversibility ?? null,
      input.dataImpact ?? null,
      input.scoreModifier ?? RISK_RULE_DEFAULTS.SCORE_MODIFIER,
      input.productionMultiplier ?? RISK_RULE_DEFAULTS.PRODUCTION_MULTIPLIER,
      input.incidentModeMultiplier ?? RISK_RULE_DEFAULTS.INCIDENT_MODE_MULTIPLIER,
      input.offHoursMultiplier ?? RISK_RULE_DEFAULTS.OFF_HOURS_MULTIPLIER,
      input.requireApprovalThreshold ?? null,
      input.blockThreshold ?? null,
      input.enabled ?? RISK_RULE_DEFAULTS.ENABLED,
      input.priority ?? RISK_RULE_DEFAULTS.PRIORITY,
      input.createdBy ?? null,
    ]);

    logger.info("Created custom risk rule", {
      id,
      tenantId: input.tenantId,
      ...createRuleLogContext(input),
    });

    return mapRowToCustomRiskRule(result.rows[0]);
  } catch (error) {
    logger.error("Failed to create custom risk rule", {
      tenantId: input.tenantId,
      ...createRuleLogContext(input),
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets custom risk rules for a tenant.
 *
 * @param options - Query options
 * @returns Matching rules sorted by priority
 */
export const getCustomRiskRules = async (
  options: RiskRulesQueryOptions
): Promise<readonly CustomRiskRule[]> => {
  const validated = validateRiskRulesQueryOptions(options);

  try {
    const result = await query<CustomRiskRuleRow>(RISK_RULE_QUERIES.SELECT_RULES, [
      validated.tenantId,
      validated.enabledOnly ? true : null,
      validated.limit,
      validated.offset,
    ]);

    // Post-filter by action type and environment (GIN index handles action_types)
    let rules = result.rows.map(mapRowToCustomRiskRule);

    if (validated.actionType) {
      const normalizedTarget = validated.actionType.toLowerCase();
      rules = rules.filter((rule) =>
        rule.actionTypes.some((at) => at.toLowerCase() === normalizedTarget)
      );
    }

    if (validated.environment) {
      rules = rules.filter(
        (rule) => rule.environment === null || rule.environment === validated.environment
      );
    }

    return Object.freeze(rules);
  } catch (error) {
    logger.error("Failed to get custom risk rules", {
      tenantId: options.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets a single rule by ID with tenant validation.
 *
 * @param ruleId - Rule ID
 * @param tenantId - Tenant ID for security
 * @returns Rule or null if not found
 */
export const getCustomRiskRuleById = async (
  ruleId: string,
  tenantId: string
): Promise<CustomRiskRule | null> => {
  try {
    const result = await query<CustomRiskRuleRow>(RISK_RULE_QUERIES.SELECT_RULE_BY_ID, [
      ruleId,
      tenantId,
    ]);

    return result.rows.length > 0 ? mapRowToCustomRiskRule(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get custom risk rule by ID", {
      ruleId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates a custom risk rule.
 *
 * @param ruleId - Rule ID
 * @param tenantId - Tenant ID for security
 * @param input - Fields to update
 * @returns Updated rule
 * @throws NotFoundError if rule doesn't exist
 */
export const updateCustomRiskRule = async (
  ruleId: string,
  tenantId: string,
  input: UpdateCustomRiskRuleInput
): Promise<CustomRiskRule> => {
  validateUpdateRiskRuleInput(input);

  try {
    const result = await query<CustomRiskRuleRow>(RISK_RULE_QUERIES.UPDATE_RULE, [
      ruleId,
      tenantId,
      input.name,
      input.description !== undefined,
      input.description ?? null,
      input.actionTypes ?? null,
      input.environment !== undefined,
      input.environment ?? null,
      input.blastRadius !== undefined,
      input.blastRadius ?? null,
      input.reversibility !== undefined,
      input.reversibility ?? null,
      input.dataImpact !== undefined,
      input.dataImpact ?? null,
      input.scoreModifier,
      input.productionMultiplier,
      input.incidentModeMultiplier,
      input.offHoursMultiplier,
      input.requireApprovalThreshold !== undefined,
      input.requireApprovalThreshold ?? null,
      input.blockThreshold !== undefined,
      input.blockThreshold ?? null,
      input.enabled,
      input.priority,
    ]);

    if (result.rows.length === 0) {
      throw new NotFoundError("Custom risk rule not found", {
        metadata: { ruleId, tenantId },
      });
    }

    logger.info("Updated custom risk rule", {
      ruleId,
      tenantId,
      ...createRuleLogContext(input),
    });

    return mapRowToCustomRiskRule(result.rows[0]);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error("Failed to update custom risk rule", {
      ruleId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Deletes a custom risk rule.
 *
 * @param ruleId - Rule ID
 * @param tenantId - Tenant ID for security
 * @returns True if deleted, false if not found
 */
export const deleteCustomRiskRule = async (ruleId: string, tenantId: string): Promise<boolean> => {
  try {
    const result = await query<{ id: string }>(RISK_RULE_QUERIES.DELETE_RULE, [ruleId, tenantId]);

    const deleted = result.rows.length > 0;

    if (deleted) {
      logger.info("Deleted custom risk rule", { ruleId, tenantId });
    }

    return deleted;
  } catch (error) {
    logger.error("Failed to delete custom risk rule", {
      ruleId,
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Assessment Operations ====================

/**
 * Records a risk assessment for audit trail.
 *
 * @param input - Assessment data
 * @returns Created assessment record
 */
export const recordRiskAssessment = async (
  input: CreateRiskAssessmentInput
): Promise<RiskAssessmentRecord> => {
  validateRiskAssessmentInput(input);

  const id = generateEventId();

  try {
    const result = await query<RiskAssessmentRow>(RISK_RULE_QUERIES.INSERT_ASSESSMENT, [
      id,
      input.tenantId,
      input.actionProposalId ?? null,
      input.actionType,
      input.blastRadius,
      input.reversibility,
      input.dataImpact,
      input.baseScore,
      input.contextAdjustment,
      input.finalScore,
      input.riskLevel,
      input.environment ?? null,
      input.incidentModeActive,
      input.isOffHours,
      input.matchedRuleId ?? null,
      input.matchedRuleCategory,
      input.summary,
      input.requestId ?? null,
    ]);

    logger.debug("Recorded risk assessment", {
      id,
      tenantId: input.tenantId,
      actionType: input.actionType,
      finalScore: input.finalScore,
      riskLevel: input.riskLevel,
    });

    return mapRowToRiskAssessment(result.rows[0]);
  } catch (error) {
    logger.error("Failed to record risk assessment", {
      tenantId: input.tenantId,
      actionType: input.actionType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Queries risk assessments with filters.
 *
 * @param options - Query options
 * @returns Matching assessments, newest first
 */
export const queryRiskAssessments = async (
  options: RiskAssessmentsQueryOptions
): Promise<readonly RiskAssessmentRecord[]> => {
  const validated = validateAssessmentsQueryOptions(options);

  try {
    const result = await query<RiskAssessmentRow>(RISK_RULE_QUERIES.SELECT_ASSESSMENTS, [
      validated.tenantId,
      validated.actionProposalId ?? null,
      validated.actionType ?? null,
      validated.fromDate ?? null,
      validated.toDate ?? null,
      validated.limit,
      validated.offset,
    ]);

    return Object.freeze(result.rows.map(mapRowToRiskAssessment));
  } catch (error) {
    logger.error("Failed to query risk assessments", {
      tenantId: options.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
