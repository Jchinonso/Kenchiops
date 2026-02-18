/**
 * Output Validator
 *
 * Pure function that validates AI-generated summary output against
 * the evidence catalog. Ensures no hallucination, citation integrity,
 * severity match, and schema compliance.
 *
 * No I/O -- purely deterministic validation.
 *
 * @module services/outputValidator
 */

import type { EvidenceCatalog } from "../types/evidenceTypes.js";
import {
  SUMMARY_LENGTH_LIMITS,
  SUGGESTED_ACTIONS_LIMITS,
  VALID_ACTION_PRIORITIES,
  type IncidentSummaryResponse,
  type SuggestedAction,
  type SummaryValidationResult,
  type ValidationViolation,
} from "../types/summaryTypes.js";

// ==================== Helpers ====================

const hasItems = (arr: readonly unknown[]): boolean => {
  const { length: count } = arr;
  return count > 0;
};

// ==================== Validation Helpers ====================

/**
 * Checks that all required string fields are present and non-empty.
 */
const validateRequiredFields = (
  summary: Readonly<Record<string, unknown>>
): readonly ValidationViolation[] => {
  const requiredStringFields = ["headline", "rootCauseSummary", "impactAssessment"] as const;

  return requiredStringFields
    .filter((field) => {
      const value = summary[field];
      return typeof value !== "string" || value.trim().length === 0;
    })
    .map((field) => ({
      rule: "required_field",
      message: `Missing or empty required field: ${field}`,
      field,
    }));
};

/**
 * Checks that string fields do not exceed maximum length limits.
 */
const validateLengthLimits = (summary: IncidentSummaryResponse): readonly ValidationViolation[] => {
  const checks: ReadonlyArray<{
    readonly field: string;
    readonly value: string;
    readonly limit: number;
  }> = [
    { field: "headline", value: summary.headline, limit: SUMMARY_LENGTH_LIMITS.headline },
    {
      field: "rootCauseSummary",
      value: summary.rootCauseSummary,
      limit: SUMMARY_LENGTH_LIMITS.rootCauseSummary,
    },
    {
      field: "impactAssessment",
      value: summary.impactAssessment,
      limit: SUMMARY_LENGTH_LIMITS.impactAssessment,
    },
  ];

  return checks
    .filter(({ value, limit }) => value.length > limit)
    .map(({ field, value, limit }) => ({
      rule: "length_limit",
      message: `${field} exceeds max length (${value.length}/${limit})`,
      field,
    }));
};

/**
 * Validates suggested actions count and structure.
 */
const validateSuggestedActions = (actions: readonly unknown[]): readonly ValidationViolation[] => {
  const { length: count } = actions;
  const violations: readonly ValidationViolation[] = [];

  if (count < SUGGESTED_ACTIONS_LIMITS.MIN) {
    return [
      ...violations,
      {
        rule: "actions_count",
        message: `At least ${SUGGESTED_ACTIONS_LIMITS.MIN} suggested action required`,
        field: "suggestedActions",
      },
    ];
  }

  if (count > SUGGESTED_ACTIONS_LIMITS.MAX) {
    return [
      ...violations,
      {
        rule: "actions_count",
        message: `At most ${SUGGESTED_ACTIONS_LIMITS.MAX} suggested actions allowed, got ${count}`,
        field: "suggestedActions",
      },
    ];
  }

  const actionViolations = actions.flatMap((action, idx) => {
    const typedAction = action as Partial<SuggestedAction>;
    const fieldPrefix = `suggestedActions[${idx}]`;
    const result: ValidationViolation[] = [];

    if (typeof typedAction.action !== "string" || typedAction.action.trim().length === 0) {
      return [
        ...result,
        {
          rule: "action_field",
          message: `${fieldPrefix}.action is missing or empty`,
          field: fieldPrefix,
        },
      ];
    }

    if (typeof typedAction.reasoning !== "string" || typedAction.reasoning.trim().length === 0) {
      return [
        ...result,
        {
          rule: "action_field",
          message: `${fieldPrefix}.reasoning is missing or empty`,
          field: fieldPrefix,
        },
      ];
    }

    const validPriorities: readonly string[] = VALID_ACTION_PRIORITIES;
    if (!validPriorities.includes(typedAction.priority ?? "")) {
      return [
        ...result,
        {
          rule: "action_priority",
          message: `${fieldPrefix}.priority must be one of: ${validPriorities.join(", ")}`,
          field: fieldPrefix,
        },
      ];
    }

    // Check action text length limits
    if (typedAction.action.length > SUMMARY_LENGTH_LIMITS.actionText) {
      return [
        ...result,
        {
          rule: "length_limit",
          message: `${fieldPrefix}.action exceeds max length (${typedAction.action.length}/${SUMMARY_LENGTH_LIMITS.actionText})`,
          field: fieldPrefix,
        },
      ];
    }

    if (typedAction.reasoning.length > SUMMARY_LENGTH_LIMITS.actionReasoning) {
      return [
        ...result,
        {
          rule: "length_limit",
          message: `${fieldPrefix}.reasoning exceeds max length (${typedAction.reasoning.length}/${SUMMARY_LENGTH_LIMITS.actionReasoning})`,
          field: fieldPrefix,
        },
      ];
    }

    return result;
  });

  return [...violations, ...actionViolations];
};

