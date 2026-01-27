/**
 * Risk Scoring Helpers
 *
 * Pure utility functions, constants, and lookup tables for contextual risk scoring.
 *
 * @module safety/scoring/riskScoring/helpers
 */

import type { BlastRadius, Reversibility, DataImpact } from "../../types.js";
import type {
  ResolvedRiskContext,
  ApprovalRequirements,
  ContextFactorsBreakdown,
  AppliedRuleSummary,
  ContextAdjustmentResult,
  MultiplierEntry,
  CustomMultipliers,
  SummaryDetailEntry,
  SummaryContext,
  GenerateSummaryInput,
  ApprovalReasonEntry,
  ApprovalReasonContext,
  RiskLevelRule,
  OffHoursCheckContext,
  OffHoursCheckEntry,
  ContextFlagEntry,
  BuildAppliedRulesInput,
  BuildContextFactorsInput,
} from "./types.js";
import type { CustomRiskRule, RiskEnvironment } from "../../../database/riskRules/types.js";
import {
  ACTION_RISK_WEIGHTS,
  BLAST_RADIUS_SCORES,
  REVERSIBILITY_SCORES,
  DATA_IMPACT_SCORES,
  RISK_LEVEL_THRESHOLDS,
  CONTEXT_MULTIPLIERS,
  CONTEXT_MULTIPLIER_BOUNDS,
  PLATFORM_THRESHOLDS,
  OFF_HOURS_CONFIG,
  type RiskLevel,
  type RiskRuleCategory,
} from "../../../constants/safety.js";

// ==================== Constants ====================

/** Default tenant ID when none provided */
export const DEFAULT_TENANT_ID = "default";

/** Default environment when none provided */
export const DEFAULT_ENVIRONMENT: RiskEnvironment = "production";

// ==================== Off-Hours Detection ====================

/** Checks if night spans midnight (e.g., 22:00 - 06:00) */
const isNightSpanningMidnight = (): boolean =>
  OFF_HOURS_CONFIG.NIGHT_START_HOUR > OFF_HOURS_CONFIG.NIGHT_END_HOUR;

/** Checks if night does NOT span midnight */
const isNightContiguousRange = (): boolean =>
  OFF_HOURS_CONFIG.NIGHT_START_HOUR <= OFF_HOURS_CONFIG.NIGHT_END_HOUR;

/** Checks if hour is in night range when night spans midnight */
const isInNightRangeSpanning = (utcHour: number): boolean =>
  utcHour >= OFF_HOURS_CONFIG.NIGHT_START_HOUR || utcHour < OFF_HOURS_CONFIG.NIGHT_END_HOUR;

/** Checks if hour is in night range when night is contiguous (doesn't span midnight) */
const isInNightRangeContiguous = (utcHour: number): boolean =>
  utcHour >= OFF_HOURS_CONFIG.NIGHT_START_HOUR && utcHour < OFF_HOURS_CONFIG.NIGHT_END_HOUR;

/** Off-hours check lookup table - first match returns true */
const OFF_HOURS_CHECKS: readonly OffHoursCheckEntry[] = [
  { check: (offHoursCtx) => OFF_HOURS_CONFIG.WEEKEND_DAYS.includes(offHoursCtx.utcDay) },
  {
    check: (offHoursCtx) =>
      isNightSpanningMidnight() && isInNightRangeSpanning(offHoursCtx.utcHour),
  },
  {
    check: (offHoursCtx) =>
      isNightContiguousRange() && isInNightRangeContiguous(offHoursCtx.utcHour),
  },
];

/**
 * Checks if given time context is off-hours.
 */
export const checkOffHours = (offHoursCtx: OffHoursCheckContext): boolean =>
  OFF_HOURS_CHECKS.some((entry) => entry.check(offHoursCtx));

// ==================== Risk Level Calculation ====================

/** Risk level thresholds in descending order. First match wins. */
const RISK_LEVEL_RULES: readonly RiskLevelRule[] = [
  { minScore: RISK_LEVEL_THRESHOLDS.HIGH, level: "critical" },
  { minScore: RISK_LEVEL_THRESHOLDS.MODERATE, level: "high" },
  { minScore: RISK_LEVEL_THRESHOLDS.LOW, level: "moderate" },
  { minScore: 0, level: "low" },
];

/**
 * Determines risk level from composite score.
 */
export const getRiskLevel = (score: number): RiskLevel => {
  const match = RISK_LEVEL_RULES.find((rule) => score >= rule.minScore);
  return match?.level ?? "low";
};

// ==================== Composite Score Calculation ====================

/**
 * Calculates composite risk score from individual factors.
 */
export const calculateCompositeScore = (
  blastRadius: BlastRadius,
  reversibility: Reversibility,
  dataImpact: DataImpact
): number => {
  const blastScore = BLAST_RADIUS_SCORES[blastRadius] * ACTION_RISK_WEIGHTS.BLAST_RADIUS;
  const reverseScore = REVERSIBILITY_SCORES[reversibility] * ACTION_RISK_WEIGHTS.REVERSIBILITY;
  const dataScore = DATA_IMPACT_SCORES[dataImpact] * ACTION_RISK_WEIGHTS.DATA_IMPACT;

  return Math.min(1, blastScore + reverseScore + dataScore);
};

