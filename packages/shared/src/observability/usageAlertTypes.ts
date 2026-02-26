/**
 * Usage Alert Types
 *
 * Type definitions for usage threshold alerting.
 *
 * @module observability/usageAlertTypes
 */

// ==================== Alert Level ====================

export type UsageAlertLevel = "none" | "approaching" | "warning" | "critical" | "exceeded";

// ==================== Resource Types ====================

export type UsageResource = "repositories" | "analysesThisMonth" | "integrations" | "teamMembers";

// ==================== Domain Types ====================

/**
 * A single usage alert for a specific resource.
 */
export interface UsageAlert {
  readonly tenantId: string;
  readonly resource: UsageResource;
  readonly level: UsageAlertLevel;
  readonly currentUsage: number;
  readonly limit: number;
  readonly percentage: number;
}

/**
 * Result of checking all usage thresholds for a single tenant.
 */
export interface TenantUsageAlertResult {
  readonly tenantId: string;
  readonly alerts: ReadonlyArray<UsageAlert>;
}

/**
 * Key for deduplication tracking.
 */
export interface AlertDeduplicationKey {
  readonly tenantId: string;
  readonly resource: UsageResource;
}
