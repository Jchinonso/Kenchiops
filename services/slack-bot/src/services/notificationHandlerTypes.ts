/**
 * Notification Handler Types
 *
 * Type definitions for the Slack notification queue handler.
 */

/**
 * Handler result
 */
export interface HandlerResult {
  readonly success: boolean;
  readonly error?: string;
}