// ==================== Context Multiplier Calculation ====================

/** Context multiplier lookup table */
const CONTEXT_MULTIPLIER_ENTRIES: readonly MultiplierEntry[] = [
  {
    condition: (resolvedCtx) => resolvedCtx.environment === "production",
    getMultiplier: (custom) => custom ?? CONTEXT_MULTIPLIERS.PRODUCTION,
  },
  {
    condition: (resolvedCtx) => resolvedCtx.incidentModeActive,
    getMultiplier: (custom) => custom ?? CONTEXT_MULTIPLIERS.INCIDENT_MODE,
  },
  {
    condition: (resolvedCtx) => resolvedCtx.isOffHours,
    getMultiplier: (custom) => custom ?? CONTEXT_MULTIPLIERS.OFF_HOURS,
  },
];

/** Maps multiplier entries to custom multiplier values */
const getCustomMultiplierValue = (
  index: number,
  customMultipliers?: CustomMultipliers
): number | undefined => {
  const mapping = [
    customMultipliers?.production,
    customMultipliers?.incidentMode,
    customMultipliers?.offHours,
  ];
  return mapping[index];
};

/**
 * Calculates context adjustment based on environment and situation.
 */
export const calculateContextAdjustment = (
  baseScore: number,
  resolvedCtx: ResolvedRiskContext,
  customMultipliers?: CustomMultipliers
): ContextAdjustmentResult => {
  // Calculate raw multiplier using lookup table
  const rawMultiplier = CONTEXT_MULTIPLIER_ENTRIES.reduce(
    (multiplier, entry, index) =>
      entry.condition(resolvedCtx)
        ? multiplier * entry.getMultiplier(getCustomMultiplierValue(index, customMultipliers))
        : multiplier,
    1.0
  );

  // Guard rail: clamp multiplier to prevent saturation
  const multiplier = Math.max(
    CONTEXT_MULTIPLIER_BOUNDS.MIN,
    Math.min(CONTEXT_MULTIPLIER_BOUNDS.MAX, rawMultiplier)
  );

  // Calculate adjustment: (multiplied score - base score)
  const adjustedScore = Math.min(1, baseScore * multiplier);
  const adjustment = adjustedScore - baseScore;

  return { adjustment, multiplier };
};

// ==================== Summary Generation ====================

/** Blast radius descriptions */
const BLAST_RADIUS_LABELS: Partial<Record<BlastRadius, string>> = {
  infrastructure: "affects infrastructure",
  multiple_services: "affects multiple services",
};

/** Reversibility descriptions (hard to undo cases) */
const REVERSIBILITY_LABELS: Partial<Record<Reversibility, string>> = {
  irreversible: "irreversible",
  manual_only: "requires manual rollback",
};

/** Data impact descriptions */
const DATA_IMPACT_LABELS: Partial<Record<DataImpact, string>> = {
  destructive: "destructive data impact",
};

/** Environment labels for summary */
const ENVIRONMENT_LABELS: Partial<Record<RiskEnvironment, string>> = {
  production: "production environment",
};

/** Context flag entries for boolean conditions */
const CONTEXT_FLAG_ENTRIES: readonly ContextFlagEntry[] = [
  { getFlag: (summaryCtx) => summaryCtx.context.incidentModeActive, label: "incident mode active" },
  { getFlag: (summaryCtx) => summaryCtx.context.isOffHours, label: "off-hours" },
];

/** Gets custom rule label if present */
const getCustomRuleLabel = (customRuleName?: string): string | undefined => {
  if (!customRuleName) {
    return undefined;
  }
  return `custom rule: ${customRuleName}`;
};

/** Summary detail entries lookup table */
const SUMMARY_DETAIL_ENTRIES: readonly SummaryDetailEntry[] = [
  { getDetail: (summaryCtx) => BLAST_RADIUS_LABELS[summaryCtx.blastRadius] },
  { getDetail: (summaryCtx) => REVERSIBILITY_LABELS[summaryCtx.reversibility] },
  { getDetail: (summaryCtx) => DATA_IMPACT_LABELS[summaryCtx.dataImpact] },
  { getDetail: (summaryCtx) => ENVIRONMENT_LABELS[summaryCtx.context.environment] },
];

/** Collects active context flags */
const collectContextFlags = (summaryCtx: SummaryContext): readonly string[] =>
  CONTEXT_FLAG_ENTRIES.filter((entry) => entry.getFlag(summaryCtx)).map((entry) => entry.label);

/** Capitalizes first letter of risk level */
const formatRiskLevelLabel = (riskLevel: RiskLevel): string =>
  riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);

/** Formats score as percentage string */
export const formatScorePercent = (score: number): string => `${(score * 100).toFixed(0)}%`;

/**
 * Generates human-readable risk summary with context.
 */
