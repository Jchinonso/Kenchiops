/**
 * Types for Webhook Routes
 *
 * @module routes/webhookRoutesTypes
 */

/**
 * Webhook handler result with optional fields
 */
export interface WebhookHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
  readonly tenantId?: string;
}

/**
 * GitHub event handler configuration
 */
export interface GitHubEventHandler {
  readonly handle: (body: unknown) => Promise<WebhookHandlerResult>;
  readonly formatResponse: (result: WebhookHandlerResult) => object;
}
