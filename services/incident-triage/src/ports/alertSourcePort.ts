/**
 * Alert Source Port
 *
 * Interface for adapters that parse monitoring source webhooks
 * into normalized alert structures.
 */

import type { NormalizedAlert } from "../types/incidentTypes.js";

/**
 * Port interface for alert source adapters.
 * Each monitoring source (PagerDuty, Datadog, etc.) implements this interface.
 */
export interface AlertSourcePort {
  readonly parseWebhook: (
    body: unknown,
    headers: Readonly<Record<string, string | string[] | undefined>>
  ) => NormalizedAlert;
  readonly generateFingerprint: (alert: NormalizedAlert) => string;
}