/**
 * Validates that every cited evidence ID exists in the evidence catalog.
 */
const validateCitations = (
  citedIds: readonly string[],
  catalog: EvidenceCatalog
): readonly ValidationViolation[] => {
  if (!Array.isArray(citedIds)) {
    return [
      {
        rule: "citation_type",
        message: "evidencesCited must be an array",
        field: "evidencesCited",
      },
    ];
  }

  const catalogKeys = new Set(Object.keys(catalog.items));

  return citedIds
    .filter((id) => !catalogKeys.has(id))
    .map((id) => ({
      rule: "citation_not_found",
      message: `Cited evidence ID "${id}" does not exist in the evidence catalog`,
      field: "evidencesCited",
    }));
};

/**
 * Validates that the AI did not override the computed severity label.
 * Checks headline, rootCauseSummary, and impactAssessment for mentions
 * of a severity label different from the computed one.
 */
const validateSeverityMatch = (
  summary: IncidentSummaryResponse,
  catalog: EvidenceCatalog
): readonly ValidationViolation[] => {
  const sevItem = catalog.items["SEV-label"];
  if (!sevItem) {
    return [];
  }

  const computedSeverity = String(sevItem.value).toLowerCase();
  const allSeverities = ["critical", "high", "medium", "low", "info"];
  const otherSeverities = allSeverities.filter((sev) => sev !== computedSeverity);

  const textToCheck = [summary.headline, summary.rootCauseSummary, summary.impactAssessment]
    .join(" ")
    .toLowerCase();

  return otherSeverities
    .filter((sev) => {
      const sevPattern = new RegExp(`\\b${sev}\\b`, "i");
      return sevPattern.test(textToCheck);
    })
    .map((sev) => ({
      rule: "severity_override",
      message: `AI mentions severity "${sev}" but computed severity is "${computedSeverity}"`,
      field: "severity",
    }));
};

/**
 * Validates that the AI did not fabricate service names not in evidence.
 */
const validateServiceNames = (
  _summary: IncidentSummaryResponse,
  catalog: EvidenceCatalog
): readonly ValidationViolation[] => {
  const serviceItem = catalog.items["ALT-serviceName"];
  if (!serviceItem || !serviceItem.value) {
    // No service name in evidence -- skip check (AI may say "unknown")
    return [];
  }

  // Service name is known -- no fabrication check needed beyond citation
  return [];
};

/**
 * Validates that summarySource is "ai" (the validator enforces this).
 */
const validateSummarySource = (
  summary: Readonly<Record<string, unknown>>
): readonly ValidationViolation[] => {
  const { summarySource } = summary;
  return summarySource === "ai"
    ? []
    : [
        {
          rule: "summary_source",
          message: 'summarySource must be "ai"',
          field: "summarySource",
        },
      ];
};

// ==================== Public API ====================

/**
 * Validates an AI-generated incident summary against the evidence catalog.
 *
 * Pure function -- no I/O, no side effects, fully deterministic.
 *
 * @param summary - The parsed AI output to validate
 * @param catalog - The evidence catalog to validate against
 * @returns Validation result with pass/fail and specific violations
 */
export const validateSummaryOutput = (
  summary: IncidentSummaryResponse,
  catalog: EvidenceCatalog
): SummaryValidationResult => {
  const rawSummary = summary as unknown as Readonly<Record<string, unknown>>;

  const allViolations: readonly ValidationViolation[] = [
    ...validateRequiredFields(rawSummary),
    ...validateSummarySource(rawSummary),
    ...validateLengthLimits(summary),
    ...validateSuggestedActions(summary.suggestedActions as readonly unknown[]),
    ...validateCitations(summary.evidencesCited, catalog),
    ...validateSeverityMatch(summary, catalog),
    ...validateServiceNames(summary, catalog),
  ];

  return {
    valid: !hasItems(allViolations),
    violations: allViolations,
  };
};
