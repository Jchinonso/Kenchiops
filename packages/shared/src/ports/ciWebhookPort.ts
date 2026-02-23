/**
 * CI Webhook Port Interface
 *
 * Provider-agnostic contract for CI webhook adapters.
 * Adapters implement this interface to validate and normalize
 * webhook payloads from different CI providers.
 * Vendor-specific types never cross this boundary.
 *
 * @module ports/ciWebhookPort
 */

import type { NormalizedBuildEvent } from "../aggregation/types.js";
import type { RequestContext } from "../core/types.js";

/**
 * Port for validating and normalizing CI provider webhooks.
 */
export interface CIWebhookPort {
  /** Validate the webhook signature. Returns true if valid. */
  readonly verifySignature: (rawBody: Buffer, signature: string, secret: string) => boolean;

  /** Normalize provider-specific payload to NormalizedBuildEvent. Returns null if event should be skipped. */
  readonly normalizeEvent: (
    payload: unknown,
    context: RequestContext
  ) => NormalizedBuildEvent | null;

  /** Check if this webhook event represents a build failure we should process. */
  readonly isFailureEvent: (payload: unknown) => boolean;
}
