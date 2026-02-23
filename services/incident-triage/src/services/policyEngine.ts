/**
 * Policy Engine
 *
 * Pure function that evaluates deterministic routing rules against a triage context.
 * No I/O -- all inputs provided as arguments.
 *
 * Rules are evaluated in priority order (lowest number first).
 * All matching rules contribute targets. Duplicate targets (same type + channel)
 * are deduplicated. If no rules match, the decision has zero targets.
 *
 * @module services/policyEngine
 */

import { deduplicateByKey } from "@kenchi/shared";
import type {
  PolicyRule,
  PolicyCondition,
  RoutingDecision,
  DispatchTarget,
  MatchedRule,
  TriagePolicyContext,
} from "../types/policyTypes.js";

// ==================== Helpers ====================

/** Type guard: returns true when the array has at least one element */
const hasEntries = <T>(arr: readonly T[] | undefined): arr is readonly [T, ...(readonly T[])] =>
  arr !== undefined && arr.length > 0;

// ==================== Condition Matchers ====================

/**
 * Checks whether a severity matches the condition's allowed severities.
 * Empty or undefined severity list means "match any".
 */
const matchesSeverity = (
  { severity: allowedSeverities }: PolicyCondition,
  severityLabel: string
): boolean => {
  if (hasEntries(allowedSeverities)) {
    return allowedSeverities.some((allowed) => allowed === severityLabel);
  }
  return true;
};

/**
 * Checks whether an environment matches the condition's allowed environments.
 * Empty or undefined environment list means "match any".
 * Null environment in the context matches only wildcard conditions.
 */
const matchesEnvironment = (
  { environment: allowedEnvironments }: PolicyCondition,
  environment: string | null
): boolean => {
  if (hasEntries(allowedEnvironments)) {
    if (environment === null) {
      return false;
    }
    const normalizedEnv = environment.toLowerCase();
    return allowedEnvironments.some((allowed) => allowed.toLowerCase() === normalizedEnv);
  }
  return true;
};

/**
 * Checks the environment exclusion list.
 * If environmentExclude is defined and the environment matches it, the rule does NOT match.
 * Null environment is NOT excluded (it's unknown, so exclusion doesn't apply).
 */
const passesEnvironmentExclusion = (
  { environmentExclude }: PolicyCondition,
  environment: string | null
): boolean => {
  if (hasEntries(environmentExclude)) {
    if (environment === null) {
      return true;
    }
    const normalizedEnv = environment.toLowerCase();
    return environmentExclude.every((excluded) => excluded.toLowerCase() !== normalizedEnv);
  }
  return true;
};

/**
 * Checks whether a service name matches the condition's allowed service patterns.
 * Empty or undefined serviceMatch means "match any".
 */
const matchesService = ({ serviceMatch }: PolicyCondition, serviceName: string | null): boolean => {
  if (hasEntries(serviceMatch)) {
    if (serviceName === null) {
      return false;
    }
    const normalizedService = serviceName.toLowerCase();
    return serviceMatch.some((pattern) => normalizedService.includes(pattern.toLowerCase()));
  }
  return true;
};

/**
 * Evaluates whether a single rule's conditions are satisfied by the triage context.
 */
const evaluateCondition = (
  condition: PolicyCondition,
  triageContext: TriagePolicyContext
): boolean =>
  matchesSeverity(condition, triageContext.severityLabel) &&
  matchesEnvironment(condition, triageContext.environment) &&
  passesEnvironmentExclusion(condition, triageContext.environment) &&
  matchesService(condition, triageContext.serviceName);

// ==================== Target Deduplication ====================

/**
 * Deduplicates dispatch targets by type+channel, keeping the first occurrence.
 */
const deduplicateTargets = (targets: readonly DispatchTarget[]): readonly DispatchTarget[] =>
  deduplicateByKey(targets, (target) => `${target.type}:${target.channel}`);

// ==================== Rule Sorting ====================

/**
 * Returns rules sorted by priority (ascending).
 */
const sortByPriority = (rules: readonly PolicyRule[]): readonly PolicyRule[] =>
  [...rules].sort((ruleA, ruleB) => ruleA.priority - ruleB.priority);

// ==================== Match Reason Builder ====================

/**
 * Builds a human-readable reason string for why a rule matched.
 */
const buildMatchReason = (rule: PolicyRule, triageContext: TriagePolicyContext): string => {
  const { condition } = rule;
  const {
    severity: condSev,
    environment: condEnv,
    environmentExclude: condExcl,
    serviceMatch: condSvc,
  } = condition;
  const parts: readonly string[] = [
    ...(hasEntries(condSev) ? [`severity=${triageContext.severityLabel}`] : []),
    ...(hasEntries(condEnv) ? [`environment=${triageContext.environment ?? "unknown"}`] : []),
    ...(hasEntries(condExcl) ? [`environment not in [${condExcl.join(", ")}]`] : []),
    ...(hasEntries(condSvc) ? [`service matches [${condSvc.join(", ")}]`] : []),
  ];

  const { length: partCount } = parts;
  return partCount > 0
    ? `Rule "${rule.name}" matched: ${parts.join(", ")}`
    : `Rule "${rule.name}" matched (default/wildcard)`;
};

// ==================== Public API ====================

/**
 * Evaluates a set of policy rules against a triage context and returns
 * a routing decision with accumulated dispatch targets.
 *
 * This is a pure function: deterministic, no side effects, no I/O.
 *
 * @param triageContext - The triage data to evaluate
 * @param rules - Policy rules to evaluate in priority order
 * @returns Routing decision with targets and audit trail
 */
export const evaluatePolicy = (
  triageContext: TriagePolicyContext,
  rules: readonly PolicyRule[]
): RoutingDecision => {
  const sortedRules = sortByPriority(rules);
  const enabledRules = sortedRules.filter((rule) => rule.enabled);

  const accumulated = enabledRules
    .filter((rule) => evaluateCondition(rule.condition, triageContext))
    .map((rule) => ({
      targets: rule.targets,
      matched: {
        ruleId: rule.id,
        ruleName: rule.name,
        reason: buildMatchReason(rule, triageContext),
      } satisfies MatchedRule,
    }));

  const allTargets = accumulated.flatMap((entry) => [...entry.targets]);
  const matchedRules = accumulated.map((entry) => entry.matched);
  const deduplicatedTargets = deduplicateTargets(allTargets);
  const { length: targetCount } = deduplicatedTargets;
  const suppressed = targetCount < 1;

  return {
    targets: deduplicatedTargets,
    matchedRules,
    suppressed,
    suppressionReasons: suppressed
      ? [{ ruleId: "NONE", reason: "No policy rules matched the triage context" }]
      : [],
    evaluatedAt: new Date().toISOString(),
  };
};
