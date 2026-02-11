/**
 * Analysis Context Store Types
 *
 * Type definitions for the analysis context storage.
 */

import type { AggregatedFailures } from "@kenchi/shared";

/**
 * Stored analysis context for lesson extraction.
 */
export interface StoredAnalysisContext {
  /** The aggregated failures with full analysis details */
  readonly aggregation: AggregatedFailures;
  /** Channel where the message was posted */
  readonly channelId: string;
  /** Message timestamp */
  readonly messageTs: string;
  /** When the context was stored */
  readonly storedAt: Date;
  /** Tenant ID for multi-tenancy */
  readonly tenantId?: string;
}
