/**
 * Types for Pull Request Handler
 *
 * @module handlers/pullRequestHandlerTypes
 */

/**
 * Result of handling a PR webhook
 */
export interface PRHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}
