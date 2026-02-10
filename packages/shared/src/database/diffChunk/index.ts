/**
 * Diff Chunk Module
 *
 * Database operations for code diff chunks with vector embeddings.
 *
 * @module database/diffChunk
 */

// Types
export type {
  DiffChunk,
  CreateDiffChunkInput,
  DiffChunkRow,
  DiffChunkSimilarityRow,
} from "./types.js";

// Row mappers
export { mapRowToDiffChunk } from "./helpers.js";

// Repository operations
export {
  createDiffChunk,
  createDiffChunksBatch,
  searchSimilarDiffChunks,
  getDiffChunksWithoutEmbeddings,
  updateDiffChunkEmbedding,
  deleteDiffChunksByPR,
  deleteDiffChunksByTenant,
  getDiffChunkCount,
} from "./repository.js";
