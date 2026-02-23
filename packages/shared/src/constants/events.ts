/**
 * Event-related Constants
 *
 * Centralized configuration for event types, sources, and severity levels.
 */

/**
 * Event type identifiers
 */
export const EVENT_TYPES = {
  /** CI/CD pipeline failure */
  CICD_FAILURE: "CICD_FAILURE",
  /** Deployment event */
  DEPLOYMENT: "DEPLOYMENT",
  /** Alert event */
  ALERT: "ALERT",
} as const;

export type { EventType } from "./types.js";

/**
 * Event source identifiers
 */
export const EVENT_SOURCES = {
  /** GitHub App integration */
  GITHUB_APP: "github-app",
  /** GitLab CI integration */
  GITLAB: "gitlab",
  /** Slack Bot integration */
  SLACK_BOT: "slack-bot",
  /** API service */
  API: "api",
  /** Manual trigger */
  MANUAL: "manual",
} as const;

export type { EventSource } from "./types.js";

/**
 * Event severity levels
 */
export const EVENT_SEVERITY = {
  /** Critical severity - immediate action required */
  CRITICAL: "critical",
  /** High severity - urgent attention needed */
  HIGH: "high",
  /** Medium severity - should be addressed soon */
  MEDIUM: "medium",
  /** Low severity - informational */
  LOW: "low",
} as const;

export type { EventSeverity } from "./types.js";

/**
 * Log level identifiers for evidence logs
 */
export const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
} as const;

export type { LogLevel } from "./types.js";

/**
 * Evidence source identifiers
 */
export const EVIDENCE_SOURCES = {
  /** CI/CD system logs */
  CI: "ci",
  /** Application logs */
  APP: "app",
  /** System logs */
  SYSTEM: "system",
} as const;

export type { EvidenceSource } from "./types.js";

/**
 * Default values for events
 */
export const EVENT_DEFAULTS = {
  /** Default commit value when not provided */
  UNKNOWN_COMMIT: "unknown",
} as const;
