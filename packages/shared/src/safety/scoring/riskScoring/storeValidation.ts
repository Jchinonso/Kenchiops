/**
 * Risk Rules Store Validation
 *
 * Validation functions for risk rules store operations.
 *
 * @module safety/scoring/riskScoring/storeValidation
 */

import { ValidationError } from "../../../core/errors.js";
import {
  RISK_RULE_DEFAULTS,
  VALID_ENVIRONMENTS,
  VALID_BLAST_RADIUS,
  VALID_REVERSIBILITY,
  VALID_DATA_IMPACT,
  VALID_RISK_LEVELS,
  type CreateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
} from "../../../database/riskRules/types.js";

// ==================== Helper Validators ====================

/**
 * Validates a multiplier value.
 */
const validateMultiplier = (value: number | undefined, field: string): void => {
  if (
    value !== undefined &&
    (value < RISK_RULE_DEFAULTS.MIN_MULTIPLIER || value > RISK_RULE_DEFAULTS.MAX_MULTIPLIER)
  ) {
    throw new ValidationError(
      `${field} must be between ${RISK_RULE_DEFAULTS.MIN_MULTIPLIER} and ${RISK_RULE_DEFAULTS.MAX_MULTIPLIER}`,
      { operation: "validateCreateInput", metadata: { field } }
    );
  }
};

/**
 * Validates a threshold value.
 */
const validateThreshold = (value: number | undefined, field: string): void => {
  if (
    value !== undefined &&
    (value < RISK_RULE_DEFAULTS.MIN_THRESHOLD || value > RISK_RULE_DEFAULTS.MAX_THRESHOLD)
  ) {
    throw new ValidationError(
      `${field} must be between ${RISK_RULE_DEFAULTS.MIN_THRESHOLD} and ${RISK_RULE_DEFAULTS.MAX_THRESHOLD}`,
      { operation: "validateCreateInput", metadata: { field } }
    );
  }
};

// ==================== Rule Validation ====================

/**
 * Validates CreateCustomRiskRuleInput.
 * Throws ValidationError for invalid input.
 */
export const validateCreateRuleInput = (input: CreateCustomRiskRuleInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("Tenant ID is required", {
      operation: "validateCreateInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.name?.trim()) {
    throw new ValidationError("Rule name is required", {
      operation: "validateCreateInput",
      metadata: { field: "name" },
    });
  }

  if (input.name.length > 255) {
    throw new ValidationError("Rule name cannot exceed 255 characters", {
      operation: "validateCreateInput",
      metadata: { field: "name", length: input.name.length },
    });
  }

  if (!input.actionTypes?.length) {
    throw new ValidationError("At least one action type is required", {
      operation: "validateCreateInput",
      metadata: { field: "actionTypes" },
    });
  }

  if (input.actionTypes.some((actionType) => !actionType?.trim())) {
    throw new ValidationError("Action types cannot contain empty values", {
      operation: "validateCreateInput",
      metadata: { field: "actionTypes" },
    });
  }

  // Validate enum values
  if (input.environment !== undefined && !VALID_ENVIRONMENTS.has(input.environment)) {
    throw new ValidationError(`Invalid environment: ${input.environment}`, {
      operation: "validateCreateInput",
      metadata: { field: "environment", value: input.environment },
    });
  }

  if (input.blastRadius !== undefined && !VALID_BLAST_RADIUS.has(input.blastRadius)) {
    throw new ValidationError(`Invalid blast radius: ${input.blastRadius}`, {
      operation: "validateCreateInput",
      metadata: { field: "blastRadius", value: input.blastRadius },
    });
  }

  if (input.reversibility !== undefined && !VALID_REVERSIBILITY.has(input.reversibility)) {
    throw new ValidationError(`Invalid reversibility: ${input.reversibility}`, {
      operation: "validateCreateInput",
      metadata: { field: "reversibility", value: input.reversibility },
    });
  }

  if (input.dataImpact !== undefined && !VALID_DATA_IMPACT.has(input.dataImpact)) {
    throw new ValidationError(`Invalid data impact: ${input.dataImpact}`, {
      operation: "validateCreateInput",
      metadata: { field: "dataImpact", value: input.dataImpact },
    });
  }

  // Validate numeric ranges
  if (
    input.scoreModifier !== undefined &&
    (input.scoreModifier < RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER ||
      input.scoreModifier > RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER)
  ) {
    throw new ValidationError(
      `Score modifier must be between ${RISK_RULE_DEFAULTS.MIN_SCORE_MODIFIER} and ${RISK_RULE_DEFAULTS.MAX_SCORE_MODIFIER}`,
      { operation: "validateCreateInput", metadata: { field: "scoreModifier" } }
    );
  }

  validateMultiplier(input.productionMultiplier, "productionMultiplier");
  validateMultiplier(input.incidentModeMultiplier, "incidentModeMultiplier");
  validateMultiplier(input.offHoursMultiplier, "offHoursMultiplier");
  validateThreshold(input.requireApprovalThreshold, "requireApprovalThreshold");
  validateThreshold(input.blockThreshold, "blockThreshold");
};

// ==================== Assessment Validation ====================

/**
 * Validates CreateRiskAssessmentInput.
 */
export const validateAssessmentInput = (input: CreateRiskAssessmentInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("Tenant ID is required", {
      operation: "validateAssessmentInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.actionType?.trim()) {
    throw new ValidationError("Action type is required", {
      operation: "validateAssessmentInput",
      metadata: { field: "actionType" },
    });
  }

  if (!Number.isFinite(input.baseScore) || input.baseScore < 0 || input.baseScore > 1) {
    throw new ValidationError("Base score must be between 0 and 1", {
      operation: "validateAssessmentInput",
      metadata: { field: "baseScore", value: input.baseScore },
    });
  }

  if (!Number.isFinite(input.finalScore) || input.finalScore < 0 || input.finalScore > 1) {
    throw new ValidationError("Final score must be between 0 and 1", {
      operation: "validateAssessmentInput",
      metadata: { field: "finalScore", value: input.finalScore },
    });
  }

  if (!input.summary?.trim()) {
    throw new ValidationError("Summary is required", {
      operation: "validateAssessmentInput",
      metadata: { field: "summary" },
    });
  }

  if (!VALID_BLAST_RADIUS.has(input.blastRadius)) {
    throw new ValidationError(`Invalid blast radius: ${input.blastRadius}`, {
      operation: "validateAssessmentInput",
      metadata: { field: "blastRadius" },
    });
  }

  if (!VALID_REVERSIBILITY.has(input.reversibility)) {
    throw new ValidationError(`Invalid reversibility: ${input.reversibility}`, {
      operation: "validateAssessmentInput",
      metadata: { field: "reversibility" },
    });
  }

  if (!VALID_DATA_IMPACT.has(input.dataImpact)) {
    throw new ValidationError(`Invalid data impact: ${input.dataImpact}`, {
      operation: "validateAssessmentInput",
      metadata: { field: "dataImpact" },
    });
  }

  if (!VALID_RISK_LEVELS.has(input.riskLevel)) {
    throw new ValidationError(`Invalid risk level: ${input.riskLevel}`, {
      operation: "validateAssessmentInput",
      metadata: { field: "riskLevel" },
    });
  }

  if (input.environment !== undefined && !VALID_ENVIRONMENTS.has(input.environment)) {
    throw new ValidationError(`Invalid environment: ${input.environment}`, {
      operation: "validateAssessmentInput",
      metadata: { field: "environment" },
    });
  }
};
