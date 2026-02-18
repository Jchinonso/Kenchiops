/**
 * Policy Rules Constants
 *
 * Default routing rules, dispatch channel names, and timeout configuration
 * for the incident triage policy engine.
 *
 * @module constants/policyRules
 */

import type { PolicyRule } from "../types/policyTypes.js";

// ==================== Dispatch Channels ====================

/**
 * Default Slack channel names for incident routing.
 */
export const DISPATCH_CHANNELS = {
  CRITICAL: "#incidents-critical",
  PRODUCTION: "#incidents-prod",
  NON_PRODUCTION: "#incidents-nonprd",
  GENERAL: "#incidents-general",
} as const;

// ==================== Dispatch Timeouts ====================

/**
 * HTTP timeout configuration for dispatch targets (milliseconds).
 */
export const DISPATCH_TIMEOUTS = {
  SLACK_POST_MS: 10000,
  PAGERDUTY_EVENT_MS: 10000,
} as const;

// ==================== PagerDuty Configuration ====================

/**
 * PagerDuty Events API v2 endpoint.
 */
export const PAGERDUTY_EVENTS_API_URL = "https://events.pagerduty.com/v2/enqueue" as const;

// ==================== Default Policy Rules ====================

/**
 * Default routing rules evaluated in priority order (lowest number = highest priority).
 *
 * Rule evaluation:
 * - Rules are evaluated in priority order
 * - All matching rules contribute targets (actions accumulate)
 * - Each rule that matches adds its targets to the dispatch list
 * - Duplicate targets (same type + channel) are deduplicated
 */
export const DEFAULT_POLICY_RULES: readonly PolicyRule[] = [
  {
    id: "P1_CRITICAL_PROD",
    name: "Critical Production Alert",
    description:
      "Critical severity in production: Slack #incidents-critical + PagerDuty escalation",
    priority: 1,
    condition: {
      severity: ["critical"],
      environment: ["production", "prod"],
    },
    targets: [
      {
        type: "slack",
        channel: DISPATCH_CHANNELS.CRITICAL,
        metadata: { urgency: "critical" },
      },
      {
        type: "pagerduty",
        channel: "escalation",
        metadata: { urgency: "high" },
      },
    ],
    enabled: true,
  },
  {
    id: "P2_HIGH_PROD",
    name: "High Severity Production Alert",
    description: "High severity in production: Slack #incidents-prod",
    priority: 2,
    condition: {
      severity: ["high"],
      environment: ["production", "prod"],
    },
    targets: [
      {
        type: "slack",
        channel: DISPATCH_CHANNELS.PRODUCTION,
        metadata: { urgency: "high" },
      },
    ],
    enabled: true,
  },
  {
    id: "P3_MEDIUM_PROD",
    name: "Medium Severity Production Alert",
    description: "Medium severity in production: Slack #incidents-prod",
    priority: 3,
    condition: {
      severity: ["medium"],
      environment: ["production", "prod"],
    },
    targets: [
      {
        type: "slack",
        channel: DISPATCH_CHANNELS.PRODUCTION,
        metadata: { urgency: "medium" },
      },
    ],
    enabled: true,
  },
  {
    id: "NON_PROD",
    name: "Non-Production Alert",
    description: "Any severity outside production: Slack #incidents-nonprd only",
    priority: 4,
    condition: {
      environmentExclude: ["production", "prod"],
    },
    targets: [
      {
        type: "slack",
        channel: DISPATCH_CHANNELS.NON_PRODUCTION,
        metadata: { urgency: "low" },
      },
    ],
    enabled: true,
  },
  {
    id: "DEFAULT",
    name: "Default Routing",
    description: "Fallback: Slack #incidents-general",
    priority: 100,
    condition: {},
    targets: [
      {
        type: "slack",
        channel: DISPATCH_CHANNELS.GENERAL,
        metadata: { urgency: "low" },
      },
    ],
    enabled: true,
  },
] as const;
