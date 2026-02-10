/**
 * Time-Based Restrictions Module
 *
 * Enforces time-based and context-based restrictions on automated actions.
 * Prevents dangerous operations during sensitive periods or conditions.
 *
 * @module safety/gating/restrictions
 */

import type {
  RestrictionCheckResult,
  ActiveRestriction,
  RestrictionType,
  RestrictionRule,
  ScheduleConfig,
  RestrictionContext,
} from "../types.js";

// ==================== Constants ====================

/**
 * Default off-hours schedule (weekends and nights).
 */
const DEFAULT_OFF_HOURS: ScheduleConfig = {
  daysOfWeek: [0, 6], // Saturday, Sunday
  startHour: 22, // 10 PM UTC
  endHour: 6, // 6 AM UTC
} as const;

/**
 * Default restriction rules.
 */
const DEFAULT_RULES: readonly RestrictionRule[] = [
  {
    id: "off-hours-deployments",
    type: "off_hours",
    name: "Off-hours deployment restriction",
    enabled: true,
    schedule: DEFAULT_OFF_HOURS,
    affectedActions: ["deploy", "rollback_deployment", "run_migration"],
  },
  {
    id: "weekend-infrastructure",
    type: "off_hours",
    name: "Weekend infrastructure changes",
    enabled: true,
    schedule: { daysOfWeek: [0, 6], startHour: 0, endHour: 24 },
    affectedActions: ["modify_infrastructure", "update_dns", "modify_network", "delete_resource"],
  },
] as const;

// ==================== State ====================

/**
 * In-memory store for active restrictions.
 * In production, this would be backed by a database.
 */
let activeManualRestrictions: Map<string, ActiveRestriction> = new Map();
let customRules: RestrictionRule[] = [];

// ==================== Core Functions ====================

/**
 * Checks if current time falls within a schedule.
 *
 * @param schedule - Schedule configuration
 * @param now - Current timestamp
 * @returns True if within schedule
 */
const isWithinSchedule = (schedule: ScheduleConfig, now: Date): boolean => {
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();

  // Check day of week if specified
  if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
    if (!schedule.daysOfWeek.includes(utcDay)) {
      return false;
    }
  }

  // Handle overnight spans (e.g., 22:00 - 06:00)
  if (schedule.startHour > schedule.endHour) {
    return utcHour >= schedule.startHour || utcHour < schedule.endHour;
  }

  // Normal time range
  return utcHour >= schedule.startHour && utcHour < schedule.endHour;
};

/**
 * Calculates when a schedule restriction will end.
 *
 * @param schedule - Schedule configuration
 * @param now - Current timestamp
 * @returns End date or undefined if not calculable
 */
const calculateScheduleEnd = (schedule: ScheduleConfig, now: Date): Date | undefined => {
  const result = new Date(now);

  // Handle overnight spans
  if (schedule.startHour > schedule.endHour) {
    // If we're in the "after start" portion
    if (now.getUTCHours() >= schedule.startHour) {
      result.setUTCDate(result.getUTCDate() + 1);
    }
    result.setUTCHours(schedule.endHour, 0, 0, 0);
  } else {
    result.setUTCHours(schedule.endHour, 0, 0, 0);
  }

  return result;
};

/**
 * Checks if a rule applies to an action.
 *
 * @param rule - Restriction rule
 * @param actionType - Action type to check
 * @returns True if rule applies
 */
const ruleAppliesToAction = (rule: RestrictionRule, actionType?: string): boolean => {
  // Empty affected actions = applies to all
  if (rule.affectedActions.length === 0) {
    return true;
  }

  // No action type specified = check all rules
  if (!actionType) {
    return true;
  }

  return rule.affectedActions.includes(actionType.toLowerCase());
};

/**
 * Gets all active restrictions for the current context.
 *
 * @param context - Check context
 * @returns Array of active restrictions
 */
const getActiveRestrictions = (context: RestrictionContext): ActiveRestriction[] => {
  const now = context.now ?? new Date();
  const active: ActiveRestriction[] = [];
  const ignoreTypes = new Set(context.ignoreTypes ?? []);

  // Check schedule-based rules
  const allRules = [...DEFAULT_RULES, ...customRules];

  for (const rule of allRules) {
    if (!rule.enabled || ignoreTypes.has(rule.type)) {
      continue;
    }

    if (!ruleAppliesToAction(rule, context.actionType)) {
      continue;
    }

    if (rule.schedule && isWithinSchedule(rule.schedule, now)) {
      active.push({
        type: rule.type,
        name: rule.name,
        startedAt: now,
        endsAt: calculateScheduleEnd(rule.schedule, now),
      });
    }
  }

  // Add manual restrictions
  for (const restriction of activeManualRestrictions.values()) {
    if (ignoreTypes.has(restriction.type)) {
      continue;
    }

    // Check if expired
    if (restriction.endsAt && restriction.endsAt < now) {
      continue;
    }

    active.push(restriction);
  }

  return active;
};

