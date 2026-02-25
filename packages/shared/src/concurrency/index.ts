/**
 * Concurrency control module.
 *
 * Provides per-tenant concurrency limiting for analysis jobs.
 *
 * @module concurrency
 */

export {
  acquireAnalysisSlot,
  releaseAnalysisSlot,
  getActiveAnalysisCount,
  getAllActiveAnalysisCounts,
  resetAllSlots,
} from "./tenantSemaphore.js";

export type { ActiveAnalysisCounts, SlotAcquisitionResult } from "./types.js";
