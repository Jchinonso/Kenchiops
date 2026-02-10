/**
 * Types for Check Run Handler
 *
 * @module handlers/checkRunHandlerTypes
 */

/**
 * Result of handling a check run webhook
 */
export interface CheckRunHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}
