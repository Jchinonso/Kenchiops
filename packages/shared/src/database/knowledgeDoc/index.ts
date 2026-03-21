/**
 * Knowledge Document Module
 *
 * Database operations for knowledge documents with vector embeddings.
 *
 * @module database/knowledgeDoc
 */

// Types
export type {
  KnowledgeDocRecord,
  CreateKnowledgeDocInput,
  KnowledgeDocRow,
  KnowledgeDocSimilarityRow,
  KnowledgeDocListOptions,
  KnowledgeDocListResult,
} from "./types.js";

// Row mappers
export { mapRowToKnowledgeDoc } from "./helpers.js";

// Repository operations
export {
  createKnowledgeDoc,
  createKnowledgeDocsBatch,
  searchSimilarKnowledgeDocs,
  getKnowledgeDocsWithoutEmbeddings,
  updateKnowledgeDocEmbedding,
  deleteKnowledgeDocById,
  deleteKnowledgeDocsByParent,
  deleteKnowledgeDocsByTenant,
  getDocsNeedingReembedding,
  getKnowledgeDocsByType,
  getKnowledgeDocCountsByType,
  getKnowledgeDocCountsByTypeForTenant,
  getKnowledgeDocsByTenant,
} from "./repository.js";

// Hit tracking operations
export {
  getKnowledgeDocById,
  incrementKnowledgeDocHitCount,
  batchIncrementKnowledgeDocHitCounts,
  recordKnowledgeDocNegativeFeedback,
} from "./hitTracking.js";