export const generateContextualSummary = (input: GenerateSummaryInput): string => {
  const header = `${formatRiskLevelLabel(input.riskLevel)} risk (${formatScorePercent(input.finalScore)})`;

  const summaryCtx: SummaryContext = {
    blastRadius: input.blastRadius,
    reversibility: input.reversibility,
    dataImpact: input.dataImpact,
    context: input.context,
    customRuleName: input.customRuleName,
  };

  const labelDetails = SUMMARY_DETAIL_ENTRIES.map((entry) => entry.getDetail(summaryCtx)).filter(
    (detail): detail is string => detail !== undefined
  );
  const flagDetails = collectContextFlags(summaryCtx);
  const customRuleDetail = getCustomRuleLabel(input.customRuleName);

  const allDetails = [...labelDetails, ...flagDetails, customRuleDetail].filter(
    (detail): detail is string => detail !== undefined
  );

  return [header, ...allDetails].join(", ");
};

// ==================== Approval Requirements ====================

/** Approval reason lookup table - first match wins */
const APPROVAL_REASON_ENTRIES: readonly ApprovalReasonEntry[] = [
  {
    condition: (reasonCtx) => reasonCtx.requiresAdditionalApproval,
    getReason: (reasonCtx) =>
      `Risk score ${formatScorePercent(reasonCtx.finalScore)} requires additional approval during incident mode`,
  },
  {
    condition: (reasonCtx) => reasonCtx.requiresApproval,
    getReason: (reasonCtx) =>
      `Risk score ${formatScorePercent(reasonCtx.finalScore)} exceeds approval threshold`,
  },
];

/** Default reason when no approval is required */
const DEFAULT_APPROVAL_REASON = "No approval required";

/**
 * Determines approval requirements based on risk and context.
 */
export const determineApprovalRequirements = (
  finalScore: number,
  resolvedCtx: ResolvedRiskContext,
  customRule?: CustomRiskRule
): ApprovalRequirements => {
  const approvalThreshold =
    customRule?.requireApprovalThreshold ?? PLATFORM_THRESHOLDS.MAX_APPROVAL_THRESHOLD;
  const requiresApproval = finalScore >= approvalThreshold;

  // Additional approval during incident mode for already-approved actions
  const requiresAdditionalApproval = resolvedCtx.incidentModeActive && requiresApproval;

  const reasonCtx: ApprovalReasonContext = {
    finalScore,
    requiresApproval,
    requiresAdditionalApproval,
  };

  const matchedEntry = APPROVAL_REASON_ENTRIES.find((entry) => entry.condition(reasonCtx));
  const reason = matchedEntry?.getReason(reasonCtx) ?? DEFAULT_APPROVAL_REASON;

  return {
    requiresApproval,
    requiresAdditionalApproval,
    reason,
  };
};

// ==================== Builder Functions ====================

/**
 * Builds context factors breakdown for audit/debugging.
 */
export const buildContextFactors = (input: BuildContextFactorsInput): ContextFactorsBreakdown => ({
  production: input.resolvedContext.environment === "production",
  incidentMode: input.resolvedContext.incidentModeActive,
  offHours: input.resolvedContext.isOffHours,
  multiplier: input.contextMultiplier,
});

/**
 * Builds applied custom rules list from custom rule.
 */
export const buildAppliedCustomRules = (input: BuildAppliedRulesInput): AppliedRuleSummary[] => {
  const { customRule } = input;

  if (!customRule) {
    return [];
  }

  return [
    {
      id: customRule.id,
      name: customRule.name,
      priority: customRule.priority,
      scoreModifier: customRule.scoreModifier ?? 0,
      overridesApplied: {
        blastRadius: customRule.blastRadius !== null,
        reversibility: customRule.reversibility !== null,
        dataImpact: customRule.dataImpact !== null,
        thresholds:
          customRule.requireApprovalThreshold !== null || customRule.blockThreshold !== null,
      },
    },
  ];
};

/**
 * Builds deprecated appliedCustomRule field for backwards compatibility.
 */
export const buildDeprecatedAppliedRule = (customRule?: {
  readonly id: string;
  readonly name: string;
}): { readonly id: string; readonly name: string } | undefined => {
  if (!customRule) {
    return undefined;
  }
  return { id: customRule.id, name: customRule.name };
};

/**
 * Resolves matched rule category for the response.
 * When a custom rule is applied, we report "default" as the base rule category.
 */
export const resolveMatchedRuleCategory = (
  category: RiskRuleCategory | "custom"
): RiskRuleCategory => {
  if (category === "custom") {
    return "default";
  }
  return category;
};

/**
 * Determines the rule category based on whether a custom rule is applied.
 */
export const determineRuleCategory = (
  customRule: CustomRiskRule | undefined,
  baseCategory: RiskRuleCategory
): RiskRuleCategory | "custom" => {
  if (customRule) {
    return "custom";
  }
  return baseCategory;
};

/**
 * Applies score modifier to composite score if present.
 */
export const applyScoreModifier = (
  compositeScore: number,
  scoreModifier: number | undefined | null
): number => {
  if (!scoreModifier) {
    return compositeScore;
  }
  return Math.min(1, Math.max(0, compositeScore + scoreModifier));
};
