/**
 * Risk Rules Validation
 *
 * Validation functions and rules for risk rule inputs.
 * Uses declarative rule pattern from CLAUDE.md.
 *
 * @module database/riskRules/validation
 */

import { ValidationError } from "../common.js";
import {
  VALID_ENVIRONMENTS,
  VALID_BLAST_RADIUS,
  VALID_REVERSIBILITY,
  VALID_DATA_IMPACT,
  VALID_RISK_LEVELS,
  RISK_RULE_DEFAULTS,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
  type RiskRuleValidationRule,
  type RiskAssessmentValidationRule,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
} from "./types.js";

// ==================== Create Rule Validation Rules ====================

const CREATE_RULE_VALIDATION_RULES: readonly RiskRuleValidationRule[] = [
  {
    field: "tenantId",
    isInvalid: (input) => !input.tenantId || input.tenantId.trim().length === 0,
    message: "Tenant ID cannot be empty",
  },
  {
    field: "name",
    isInvalid: (input) => !input.name || input.name.trim().length === 0,
    message: "Rule name cannot be empty",
  },
  {
    field: "name",
    isInvalid: (input) => Boolean(input.name && input.name.length > 255),
    message: "Rule name cannot exceed 255 characters",
    getValue: (input) => input.name?.length,
  },
  {
    field: "actionTypes",
    isInvalid: (input) => !input.actionTypes || input.actionTypes.length === 0,
    message: "At least one action type is required",
  },
  {
    field: "actionTypes",
    isInvalid: (input) => input.actionTypes?.some((at) => !at || at.trim().length === 0) ?? false,
    message: "Action types cannot contain empty values",
  },
  {
    field: "scoreModifier",
    isInvalid: (input) =>
      input.scoreModifier !== undefined &&
      (input.scoreModifier < RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER ||
        input.scoreModifier > RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER),
    message: `Score modifier must be between ${RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER} and ${RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER}`,
    getValue: (input) => input.scoreModifier,
  },
  {
    field: "productionMultiplier",
    isInvalid: (input) =>
      input.productionMultiplier !== undefined &&
      (input.productionMultiplier < RISK_RULE_DEFAULTS.MIN_MULTIPLIER ||
        input.productionMultiplier > RISK_RULE_DEFAULTS.MAX_MULTIPLIER),
    message: `Production multiplier must be between ${RISK_RULE_DEFAULTS.MIN_MULTIPLIER} and ${RISK_RULE_DEFAULTS.MAX_MULTIPLIER}`,
    getValue: (input) => input.productionMultiplier,
  },
  {
    field: "incidentModeMultiplier",
    isInvalid: (input) =>
      input.incidentModeMultiplier !== undefined &&
      (input.incidentModeMultiplier < RISK_RULE_DEFAULTS.MIN_MULTIPLIER ||
        input.incidentModeMultiplier > RISK_RULE_DEFAULTS.MAX_MULTIPLIER),
    message: `Incident mode multiplier must be between ${RISK_RULE_DEFAULTS.MIN_MULTIPLIER} and ${RISK_RULE_DEFAULTS.MAX_MULTIPLIER}`,
    getValue: (input) => input.incidentModeMultiplier,
  },
  {
    field: "offHoursMultiplier",
    isInvalid: (input) =>
      input.offHoursMultiplier !== undefined &&
      (input.offHoursMultiplier < RISK_RULE_DEFAULTS.MIN_MULTIPLIER ||
        input.offHoursMultiplier > RISK_RULE_DEFAULTS.MAX_MULTIPLIER),
    message: `Off-hours multiplier must be between ${RISK_RULE_DEFAULTS.MIN_MULTIPLIER} and ${RISK_RULE_DEFAULTS.MAX_MULTIPLIER}`,
    getValue: (input) => input.offHoursMultiplier,
  },
  {
    field: "requireApprovalThreshold",
    isInvalid: (input) =>
      input.requireApprovalThreshold !== undefined &&
      (input.requireApprovalThreshold < RISK_RULE_DEFAULTS.MIN_THRESHOLD ||
        input.requireApprovalThreshold > RISK_RULE_DEFAULTS.MAX_THRESHOLD),
    message: `Approval threshold must be between ${RISK_RULE_DEFAULTS.MIN_THRESHOLD} and ${RISK_RULE_DEFAULTS.MAX_THRESHOLD}`,
    getValue: (input) => input.requireApprovalThreshold,
  },
  {
    field: "blockThreshold",
    isInvalid: (input) =>
      input.blockThreshold !== undefined &&
      (input.blockThreshold < RISK_RULE_DEFAULTS.MIN_THRESHOLD ||
        input.blockThreshold > RISK_RULE_DEFAULTS.MAX_THRESHOLD),
    message: `Block threshold must be between ${RISK_RULE_DEFAULTS.MIN_THRESHOLD} and ${RISK_RULE_DEFAULTS.MAX_THRESHOLD}`,
    getValue: (input) => input.blockThreshold,
  },
  {
    field: "priority",
    isInvalid: (input) => input.priority !== undefined && input.priority < 0,
    message: "Priority must be non-negative",
    getValue: (input) => input.priority,
  },
];

