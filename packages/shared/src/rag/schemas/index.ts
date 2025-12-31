/**
 * RAG Schemas Module
 *
 * Exports all schema definitions and validation utilities.
 *
 * @module rag/schemas
 */

export {
  // Schemas
  analysisLessonMetadataSchema,
  prFixCommentMetadataSchema,
  slackResolutionMetadataSchema,
  teamDocsMetadataSchema,
  externalDocsMetadataSchema,
  runbookMetadataSchema,
  postmortemMetadataSchema,
  METADATA_SCHEMA_REGISTRY,
  // Types
  type AnalysisLessonMetadata,
  type PrFixCommentMetadata,
  type SlackResolutionMetadata,
  type TeamDocsMetadata,
  type ExternalDocsMetadata,
  type RunbookMetadata,
  type PostmortemMetadata,
  type DocumentMetadata,
  type MetadataValidationResult,
  // Functions
  getSchemaForDocType,
  validateMetadata,
  validateMetadataOrThrow,
  hasSchemaForDocType,
  getRegisteredDocTypes,
} from "./metadataSchemas.js";
