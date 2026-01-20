/**
 * Database Common Exports
 *
 * Re-exports core utilities for use by database submodules.
 * This avoids deep parent imports in subfolder modules.
 *
 * @module database/common
 */

// Core exports
export { ValidationError, getErrorMessage, NotFoundError } from "../core/errors.js";
export { createLogger } from "../core/logger.js";
export { generateEventId, parseDbCount } from "../core/utils.js";

// Core types
export type {
  Tenant,
  TenantStatus,
  TenantEmbeddingTier,
  CreateTenantFromGitHub,
  LinkSlackWorkspace,
  TenantAuditAction,
  TenantAuditEntry,
  RepositoryChannelMapping,
  CreateRepositoryChannelMapping,
} from "../core/types.js";

// Constants exports
export {
  // Parsing
  PARSE_INT_RADIX,
  // Vector/Embedding
  EMBEDDING_CONFIG,
  EMBEDDING_TIERS,
  VECTOR_SIMILARITY_THRESHOLDS,
  // Diff chunks
  DIFF_CHUNK_DEFAULTS,
  DIFF_CHUNK_QUERIES,
  // Knowledge docs
  KNOWLEDGE_DOC_QUERIES,
  KNOWLEDGE_DOC_DEFAULTS,
  HIT_TRACKING_QUERIES,
  // Tenant
  TENANT_STATUS,
  AUDIT_ACTIONS,
  TENANT_DEFAULTS,
  RAG_BUDGET_DEFAULTS,
  TENANT_QUERIES,
  AUDIT_QUERIES,
  AUDIT_DEFAULTS,
  // Repository channel
  REPOSITORY_CHANNEL_QUERIES,
  // Action proposal
  ACTION_PROPOSAL_DEFAULTS,
  ACTION_PROPOSAL_QUERIES,
  VALID_ACTION_PROPOSAL_STATUSES,
  MIN_STATS_WINDOW_MINUTES,
  // Cost tracking
  COST_CONTROL_CONFIG,
  COST_TRACKING_DEFAULTS,
  COST_TRACKING_QUERIES,
  // Drift detection
  DRIFT_DETECTION_THRESHOLDS,
  // External source
  EXTERNAL_SOURCE_CONFIG,
  EXTERNAL_SOURCE_DEFAULTS,
  EXTERNAL_SOURCE_QUERIES,
  // Feedback
  FEEDBACK_DEFAULTS,
  FEEDBACK_QUERIES,
  // Analysis
  ANALYSIS_DEFAULTS,
  ANALYSIS_QUERIES,
  // Metrics history
  METRICS_HISTORY_DEFAULTS,
  METRICS_HISTORY_QUERIES,
  RAG_METRIC_TYPES,
  // Model version
  MODEL_VERSION_DEFAULTS,
  MODEL_VERSION_QUERIES,
  // Relationship
  RELATIONSHIP_TYPES,
  RELATIONSHIP_DEFAULTS,
  RELATIONSHIP_QUERIES,
  MULTI_HOP_CONFIG,
  // Test case
  RAG_TEST_CASE_CONFIG,
  TEST_CASE_DEFAULTS,
  TEST_CASE_QUERIES,
  // Types
  type KnowledgeDocType,
  type EmbeddingTierName,
  type RAGMetricType,
  type RelationshipType,
  type ExternalSourceType,
  type TechStackTag,
} from "../constants/index.js";

// Vector utilities
export { parseEmbeddingVector, parseJsonbField, formatEmbeddingVector } from "./vectorUtils.js";

// Vector types
export type { VectorSearchFilters, VectorSearchResult } from "./vectorTypes.js";

// Database client
export { query, transaction } from "./client.js";

// Finetuning types (for model version repository)
export type {
  ModelVersion,
  ModelMetadata,
  ModelFeatureFlags,
  ABTestConfig,
} from "../finetuning/modelVersioning.js";

// RAG types (for feedback repository)
export type { RAGRelevance } from "../rag/evaluation.js";