// ==================== Assessment Validation Rules ====================

const CREATE_ASSESSMENT_VALIDATION_RULES: readonly RiskAssessmentValidationRule[] = [
  {
    field: "tenantId",
    isInvalid: (input) => !input.tenantId || input.tenantId.trim().length === 0,
    message: "Tenant ID cannot be empty",
  },
  {
    field: "actionType",
    isInvalid: (input) => !input.actionType || input.actionType.trim().length === 0,
    message: "Action type cannot be empty",
  },
  {
    field: "baseScore",
    isInvalid: (input) =>
      !Number.isFinite(input.baseScore) || input.baseScore < 0 || input.baseScore > 1,
    message: "Base score must be between 0 and 1",
    getValue: (input) => input.baseScore,
  },
  {
    field: "finalScore",
    isInvalid: (input) =>
      !Number.isFinite(input.finalScore) || input.finalScore < 0 || input.finalScore > 1,
    message: "Final score must be between 0 and 1",
    getValue: (input) => input.finalScore,
  },
  {
    field: "summary",
    isInvalid: (input) => !input.summary || input.summary.trim().length === 0,
    message: "Summary cannot be empty",
  },
];

// ==================== Validation Functions ====================

/**
 * Validates CreateCustomRiskRuleInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateCreateRiskRuleInput = (input: CreateCustomRiskRuleInput): void => {
  const failedRule = CREATE_RULE_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule) {
    const metadata: Record<string, unknown> = { field: failedRule.field };
    if (failedRule.getValue) {
      metadata.value = failedRule.getValue(input);
    }
    throw new ValidationError(failedRule.message, {
      operation: "validateCreateRiskRuleInput",
      metadata,
    });
  }

  // Validate enum values
  if (input.environment !== undefined && !VALID_ENVIRONMENTS.has(input.environment)) {
    throw new ValidationError(`Invalid environment: ${input.environment}`, {
      operation: "validateCreateRiskRuleInput",
      metadata: { field: "environment", value: input.environment },
    });
  }

  if (input.blastRadius !== undefined && !VALID_BLAST_RADIUS.has(input.blastRadius)) {
    throw new ValidationError(`Invalid blast radius: ${input.blastRadius}`, {
      operation: "validateCreateRiskRuleInput",
      metadata: { field: "blastRadius", value: input.blastRadius },
    });
  }

  if (input.reversibility !== undefined && !VALID_REVERSIBILITY.has(input.reversibility)) {
    throw new ValidationError(`Invalid reversibility: ${input.reversibility}`, {
      operation: "validateCreateRiskRuleInput",
      metadata: { field: "reversibility", value: input.reversibility },
    });
  }

  if (input.dataImpact !== undefined && !VALID_DATA_IMPACT.has(input.dataImpact)) {
    throw new ValidationError(`Invalid data impact: ${input.dataImpact}`, {
      operation: "validateCreateRiskRuleInput",
      metadata: { field: "dataImpact", value: input.dataImpact },
    });
  }
};

/**
 * Validates UpdateCustomRiskRuleInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateUpdateRiskRuleInput = (input: UpdateCustomRiskRuleInput): void => {
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("Rule name cannot be empty", {
      operation: "validateUpdateRiskRuleInput",
      metadata: { field: "name" },
    });
  }

  if (input.name !== undefined && input.name.length > 255) {
    throw new ValidationError("Rule name cannot exceed 255 characters", {
      operation: "validateUpdateRiskRuleInput",
      metadata: { field: "name", length: input.name.length },
    });
  }

  if (input.actionTypes !== undefined) {
    if (input.actionTypes.length === 0) {
      throw new ValidationError("At least one action type is required", {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "actionTypes" },
      });
    }
    if (input.actionTypes.some((at) => !at || at.trim().length === 0)) {
      throw new ValidationError("Action types cannot contain empty values", {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "actionTypes" },
      });
    }
  }

  // Validate numeric ranges
  if (
    input.scoreModifier !== undefined &&
    (input.scoreModifier < RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER ||
      input.scoreModifier > RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER)
  ) {
    throw new ValidationError(
      `Score modifier must be between ${RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER} and ${RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER}`,
      { operation: "validateUpdateRiskRuleInput", metadata: { field: "scoreModifier" } }
    );
  }

  // Validate enum values if provided and not null
  if (input.environment !== undefined && input.environment !== null) {
    if (!VALID_ENVIRONMENTS.has(input.environment)) {
      throw new ValidationError(`Invalid environment: ${input.environment}`, {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "environment" },
      });
    }
  }

  if (input.blastRadius !== undefined && input.blastRadius !== null) {
    if (!VALID_BLAST_RADIUS.has(input.blastRadius)) {
      throw new ValidationError(`Invalid blast radius: ${input.blastRadius}`, {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "blastRadius" },
      });
    }
  }

  if (input.reversibility !== undefined && input.reversibility !== null) {
    if (!VALID_REVERSIBILITY.has(input.reversibility)) {
      throw new ValidationError(`Invalid reversibility: ${input.reversibility}`, {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "reversibility" },
      });
    }
  }

  if (input.dataImpact !== undefined && input.dataImpact !== null) {
    if (!VALID_DATA_IMPACT.has(input.dataImpact)) {
      throw new ValidationError(`Invalid data impact: ${input.dataImpact}`, {
        operation: "validateUpdateRiskRuleInput",
        metadata: { field: "dataImpact" },
      });
    }
  }
};

/**
 * Validates CreateRiskAssessmentInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateRiskAssessmentInput = (input: CreateRiskAssessmentInput): void => {
  const failedRule = CREATE_ASSESSMENT_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule) {
    const metadata: Record<string, unknown> = { field: failedRule.field };
    if (failedRule.getValue) {
      metadata.value = failedRule.getValue(input);
    }
    throw new ValidationError(failedRule.message, {
      operation: "validateRiskAssessmentInput",
      metadata,
    });
  }

  if (!VALID_BLAST_RADIUS.has(input.blastRadius)) {
    throw new ValidationError(`Invalid blast radius: ${input.blastRadius}`, {
      operation: "validateRiskAssessmentInput",
      metadata: { field: "blastRadius" },
    });
  }

  if (!VALID_REVERSIBILITY.has(input.reversibility)) {
    throw new ValidationError(`Invalid reversibility: ${input.reversibility}`, {
      operation: "validateRiskAssessmentInput",
      metadata: { field: "reversibility" },
    });
  }

  if (!VALID_DATA_IMPACT.has(input.dataImpact)) {
    throw new ValidationError(`Invalid data impact: ${input.dataImpact}`, {
      operation: "validateRiskAssessmentInput",
      metadata: { field: "dataImpact" },
    });
  }

  if (!VALID_RISK_LEVELS.has(input.riskLevel)) {
    throw new ValidationError(`Invalid risk level: ${input.riskLevel}`, {
      operation: "validateRiskAssessmentInput",
      metadata: { field: "riskLevel" },
    });
  }

  if (input.environment !== undefined && !VALID_ENVIRONMENTS.has(input.environment)) {
    throw new ValidationError(`Invalid environment: ${input.environment}`, {
      operation: "validateRiskAssessmentInput",
      metadata: { field: "environment" },
    });
  }
};

/**
 * Validates and normalizes query options for risk rules.
 *
 * @throws ValidationError if tenantId is missing
 */
