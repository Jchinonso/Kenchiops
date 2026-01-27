/**
 * Risk Rules Helpers
 *
 * Utility functions for risk rules operations.
 * Includes security helpers and matching logic.
 *
 * @module database/riskRules/helpers
 */

import type {
  CreateCustomRiskRuleInput,
  UpdateCustomRiskRuleInput,
  RiskEnvironment,
} from "./types.js";

// ==================== Security Helpers ====================

/**
 * Sanitizes a string for safe logging.
 * Truncates long values to prevent log bloat.
 *
 * @param value - Value to sanitize
 * @param maxLength - Maximum length (default: 100)
 * @returns Sanitized string safe for logging
 */
export const sanitizeForLogging = (value: string | null | undefined, maxLength = 100): string => {
  if (value === null || value === undefined) {
    return "<null>";
  }

  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.substring(0, maxLength)}...[truncated]`;
};

/**
 * Creates a safe log context from a rule input.
 * Excludes or truncates potentially large/sensitive fields.
 *
 * @param input - Rule input
 * @returns Safe object for logging
 */
export const createRuleLogContext = (
  input: CreateCustomRiskRuleInput | UpdateCustomRiskRuleInput
): Record<string, unknown> => ({
  name: "name" in input ? sanitizeForLogging(input.name, 50) : undefined,
  actionTypesCount: "actionTypes" in input ? input.actionTypes?.length : undefined,
  environment: "environment" in input ? input.environment : undefined,
  enabled: "enabled" in input ? input.enabled : undefined,
  priority: "priority" in input ? input.priority : undefined,
});

// ==================== Matching Helpers ====================

/**
 * Checks if action type matches any in the rule's action types array.
 * Case-insensitive matching for flexibility.
 *
 * @param ruleActionTypes - Action types from rule
 * @param targetActionType - Action type to match
 * @returns True if match found
 */
export const matchesActionType = (
  ruleActionTypes: readonly string[],
  targetActionType: string
): boolean => {
  const normalizedTarget = targetActionType.toLowerCase();
  return ruleActionTypes.some((at) => at.toLowerCase() === normalizedTarget);
};

/**
 * Checks if rule applies to given environment.
 * NULL environment in rule means "all environments".
 *
 * @param ruleEnvironment - Environment from rule (null = all)
 * @param targetEnvironment - Target environment
 * @returns True if rule applies
 */
export const matchesEnvironment = (
  ruleEnvironment: RiskEnvironment | null,
  targetEnvironment: RiskEnvironment | undefined
): boolean => {
  // Rule with null environment applies to all
  if (ruleEnvironment === null) {
    return true;
  }

  // If no target environment specified, only match rules with null environment
  if (targetEnvironment === undefined) {
    return false;
  }

  return ruleEnvironment === targetEnvironment;
};

/**
 * Filters rules by action type and environment.
 *
 * @param rules - Rules to filter
 * @param actionType - Action type to match (optional)
 * @param environment - Environment to match (optional)
 * @returns Filtered rules
 */
export const filterRulesByContext = <
  T extends {
    readonly actionTypes: readonly string[];
    readonly environment: RiskEnvironment | null;
  },
>(
  rules: readonly T[],
  actionType?: string,
  environment?: RiskEnvironment
): readonly T[] => {
  let filtered = rules;

  if (actionType) {
    filtered = filtered.filter((rule) => matchesActionType(rule.actionTypes, actionType));
  }

  if (environment !== undefined) {
    filtered = filtered.filter((rule) => matchesEnvironment(rule.environment, environment));
  }

  return filtered;
};

// ==================== ID Helpers ====================

/**
 * Generates a prefixed ID for risk rules.
 *
 * @returns New rule ID
 */
export const generateRuleId = (): string => `rule_${crypto.randomUUID()}`;

/**
 * Generates a prefixed ID for risk assessments.
 *
 * @returns New assessment ID
 */
export const generateAssessmentId = (): string => `assess_${crypto.randomUUID()}`;
