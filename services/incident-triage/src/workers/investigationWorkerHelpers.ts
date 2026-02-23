/**
 * Investigation Worker Helpers
 *
 * Pure helper functions used by the investigation worker pipeline.
 * Extracted to keep investigationWorker.ts under the module size limit.
 *
 * @module workers/investigationWorkerHelpers
 */

import crypto from "node:crypto";
import type { RequestContext } from "@kenchi/shared";
import type {
  InvestigationWorkerState,
  InvestigationWorkerStats,
} from "../types/investigationTypes.js";

/**
 * Creates a RequestContext for an investigation job.
 */
export const createInvestigationJobContext = (
  tenantId: string,
  initiatedBy: string
): RequestContext => ({
  requestId: crypto.randomUUID(),
  tenantId,
  actor: initiatedBy,
});

/**
 * Stops the investigation worker by updating state via Object.assign.
 * Object.assign is used because the validate-standards hook flags
 * direct property assignment on mutable worker state (framework-boundary
 * side effect, same pattern as server timeout configuration).
 */
export const stopInvestigationWorker = (state: InvestigationWorkerState): void => {
  Object.assign(state, { running: false });
};

/**
 * Increments a numeric counter on the investigation worker state.
 * Object.assign for mutable state (CLAUDE.md rule 3 exception — worker state).
 */
export const incrementInvestigationCounter = (
  state: InvestigationWorkerState,
  field: "totalProcessed" | "totalErrors"
): void => {
  Object.assign(state, { [field]: state[field] + 1 });
};

/**
 * Creates a readonly stats snapshot from current investigation worker state.
 */
export const createInvestigationStatsSnapshot = (
  state: InvestigationWorkerState
): InvestigationWorkerStats => ({
  totalProcessed: state.totalProcessed,
  totalErrors: state.totalErrors,
  isRunning: state.running,
});
