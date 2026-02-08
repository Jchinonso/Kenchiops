/**
 * Centralized type definitions for constants modules.
 *
 * All derived types from constant objects are defined here and imported
 * where needed, following the "types in types.ts only" rule.
 *
 * @module constants/types
 */

import type {
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  CI_PLATFORMS,
  BOUNDARY_TYPES,
  PROTECTED_ZONE_TYPES,
} from "./chunkingPipeline.js";
import type { MESSAGE_VARIANT_CONFIG } from "./githubApp.js";
import type { FINE_TUNING_STATUS } from "./openai.js";
import type {
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  LOG_LEVELS,
  EVIDENCE_SOURCES,
} from "./events.js";
import type { CONFIDENCE_LEVEL_THRESHOLDS } from "./confidence.js";
import type {
  KNOWLEDGE_DOC_TYPES,
  RELATIONSHIP_TYPES,
  EXTERNAL_SOURCE_TYPES,
  TECH_STACK_TAGS,
  EMBEDDING_TIERS,
  RAG_METRIC_TYPES,
} from "./ragConstants.js";
import type { CACHE_NAMESPACES } from "./redis.js";
import type { HEALTH_STATUS, API_RESPONSE_STATUS } from "./api.js";
import type { PRIORITY_NUMERIC_MAP } from "./slackBot.js";

// ==================== Chunking Pipeline Types ====================

/** Artifact type identifier derived from ARTIFACT_TYPES constant. */
export type ArtifactType = (typeof ARTIFACT_TYPES)[keyof typeof ARTIFACT_TYPES];

/** Artifact severity level derived from ARTIFACT_SEVERITY constant. */
export type ArtifactSeverity = (typeof ARTIFACT_SEVERITY)[keyof typeof ARTIFACT_SEVERITY];

/** Artifact confidence level derived from ARTIFACT_CONFIDENCE constant. */
export type ArtifactConfidence = (typeof ARTIFACT_CONFIDENCE)[keyof typeof ARTIFACT_CONFIDENCE];

/** CI platform identifier derived from CI_PLATFORMS constant. */
export type CIPlatformType = (typeof CI_PLATFORMS)[keyof typeof CI_PLATFORMS];

/** Chunk boundary type derived from BOUNDARY_TYPES constant. */
export type BoundaryType = (typeof BOUNDARY_TYPES)[keyof typeof BOUNDARY_TYPES];

/** Protected zone type derived from PROTECTED_ZONE_TYPES constant. */
export type ProtectedZoneType = (typeof PROTECTED_ZONE_TYPES)[keyof typeof PROTECTED_ZONE_TYPES];

// ==================== GitHub App Types ====================

/** Message variant key derived from MESSAGE_VARIANT_CONFIG constant. */
export type MessageVariant = keyof typeof MESSAGE_VARIANT_CONFIG;

// ==================== OpenAI Types ====================

/** Fine-tuning job status derived from FINE_TUNING_STATUS constant. */
export type FineTuningStatus = (typeof FINE_TUNING_STATUS)[keyof typeof FINE_TUNING_STATUS];

// ==================== Event Types ====================

/** Event type identifier derived from EVENT_TYPES constant. */
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Event source identifier derived from EVENT_SOURCES constant. */
export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES];

/** Event severity level derived from EVENT_SEVERITY constant. */
export type EventSeverity = (typeof EVENT_SEVERITY)[keyof typeof EVENT_SEVERITY];

/** Log level identifier derived from LOG_LEVELS constant. */
export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

/** Evidence source identifier derived from EVIDENCE_SOURCES constant. */
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[keyof typeof EVIDENCE_SOURCES];

// ==================== Confidence Types ====================

/** Confidence range for decision matrix. */
export type ConfidenceRange = "very_low" | "low" | "medium" | "high" | "very_high";

/** Confidence level derived from thresholds. */
export type DerivedConfidenceLevel = (typeof CONFIDENCE_LEVEL_THRESHOLDS)[number]["level"];

// ==================== Safety Types ====================

/** Uncertainty pattern configuration type. */
export type UncertaintyPattern = {
  readonly pattern: RegExp;
  readonly penalty: number;
};

/** Cause-action relevance mapping configuration type. */
export type RelevanceRule = {
  readonly causeKeywords: readonly string[];
  readonly actionKeywords: readonly string[];
};

/** Risk level categories. */
export type RiskLevel = "low" | "moderate" | "high" | "critical";

/** Rule category identifiers for audit/debug. */
export type RiskRuleCategory =
  | "notification"
  | "investigation"
  | "service_restart"
  | "configuration"
  | "deployment"
  | "database"
  | "infrastructure"
  | "default";

// ==================== Secrets Types ====================

/** Secret pattern configuration type. */
export type SecretPattern = {
  readonly name: string;
  readonly pattern: RegExp;
};

// ==================== RAG Types ====================

/** Knowledge document type derived from KNOWLEDGE_DOC_TYPES constant. */
export type KnowledgeDocType = (typeof KNOWLEDGE_DOC_TYPES)[keyof typeof KNOWLEDGE_DOC_TYPES];

/** Relationship type derived from RELATIONSHIP_TYPES constant. */
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

/** External source type derived from EXTERNAL_SOURCE_TYPES constant. */
export type ExternalSourceType = (typeof EXTERNAL_SOURCE_TYPES)[keyof typeof EXTERNAL_SOURCE_TYPES];

/** Technology stack tag derived from TECH_STACK_TAGS constant. */
export type TechStackTag = (typeof TECH_STACK_TAGS)[keyof typeof TECH_STACK_TAGS];

/** Embedding tier name derived from EMBEDDING_TIERS constant. */
export type EmbeddingTierName = keyof typeof EMBEDDING_TIERS;

/** RAG metric type derived from RAG_METRIC_TYPES constant. */
export type RAGMetricType = (typeof RAG_METRIC_TYPES)[keyof typeof RAG_METRIC_TYPES];

/** Evidence knowledge document type for mapping. */
export type EvidenceKnowledgeDocType =
  | "runbook"
  | "past_incident"
  | "documentation"
  | "best_practice"
  | "playbook";

// ==================== Redis Types ====================

/** Cache namespace derived from CACHE_NAMESPACES constant. */
export type CacheNamespace = (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];

// ==================== API Types ====================

/** Health status derived from HEALTH_STATUS constant. */
export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/** API response status derived from API_RESPONSE_STATUS constant. */
export type ApiResponseStatus = (typeof API_RESPONSE_STATUS)[keyof typeof API_RESPONSE_STATUS];

// ==================== Slack Bot Types ====================

/** Numeric priority key type. */
export type NumericPriority = keyof typeof PRIORITY_NUMERIC_MAP;

/** String priority value type. */
export type StringPriority = (typeof PRIORITY_NUMERIC_MAP)[NumericPriority];