export const validateRiskRulesQueryOptions = (
  options: RiskRulesQueryOptions
): Required<Omit<RiskRulesQueryOptions, "actionType" | "environment">> &
  Pick<RiskRulesQueryOptions, "actionType" | "environment"> => {
  if (!options.tenantId || options.tenantId.trim().length === 0) {
    throw new ValidationError("Tenant ID is required for querying risk rules", {
      operation: "validateRiskRulesQueryOptions",
      metadata: { field: "tenantId" },
    });
  }

  const limit = Math.min(
    Math.max(1, options.limit ?? RISK_RULE_DEFAULTS.QUERY_LIMIT),
    RISK_RULE_DEFAULTS.MAX_QUERY_LIMIT
  );

  return {
    tenantId: options.tenantId,
    actionType: options.actionType,
    environment: options.environment,
    enabledOnly: options.enabledOnly ?? true,
    limit,
    offset: Math.max(0, options.offset ?? 0),
  };
};

/**
 * Validates and normalizes query options for assessments.
 *
 * @throws ValidationError if tenantId is missing
 */
export const validateAssessmentsQueryOptions = (
  options: RiskAssessmentsQueryOptions
): Required<
  Omit<
    RiskAssessmentsQueryOptions,
    "actionProposalId" | "actionType" | "minRiskLevel" | "fromDate" | "toDate"
  >
> &
  Pick<
    RiskAssessmentsQueryOptions,
    "actionProposalId" | "actionType" | "minRiskLevel" | "fromDate" | "toDate"
  > => {
  if (!options.tenantId || options.tenantId.trim().length === 0) {
    throw new ValidationError("Tenant ID is required for querying assessments", {
      operation: "validateAssessmentsQueryOptions",
      metadata: { field: "tenantId" },
    });
  }

  const limit = Math.min(
    Math.max(1, options.limit ?? RISK_RULE_DEFAULTS.QUERY_LIMIT),
    RISK_RULE_DEFAULTS.MAX_QUERY_LIMIT
  );

  return {
    tenantId: options.tenantId,
    actionProposalId: options.actionProposalId,
    actionType: options.actionType,
    minRiskLevel: options.minRiskLevel,
    fromDate: options.fromDate,
    toDate: options.toDate,
    limit,
    offset: Math.max(0, options.offset ?? 0),
  };
};
