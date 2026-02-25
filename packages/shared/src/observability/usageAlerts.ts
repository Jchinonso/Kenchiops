/**
 * Usage Threshold Alerting
 *
 * Checks tenant usage against plan limits and returns alerts
 * when thresholds are exceeded. Includes in-memory deduplication
 * with daily reset to avoid alert fatigue.
 *
 * @module observability/usageAlerts
 */

import { createLogger } from "../core/logger.js";
import {
  USAGE_ALERT_THRESHOLDS,
  USAGE_ALERT_LEVELS,
  USAGE_ALERT_DEDUP,
} from "../constants/usageAlerts.js";
import type { PlanUsage, PlanLimits } from "../database/subscription/types.js";
import type {
  UsageAlertLevel,
  UsageResource,
  UsageAlert,
  TenantUsageAlertResult,
} from "./usageAlertTypes.js";

const logger = createLogger("usage-alerts");

// ==================== Alert Level Determination (Pure) ====================

/**
 * Determine the alert level for a given usage ratio.
 * Pure function: no side effects, deterministic.
 */
const determineAlertLevel = (ratio: number): UsageAlertLevel => {
  if (ratio >= USAGE_ALERT_THRESHOLDS.EXCEEDED) {
    return USAGE_ALERT_LEVELS.EXCEEDED as UsageAlertLevel;
  }
  if (ratio >= USAGE_ALERT_THRESHOLDS.CRITICAL) {
    return USAGE_ALERT_LEVELS.CRITICAL as UsageAlertLevel;
  }
  if (ratio >= USAGE_ALERT_THRESHOLDS.WARNING) {
    return USAGE_ALERT_LEVELS.WARNING as UsageAlertLevel;
  }
  if (ratio >= USAGE_ALERT_THRESHOLDS.APPROACHING) {
    return USAGE_ALERT_LEVELS.APPROACHING as UsageAlertLevel;
  }
  return USAGE_ALERT_LEVELS.NONE as UsageAlertLevel;
};

/**
 * Build a dedup key string from tenant + resource.
 */
const buildDedupKey = (tenantId: string, resource: UsageResource): string =>
  `${tenantId}:${resource}`;

// ==================== Resource Definitions ====================

interface ResourceConfig {
  readonly resource: UsageResource;
  readonly getUsage: (usage: PlanUsage) => number;
  readonly getLimit: (limits: PlanLimits) => number | null;
}

const RESOURCE_CONFIGS: readonly ResourceConfig[] = [
  {
    resource: "repositories",
    getUsage: (usage) => usage.repositories,
    getLimit: (limits) => limits.maxRepositories,
  },
  {
    resource: "analysesThisMonth",
    getUsage: (usage) => usage.analysesThisMonth,
    getLimit: (limits) => limits.maxAnalysesMonthly,
  },
  {
    resource: "integrations",
    getUsage: (usage) => usage.integrations,
    getLimit: (limits) => limits.maxIntegrations,
  },
  {
    resource: "teamMembers",
    getUsage: (usage) => usage.teamMembers,
    getLimit: (limits) => limits.maxTeamMembers,
  },
] as const;

// ==================== Deduplication State ====================

/**
 * In-memory dedup tracker. Maps "tenantId:resource" -> last alert level.
 * Resets daily to allow re-alerting.
 */
const createDedupTracker = (): {
  readonly shouldAlert: (
    tenantId: string,
    resource: UsageResource,
    level: UsageAlertLevel
  ) => boolean;
  readonly record: (tenantId: string, resource: UsageResource, level: UsageAlertLevel) => void;
  readonly reset: () => void;
} => {
  // let: mutable state required for in-memory dedup tracker with periodic reset
  let lastAlertLevels = new Map<string, UsageAlertLevel>(); // let: reset daily
  let lastResetTime = Date.now(); // let: tracks last reset time

  return {
    shouldAlert: (tenantId: string, resource: UsageResource, level: UsageAlertLevel): boolean => {
      // Reset if past the dedup interval
      if (Date.now() - lastResetTime >= USAGE_ALERT_DEDUP.RESET_INTERVAL_MS) {
        lastAlertLevels = new Map<string, UsageAlertLevel>(); // let: daily reset
        lastResetTime = Date.now(); // let: update reset time
      }

      const key = buildDedupKey(tenantId, resource);
      const previousLevel = lastAlertLevels.get(key);

      // Alert if level escalated or no previous alert
      return previousLevel === undefined || previousLevel !== level;
    },
    record: (tenantId: string, resource: UsageResource, level: UsageAlertLevel): void => {
      const key = buildDedupKey(tenantId, resource);
      lastAlertLevels.set(key, level);
    },
    reset: (): void => {
      lastAlertLevels = new Map<string, UsageAlertLevel>(); // let: manual reset
      lastResetTime = Date.now(); // let: update reset time
    },
  };
};

const dedupTracker = createDedupTracker();

// ==================== Public API ====================

/**
 * Check usage thresholds for a single tenant.
 *
 * Compares current usage against plan limits and returns alerts
 * for resources exceeding thresholds (75%, 90%, 95%, 100%).
 * Deduplicates by only alerting when the level changes for a given
 * tenant+resource combination (resets daily).
 *
 * @param tenantId - Tenant ID
 * @param usage - Current usage values (from getTenantUsage)
 * @param limits - Plan limit values from the tenant's plan (null = unlimited)
 * @returns Alerts for resources that exceed thresholds (deduplicated)
 */
export const checkUsageThresholds = (
  tenantId: string,
  usage: PlanUsage,
  limits: PlanLimits
): TenantUsageAlertResult => {
  const alerts = RESOURCE_CONFIGS.flatMap((config) => {
    const limit = config.getLimit(limits);

    // null limit = unlimited, no alert needed
    if (limit === null) {
      return [];
    }

    const currentUsage = config.getUsage(usage);
    const ratio = currentUsage / limit;
    const level = determineAlertLevel(ratio);

    if (level === USAGE_ALERT_LEVELS.NONE) {
      return [];
    }

    // Deduplicate: only alert if level changed
    if (!dedupTracker.shouldAlert(tenantId, config.resource, level)) {
      return [];
    }

    dedupTracker.record(tenantId, config.resource, level);

    const alert: UsageAlert = {
      tenantId,
      resource: config.resource,
      level,
      currentUsage,
      limit,
      percentage: Math.round(ratio * 100),
    };

    return [alert];
  });

  if (alerts.length > 0) {
    logger.warn("Usage threshold alerts", {
      tenantId,
      alertCount: alerts.length,
      resources: alerts.map((alert) => alert.resource),
    });
  }

  return {
    tenantId,
    alerts: Object.freeze(alerts),
  };
};

/**
 * Reset the deduplication tracker.
 * Useful for testing or when a manual reset is needed.
 */
export const resetUsageAlertDedup = (): void => {
  dedupTracker.reset();
};
