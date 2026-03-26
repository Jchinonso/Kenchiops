/**
 * Alert Context Port
 *
 * Interface for adapters that fetch enrichment context from monitoring
 * providers for a normalized alert (Pipeline B: Alert Context Analysis).
 */

import type { AlertContext, RequestContext } from "@kenchi/shared";
import type { NormalizedAlert } from "../types/incidentTypes.js";

/**
 * Port interface for alert context adapters.
 * Each monitoring source that supports context enrichment implements this interface.
 */
export interface AlertContextPort {
  readonly fetchContext: (alert: NormalizedAlert, context: RequestContext) => Promise<AlertContext>;
}