/**
 * Formats active restrictions into a human-readable reason.
 *
 * @param restrictions - Active restrictions
 * @returns Formatted reason string
 */
const formatRestrictionReason = (restrictions: readonly ActiveRestriction[]): string => {
  if (restrictions.length === 0) {
    return "No active restrictions";
  }

  if (restrictions.length === 1) {
    return `Blocked by: ${restrictions[0].name}`;
  }

  const names = restrictions.map((restriction) => restriction.name);
  return `Blocked by ${restrictions.length} restrictions: ${names.join(", ")}`;
};

// ==================== Exports ====================

/**
 * Checks if an action is allowed under current restrictions.
 *
 * @param context - Check context
 * @returns Restriction check result
 */
export const checkRestrictions = (context: RestrictionContext = {}): RestrictionCheckResult => {
  const activeRestrictions = getActiveRestrictions(context);

  const earliestEnd = activeRestrictions
    .map((restriction) => restriction.endsAt)
    .filter((date): date is Date => date !== undefined)
    .sort((dateA, dateB) => dateA.getTime() - dateB.getTime())[0];

  return {
    isAllowed: activeRestrictions.length === 0,
    activeRestrictions,
    restrictedUntil: earliestEnd,
    reason: formatRestrictionReason(activeRestrictions),
  };
};

/**
 * Quick check if an action type is currently restricted.
 *
 * @param actionType - Action type to check
 * @returns True if restricted
 */
export const isActionRestricted = (actionType: string): boolean =>
  !checkRestrictions({ actionType }).isAllowed;

/**
 * Activates a manual restriction (e.g., freeze period, incident mode).
 *
 * @param id - Unique identifier for this restriction
 * @param type - Type of restriction
 * @param name - Human-readable name
 * @param durationMs - Duration in milliseconds (undefined = indefinite)
 * @returns The created restriction
 */
export const activateRestriction = (
  id: string,
  type: RestrictionType,
  name: string,
  durationMs?: number
): ActiveRestriction => {
  const now = new Date();
  const restriction: ActiveRestriction = {
    type,
    name,
    startedAt: now,
    endsAt: durationMs ? new Date(now.getTime() + durationMs) : undefined,
  };

  activeManualRestrictions.set(id, restriction);
  return restriction;
};

/**
 * Deactivates a manual restriction.
 *
 * @param id - Restriction identifier
 * @returns True if restriction was removed
 */
export const deactivateRestriction = (id: string): boolean => activeManualRestrictions.delete(id);

/**
 * Gets all currently active manual restrictions.
 *
 * @returns Map of active restrictions
 */
export const getManualRestrictions = (): ReadonlyMap<string, ActiveRestriction> =>
  new Map(activeManualRestrictions);

/**
 * Clears all manual restrictions.
 * Useful for testing or emergency override.
 */
export const clearAllManualRestrictions = (): void => {
  activeManualRestrictions = new Map();
};

/**
 * Adds a custom restriction rule.
 *
 * @param rule - Rule to add
 */
export const addRestrictionRule = (rule: RestrictionRule): void => {
  // Remove existing rule with same ID
  customRules = customRules.filter((existingRule) => existingRule.id !== rule.id);
  customRules.push(rule);
};

/**
 * Removes a custom restriction rule.
 *
 * @param id - Rule ID to remove
 * @returns True if rule was removed
 */
export const removeRestrictionRule = (id: string): boolean => {
  const initialLength = customRules.length;
  customRules = customRules.filter((rule) => rule.id !== id);
  return customRules.length < initialLength;
};

/**
 * Gets all restriction rules (default + custom).
 *
 * @returns All restriction rules
 */
export const getRestrictionRules = (): readonly RestrictionRule[] => [
  ...DEFAULT_RULES,
  ...customRules,
];

/**
 * Activates incident mode (blocks all high-risk actions).
 *
 * @param incidentId - Incident identifier
 * @param description - Incident description
 * @returns The created restriction
 */
export const activateIncidentMode = (incidentId: string, description: string): ActiveRestriction =>
  activateRestriction(`incident-${incidentId}`, "incident_mode", `Incident: ${description}`);

/**
 * Activates a deployment freeze.
 *
 * @param reason - Reason for freeze
 * @param durationMs - Duration in milliseconds
 * @returns The created restriction
 */
export const activateDeploymentFreeze = (reason: string, durationMs?: number): ActiveRestriction =>
  activateRestriction(
    "deployment-freeze",
    "freeze_period",
    `Deployment freeze: ${reason}`,
    durationMs
  );

/**
 * Checks if currently in incident mode.
 *
 * @returns True if incident mode is active
 */
export const isInIncidentMode = (): boolean => {
  for (const restriction of activeManualRestrictions.values()) {
    if (restriction.type === "incident_mode") {
      return true;
    }
  }
  return false;
};
