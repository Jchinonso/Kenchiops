/**
 * Metadata Contract Schemas
 *
 * Zod validation schemas for document metadata by type.
 * Ensures consistent metadata structure across ingestion pipeline.
 *
 * @module rag/schemas/metadataSchemas
 */

import { z } from "zod";
import { ValidationError } from "../../core/errors.js";

// ==================== Doc Type Constants ====================
// Defined locally to avoid circular imports with constants module

const DOC_TYPES = {
  ANALYSIS_LESSON: "analysis_lesson",
  PR_FIX_COMMENT: "pr_fix_comment",
  SLACK_RESOLUTION: "slack_resolution",
  RUNBOOK: "runbook",
  SOP: "sop",
  TROUBLESHOOTING: "troubleshooting",
  POSTMORTEM: "postmortem",
  DOCUMENTATION: "documentation",
  ARCHITECTURE: "architecture",
  EXTERNAL: "external",
} as const;

// ==================== Base Schemas ====================

/**
 * Common metadata fields present in all document types.
 */
const baseMetadataSchema = z.object({
  repository: z.string().optional(),
  workflow: z.string().optional(),
  language: z.string().optional(),
  hitCount: z.number().int().min(0).default(0),
  helpfulRate: z.number().min(0).max(1).optional(),
  negativeFeedbackCount: z.number().int().min(0).default(0),
});

// ==================== Doc-Type Specific Schemas ====================

/**
 * Schema for analysis_lesson documents.
 * Generated from AI analysis of CI failures.
 */
export const analysisLessonMetadataSchema = baseMetadataSchema.extend({
  errorSignature: z.string(),
  errorType: z.string().optional(),
  rootCause: z.string().optional(),
  failureCategory: z
    .enum([
      "test_failure",
      "build_error",
      "type_error",
      "lint_error",
      "dependency_error",
      "runtime_error",
      "timeout",
      "infrastructure",
      "unknown",
    ])
    .optional(),
  ciProvider: z.string().optional(),
  checkName: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/)
    .optional(),
});

/**
 * Schema for pr_fix_comment documents.
 * Captured from PR comments explaining fixes.
 */
export const prFixCommentMetadataSchema = baseMetadataSchema.extend({
  prNumber: z.number().int().positive(),
  commentId: z.number().int().positive(),
  commentAuthor: z.string(),
  prAuthor: z.string().optional(),
  prTitle: z.string().optional(),
  errorSignature: z.string().optional(),
  fixedCheckName: z.string().optional(),
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/)
    .optional(),
  capturedAt: z.string().datetime().optional(),
});

/**
 * Schema for slack_resolution documents.
 * Captured from Slack thread resolutions.
 */
export const slackResolutionMetadataSchema = baseMetadataSchema.extend({
  // Thread identification
  channelId: z.string(),
  channelName: z.string().optional(),
  threadTs: z.string(),
  resolutionMessageTs: z.string().optional(),
  // User information
  resolverUserId: z.string(),
  resolverUsername: z.string().optional(),
  originalPoster: z.string().optional(),
  // Detection signals
  confidence: z.number().min(0).max(1),
  matchedPatterns: z.array(z.string()),
  hasCodeBlock: z.boolean(),
  hasPositiveReactions: z.boolean(),
  // Context
  errorSignature: z.string().optional(),
  checkName: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  affectedFiles: z.array(z.string()).optional(),
  capturedAt: z.string().datetime().optional(),
});

/**
 * Schema for team documentation (runbooks, SOPs, troubleshooting guides).
 */
export const teamDocsMetadataSchema = baseMetadataSchema.extend({
  docTitle: z.string(),
  docVersion: z.string().optional(),
  author: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  applicableServices: z.array(z.string()).optional(),
  applicableErrors: z.array(z.string()).optional(),
});

/**
 * Schema for external documentation sources.
 */
export const externalDocsMetadataSchema = baseMetadataSchema.extend({
  sourceUrl: z.string().url(),
  sourceName: z.string(),
  fetchedAt: z.string().datetime(),
  contentHash: z.string().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
});

/**
 * Schema for runbook documents.
 */
export const runbookMetadataSchema = teamDocsMetadataSchema.extend({
  runbookType: z
    .enum([
      "incident_response",
      "deployment",
      "rollback",
      "scaling",
      "maintenance",
      "debugging",
      "general",
    ])
    .optional(),
  estimatedTime: z.string().optional(),
  prerequisites: z.array(z.string()).optional(),
  relatedRunbooks: z.array(z.string()).optional(),
});

/**
 * Schema for postmortem documents.
 */
export const postmortemMetadataSchema = teamDocsMetadataSchema.extend({
  incidentId: z.string().optional(),
  incidentDate: z.string().datetime().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  impactDuration: z.string().optional(),
  rootCauses: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
});

