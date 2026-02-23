/**
 * Types for the mention handler module.
 */

import type { SayFn } from "@slack/bolt";

/**
 * Options for the handleAnalysisRequest function.
 * Groups the 7 parameters into a single typed object to comply with max-params.
 */
export interface AnalysisRequestOptions {
  readonly query: string;
  readonly userId: string;
  readonly channel: string;
  readonly threadTs: string;
  readonly eventTs: string;
  readonly say: SayFn;
  readonly tenantId?: string;
}
