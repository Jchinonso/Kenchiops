/**
 * Deploy Analysis Types
 *
 * Type definitions for the deploy analysis service and windowed processing.
 *
 * @module services/deployAnalysisTypes
 */

import type {
  DeployPlatform,
  DeployMetadata,
  IncidentSummary,
  RequestContext,
} from "@kenchi/shared";
import type { AnalyzeResponse } from "../types/apiTypes.js";

// ==================== Deploy Analysis ====================

/** Result of processing a deploy webhook. */
export type ProcessWebhookResult =
  | { readonly action: "analyzed"; readonly response: AnalyzeResponse }
  | { readonly action: "buffered"; readonly entityId: string; readonly linesAccepted: number }
  | { readonly action: "skipped"; readonly reason: string };

/** Result of processing a log drain batch. */
export interface ProcessLogDrainResult {
  readonly entityId: string;
  readonly linesAccepted: number;
  readonly flushed: boolean;
  readonly windowResult: WindowAnalysisResult | null;
}

// ==================== Windowed Analysis ====================

/** Result of a single window analysis. */
export interface WindowAnalysisResult {
  readonly windowNumber: number;
  readonly linesProcessed: number;
  readonly tokensProcessed: number;
  readonly updatedSummary: IncidentSummary;
  readonly usedChunkingPipeline: boolean;
}

/** Input for the windowed analysis function. */
export interface WindowAnalysisInput {
  readonly entityId: string;
  readonly tenantId: string;
  readonly platform: DeployPlatform;
  readonly metadata: DeployMetadata;
  readonly lines: readonly string[];
  readonly estimatedTokens: number;
  readonly windowNumber: number;
  readonly previousSummary: IncidentSummary | null;
}

// ==================== Internal Input Types ====================

/** Shared entity context for flush and analysis operations. */
export interface DeployEntityContext {
  readonly entityId: string;
  readonly tenantId: string;
  readonly platform: DeployPlatform;
  readonly metadata: DeployMetadata;
}

// ==================== Service Dependencies ====================

/** Dependencies injected into the deploy analysis service. */
export interface DeployAnalysisServiceDeps {
  readonly performAnalysis: (
    request: import("../types/apiTypes.js").AnalyzeRequest,
    context: RequestContext
  ) => Promise<AnalyzeResponse>;
}