// ==================== Schema Registry ====================

/**
 * Schema registry entries for building the Map.
 */
const schemaEntries: ReadonlyArray<[string, z.ZodSchema]> = [
  [DOC_TYPES.ANALYSIS_LESSON, analysisLessonMetadataSchema],
  [DOC_TYPES.PR_FIX_COMMENT, prFixCommentMetadataSchema],
  [DOC_TYPES.SLACK_RESOLUTION, slackResolutionMetadataSchema],
  [DOC_TYPES.RUNBOOK, runbookMetadataSchema],
  [DOC_TYPES.SOP, teamDocsMetadataSchema],
  [DOC_TYPES.TROUBLESHOOTING, teamDocsMetadataSchema],
  [DOC_TYPES.POSTMORTEM, postmortemMetadataSchema],
  [DOC_TYPES.DOCUMENTATION, teamDocsMetadataSchema],
  [DOC_TYPES.ARCHITECTURE, teamDocsMetadataSchema],
  [DOC_TYPES.EXTERNAL, externalDocsMetadataSchema],
];

/**
 * Maps document types to their validation schemas.
 */
export const METADATA_SCHEMA_REGISTRY: ReadonlyMap<string, z.ZodSchema> = new Map(schemaEntries);

// ==================== Validation Types ====================

/**
 * Inferred types from schemas.
 */
export type AnalysisLessonMetadata = z.infer<typeof analysisLessonMetadataSchema>;
export type PrFixCommentMetadata = z.infer<typeof prFixCommentMetadataSchema>;
export type SlackResolutionMetadata = z.infer<typeof slackResolutionMetadataSchema>;
export type TeamDocsMetadata = z.infer<typeof teamDocsMetadataSchema>;
export type ExternalDocsMetadata = z.infer<typeof externalDocsMetadataSchema>;
export type RunbookMetadata = z.infer<typeof runbookMetadataSchema>;
export type PostmortemMetadata = z.infer<typeof postmortemMetadataSchema>;

/**
 * Union of all metadata types.
 */
export type DocumentMetadata =
  | AnalysisLessonMetadata
  | PrFixCommentMetadata
  | SlackResolutionMetadata
  | TeamDocsMetadata
  | ExternalDocsMetadata
  | RunbookMetadata
  | PostmortemMetadata;

/**
 * Validation result type.
 */
export interface MetadataValidationResult {
  readonly success: boolean;
  readonly data?: DocumentMetadata;
  readonly errors?: ReadonlyArray<{
    readonly path: string;
    readonly message: string;
  }>;
}

// ==================== Validation Functions ====================

/**
 * Gets the appropriate schema for a document type.
 *
 * @param docType - The document type
 * @returns The schema or undefined if not found
 */
export const getSchemaForDocType = (docType: string): z.ZodSchema | undefined =>
  METADATA_SCHEMA_REGISTRY.get(docType);

/**
 * Validates metadata against the appropriate schema for the document type.
 *
 * @param docType - The document type
 * @param metadata - The metadata to validate
 * @returns Validation result with parsed data or errors
 */
export const validateMetadata = (docType: string, metadata: unknown): MetadataValidationResult => {
  const schema = getSchemaForDocType(docType);

  if (!schema) {
    return {
      success: false,
      errors: [{ path: "docType", message: `Unknown document type: ${docType}` }],
    };
  }

  const parseResult = schema.safeParse(metadata);

  if (parseResult.success) {
    return {
      success: true,
      data: parseResult.data as DocumentMetadata,
    };
  }

  const errors = parseResult.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return {
    success: false,
    errors,
  };
};

/**
 * Validates metadata and throws on failure.
 *
 * @param docType - The document type
 * @param metadata - The metadata to validate
 * @returns The validated metadata
 * @throws Error if validation fails
 */
export const validateMetadataOrThrow = (docType: string, metadata: unknown): DocumentMetadata => {
  const result = validateMetadata(docType, metadata);

  if (!result.success) {
    const errorMessages = result.errors
      ?.map((validationError) => `${validationError.path}: ${validationError.message}`)
      .join(", ");
    throw new ValidationError(`Metadata validation failed for ${docType}: ${errorMessages}`, {
      operation: "validateMetadataOrThrow",
      metadata: { docType },
    });
  }

  return result.data as DocumentMetadata;
};

/**
 * Checks if a document type has a registered schema.
 *
 * @param docType - The document type to check
 * @returns True if schema exists
 */
export const hasSchemaForDocType = (docType: string): boolean =>
  METADATA_SCHEMA_REGISTRY.has(docType);

/**
 * Gets all registered document types.
 *
 * @returns Array of document types with schemas
 */
export const getRegisteredDocTypes = (): readonly string[] =>
  Array.from(METADATA_SCHEMA_REGISTRY.keys());
