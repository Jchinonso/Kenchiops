/**
 * Ingestion Buffer Factory
 *
 * Composes buffer operations and queries into the IngestionBufferPort interface.
 * All logic lives in bufferOperations.ts (writes) and bufferQueries.ts (reads).
 *
 * @module ingestion/buffer
 */

import type { IngestionBufferPort } from "./types.js";
import { append, flush, close } from "./bufferOperations.js";
import { getMetadata, getSummary, updateSummary, checkFlushTriggers } from "./bufferQueries.js";

/**
 * Creates the ingestion buffer port backed by Redis sorted sets.
 */
export const createIngestionBuffer = (): IngestionBufferPort => ({
  append,
  flush,
  getMetadata,
  getSummary,
  updateSummary,
  close,
  checkFlushTriggers,
});
