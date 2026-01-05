/**
 * Action Handler Types
 *
 * Types and type guards for Slack action button interactions.
 */

import type { SayArguments } from "@slack/bolt";

// ==================== Type Aliases ====================

/**
 * Type for Slack blocks compatible with Bolt
 */
export type SlackBlocks = NonNullable<SayArguments["blocks"]>;

/**
 * Acknowledgment function type for Slack actions
 */
export type AckFn = () => Promise<void>;

// ==================== Interfaces ====================

/**
 * Legacy action value format (for backward compatibility with old buttons)
 */
export interface LegacyActionValue {
  readonly eventId?: string;
  readonly actionId: string;
  readonly actionType?: string;
  readonly repository?: string;
  readonly commitSha?: string;
  readonly installationId?: number;
  readonly priority?: string | number;
  readonly checkRunId?: number;
  readonly description?: string;
}

// ==================== Type Guards ====================

/**
 * Type guard for legacy action value format.
 * Used to detect old button payloads that contain full action data.
 */
export const isLegacyActionValue = (value: unknown): value is LegacyActionValue =>
  typeof value === "object" &&
  value !== null &&
  "actionId" in value &&
  typeof (value as LegacyActionValue).actionId === "string";
