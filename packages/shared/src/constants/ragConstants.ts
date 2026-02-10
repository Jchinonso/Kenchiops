/**
 * RAG (Retrieval-Augmented Generation) constants.
 * Includes embedding, chunking, similarity, relationships, and cost control.
 */

import type { KnowledgeDocType, EvidenceKnowledgeDocType } from "./types.js";

export type {
  KnowledgeDocType,
  RelationshipType,
  ExternalSourceType,
  TechStackTag,
  EmbeddingTierName,
  RAGMetricType,
  EvidenceKnowledgeDocType,
} from "./types.js";

/**
 * Embedding configuration for RAG operations.
 */
export const EMBEDDING_CONFIG = {
  MODEL: "text-embedding-3-small",
  DIMENSION: 1536,
  MAX_INPUT_TOKENS: 8191,
  TIMEOUT_MS: 30000,
  MAX_BATCH_SIZE: 100,
} as const;

/**
 * Chunking configuration for document processing.
 */
export const CHUNKING_CONFIG = {
  TARGET_TOKENS: 400,
  MIN_TOKENS: 100,
  MAX_TOKENS: 500,
  OVERLAP_RATIO: 0.1,
  CHARS_PER_TOKEN: 4,
  SPLIT_SEARCH_RADIUS_RATIO: 0.2,
} as const;

/**
 * Vector similarity thresholds for RAG retrieval.
 */
export const VECTOR_SIMILARITY_THRESHOLDS = {
  DIFF_CHUNKS: 0.7,
  KNOWLEDGE_DOCS: 0.78,
  INCIDENTS: 0.75,
  DEFAULT_TOP_K: 5,
  MAX_TOP_K: 20,
} as const;

/**
 * Knowledge document types for categorization.
 */
export const KNOWLEDGE_DOC_TYPES = {
  // Operational
  RUNBOOK: "runbook",
  SOP: "sop",
  TROUBLESHOOTING: "troubleshooting",
  // Incident Analysis
  POSTMORTEM: "postmortem",
  KNOWN_ISSUES: "known_issues",
  // CI/CD & DevOps
  CI_CD: "ci_cd",
  DEPLOYMENT: "deployment",
  TESTING: "testing",
  INFRASTRUCTURE: "infrastructure",
  // Technical Reference
  DOCUMENTATION: "documentation",
  API_DOCS: "api_docs",
  ARCHITECTURE: "architecture",
  CONFIG_GUIDE: "config_guide",
  DATABASE: "database",
  // Project Files
  README: "readme",
  CHANGELOG: "changelog",
  // Other
  ONBOARDING: "onboarding",
  EXTERNAL: "external",
  // Passive Learning
  PR_FIX_COMMENT: "pr_fix_comment",
  SLACK_RESOLUTION: "slack_resolution",
  ANALYSIS_LESSON: "analysis_lesson",
  LINKED_FIX: "linked_fix",
} as const;

/**
 * Document types that auto-detect relationships on ingestion.
 * These produce high-value relationship graphs for multi-hop RAG.
 */
export const AUTO_DETECT_RELATIONSHIP_DOC_TYPES: readonly KnowledgeDocType[] = [
  KNOWLEDGE_DOC_TYPES.POSTMORTEM,
  KNOWLEDGE_DOC_TYPES.ANALYSIS_LESSON,
  KNOWLEDGE_DOC_TYPES.LINKED_FIX,
  KNOWLEDGE_DOC_TYPES.PR_FIX_COMMENT,
] as const;

/**
 * Relationship types for Multi-Hop RAG graph traversal.
 */
export const RELATIONSHIP_TYPES = {
  CAUSED_BY: "caused_by",
  RELATED_TO: "related_to",
  MITIGATED_BY: "mitigated_by",
  DEPENDS_ON: "depends_on",
  DUPLICATE_OF: "duplicate_of",
  SUPERSEDES: "supersedes",
  BLOCKS: "blocks",
  PARENT_OF: "parent_of",
  CHILD_OF: "child_of",
} as const;

/**
 * Multi-hop RAG configuration.
 */
export const MULTI_HOP_CONFIG = {
  MAX_HOP_DEPTH: 3,
  MAX_DOCS_PER_HOP: 5,
  MIN_RELATIONSHIP_STRENGTH: 0.5,
  SIMILARITY_DECAY_PER_HOP: 0.9,
  MAX_TOTAL_GRAPH_DOCS: 15,
} as const;

/**
 * Relationship detection configuration.
 */
export const RELATIONSHIP_DETECTION_CONFIG = {
  MAX_RELATED_DOCS: 10,
  MIN_STRENGTH_THRESHOLD: 0.5,
  MIN_ERROR_MESSAGE_LENGTH: 10,
  MAX_ERROR_MESSAGE_LENGTH: 200,
} as const;

/**
 * External source types for Cross-Repo Knowledge.
 */
export const EXTERNAL_SOURCE_TYPES = {
  GITHUB_ISSUES: "github_issues",
  CONFLUENCE: "confluence",
  NOTION: "notion",
  PUBLIC_RUNBOOKS: "public_runbooks",
  INCIDENT_DATABASE: "incident_database",
  COMMUNITY_DOCS: "community_docs",
  CUSTOM_API: "custom_api",
} as const;

/**
 * Technology stack tags for relevance filtering.
 */
export const TECH_STACK_TAGS = {
  // Languages
  JAVASCRIPT: "javascript",
  TYPESCRIPT: "typescript",
  PYTHON: "python",
  GO: "go",
  RUST: "rust",
  JAVA: "java",
  CSHARP: "csharp",
  RUBY: "ruby",
  // Frameworks
  REACT: "react",
  NEXTJS: "nextjs",
  NODE: "node",
  EXPRESS: "express",
  DJANGO: "django",
  FASTAPI: "fastapi",
  SPRING: "spring",
  RAILS: "rails",
  // Infrastructure
  AWS: "aws",
  GCP: "gcp",
  AZURE: "azure",
  KUBERNETES: "kubernetes",
  DOCKER: "docker",
  TERRAFORM: "terraform",
  // Databases
  POSTGRESQL: "postgresql",
  MYSQL: "mysql",
  MONGODB: "mongodb",
  REDIS: "redis",
  ELASTICSEARCH: "elasticsearch",
  // CI/CD
  GITHUB_ACTIONS: "github_actions",
  JENKINS: "jenkins",
  CIRCLECI: "circleci",
  GITLAB_CI: "gitlab_ci",
  // Testing
  JEST: "jest",
  PYTEST: "pytest",
  MOCHA: "mocha",
  CYPRESS: "cypress",
} as const;

/**
 * External source configuration.
 */
export const EXTERNAL_SOURCE_CONFIG = {
  DEFAULT_SYNC_FREQUENCY_HOURS: 24,
  MIN_SYNC_FREQUENCY_HOURS: 1,
  MAX_SYNC_FREQUENCY_HOURS: 168,
  DEFAULT_CREDIBILITY_SCORE: 0.5,
  MIN_CREDIBILITY_THRESHOLD: 0.3,
  MAX_DOCS_PER_SOURCE: 10000,
} as const;

/**
 * TTL policies for document staleness.
 */
export const TTL_POLICIES = {
  DIFF_CHUNKS_DEFAULT_DAYS: 90,
  KNOWLEDGE_DOCS_DEFAULT_DAYS: 365,
  INCIDENT_DOCS_DAYS: 730,
  EXTERNAL_DOCS_DAYS: 30,
  REFRESH_BEFORE_EXPIRY_HOURS: 24,
  MAX_STALE_DOCS_THRESHOLD: 5000,
  DAYS_TO_MS: 86400000,
} as const;

/**
 * Drift detection thresholds.
 */
export const DRIFT_DETECTION_THRESHOLDS = {
  RECALL_AT_5_DROP_PERCENT: 5,
  RECALL_AT_10_DROP_PERCENT: 5,
  MRR_DROP_PERCENT: 10,
  ERROR_RATE_THRESHOLD_PERCENT: 5,
  LATENCY_SLA_MS: 5000,
  MIN_SAMPLE_SIZE: 50,
  TREND_WINDOW_SIZE: 30,
  ANOMALY_STDDEV_THRESHOLD: 2,
  PERCENTAGE_MULTIPLIER: 100,
  MAX_DEVIATION_WHEN_ZERO_BASELINE: 100,
} as const;

/**
 * RAG background job intervals.
 */
export const RAG_JOB_INTERVALS = {
  CLEANUP_MS: 24 * 60 * 60 * 1000,
  DRIFT_DETECTION_MS: 24 * 60 * 60 * 1000,
  REEMBED_CHECK_MS: 6 * 60 * 60 * 1000,
  EXTERNAL_SYNC_MS: 6 * 60 * 60 * 1000,
} as const;

/**
 * RAG evaluation configuration.
 */
export const RAG_EVALUATION_CONFIG = {
  DEFAULT_WINDOW_MINUTES: 60,
} as const;

/**
 * RAG API query defaults.
 */
export const RAG_QUERY_DEFAULTS = {
  STALE_DOCS_LIMIT: 100,
} as const;

/**
 * RAG test case configuration.
 */
export const RAG_TEST_CASE_CONFIG = {
  DEFAULT_MIN_RECALL: 0.8,
  MAX_TEST_CASES_PER_TENANT: 100,
  PRIORITY_CRITICAL: 1,
  PRIORITY_HIGH: 2,
  PRIORITY_MEDIUM: 3,
  PRIORITY_LOW: 4,
  PRIORITY_MINIMAL: 5,
} as const;

/**
 * Embedding tier configurations for cost control.
 */
export const EMBEDDING_TIERS = {
  LIGHT: {
    name: "light",
    model: "text-embedding-3-small",
    dimension: 512,
    costPer1kTokens: 0.00001,
  },
  STANDARD: {
    name: "standard",
    model: "text-embedding-3-small",
    dimension: 1536,
    costPer1kTokens: 0.00002,
  },
  PREMIUM: {
    name: "premium",
    model: "text-embedding-3-large",
    dimension: 3072,
    costPer1kTokens: 0.00013,
  },
} as const;

/**
 * Cost control configuration.
 */
export const COST_CONTROL_CONFIG = {
  DEFAULT_MONTHLY_BUDGET_USD: 0,
  BUDGET_ALERT_THRESHOLD_PERCENT: 80,
  BUDGET_CRITICAL_THRESHOLD_PERCENT: 95,
  TOKENS_PER_COST_UNIT: 1000,
  QUERY_CACHE_TTL_SECONDS: 300,
  EARLY_EXIT_MIN_KEYWORD_MATCHES: 2,
  DEFAULT_TREND_DAYS: 30,
  DEFAULT_COST_RETENTION_DAYS: 90,
  DEFAULT_TOP_CONSUMERS_LIMIT: 10,
  MS_PER_SECOND: 1000,
  DAYS_IN_MONTH: 30,
} as const;

/**
 * Valid embedding tier names as a Set for O(1) validation.
 */
export const VALID_EMBEDDING_TIERS: ReadonlySet<string> = new Set(["LIGHT", "STANDARD", "PREMIUM"]);

/**
 * RAG metric types for tracking.
 */
export const RAG_METRIC_TYPES = {
  RECALL_AT_5: "recall_at_5",
  RECALL_AT_10: "recall_at_10",
  MRR: "mrr",
  EMBEDDING_LATENCY: "embedding_latency",
  EMBEDDING_ERROR_RATE: "embedding_error_rate",
  SEARCH_LATENCY: "search_latency",
  INGESTION_RATE: "ingestion_rate",
  COST_PER_1K_TOKENS: "cost_per_1k_tokens",
} as const;

/**
 * Maps RAG document types to Evidence KnowledgeDocument types.
 * Used when transforming RAG search results to Evidence format.
 */
export const RAG_TO_EVIDENCE_DOC_TYPE_MAP: Readonly<Record<string, EvidenceKnowledgeDocType>> = {
  runbook: "runbook",
  postmortem: "past_incident",
  known_issues: "past_incident",
  troubleshooting: "runbook",
  sop: "runbook",
  documentation: "documentation",
  api_docs: "documentation",
  architecture: "documentation",
  readme: "documentation",
  changelog: "documentation",
  ci_cd: "best_practice",
  deployment: "playbook",
  testing: "best_practice",
  infrastructure: "documentation",
  config_guide: "documentation",
  database: "documentation",
  onboarding: "documentation",
  external: "documentation",
} as const;

// ==================== Reranker Constants ====================

/**
 * Ranking weight configuration for RAG result reranking.
 */
export const RANKING_WEIGHTS = {
  VECTOR_SIMILARITY: 0.55,
  SOURCE_RELIABILITY: 0.2,
  RECENCY_BOOST: 0.15,
  FEEDBACK_SIGNAL: 0.1,
} as const;

/**
 * Recency boost configuration for result freshness scoring.
 */
export const RECENCY_CONFIG = {
  /** Maximum age in days for full recency boost */
  FULL_BOOST_DAYS: 7,
  /** Age in days after which no recency boost applies */
  NO_BOOST_DAYS: 90,
  /** Maximum recency boost value */
  MAX_BOOST: 1.0,
  /** Minimum recency boost value */
  MIN_BOOST: 0.1,
  /** Milliseconds per day */
  MS_PER_DAY: 86400000,
} as const;

/**
 * Metadata boost configuration for contextual relevance.
 */
export const METADATA_BOOSTS = {
  /** Boost for matching repository */
  SAME_REPO: 0.15,
  /** Boost for matching workflow/CI step */
  SAME_WORKFLOW: 0.1,
  /** Boost for matching error signature */
  SAME_ERROR_SIGNATURE: 0.2,
  /** Boost for matching language/framework */
  SAME_LANGUAGE: 0.05,
} as const;

// ==================== Search Constants ====================

/**
 * Search configuration constants for query processing and caching.
 */
export const SEARCH_CONSTANTS = {
  /** Maximum query tokens before truncation */
  MAX_QUERY_TOKENS: 2000,
  /** Cache TTL for query embeddings in seconds (1 hour) */
  EMBEDDING_CACHE_TTL_SECONDS: 3600,
  /** Minimum query length to process */
  MIN_QUERY_LENGTH: 10,
  /** Cache key prefix for query embeddings */
  CACHE_KEY_PREFIX: "rag:embedding:",
} as const;

// ==================== Relationship Detection Constants ====================

/**
 * Strength calculation weights for relationship detection.
 */
export const RELATIONSHIP_STRENGTH_WEIGHTS = {
  SEMANTIC: 0.6,
  PATTERN: 0.3,
  SAME_REPO: 0.1,
} as const;

// ==================== Alert Dispatcher Constants ====================

/**
 * Alert configuration constants for drift detection alerts.
 */
export const ALERT_CONSTANTS = {
  /** Default repository name for system-level alerts */
  DEFAULT_REPOSITORY: "system",
  /** Default installation ID for global alerts */
  DEFAULT_INSTALLATION_ID: 0,
  /** Alert title prefix */
  TITLE_PREFIX: "RAG Drift Alert",
} as const;

// ==================== Governance Constants ====================

/**
 * Governance configuration for RAG health monitoring.
 */
export const GOVERNANCE_CONSTANTS = {
  /** Default batch size for governance operations */
  DEFAULT_BATCH_SIZE: 100,
  /** Maximum allowed pending embeddings before warning */
  MAX_PENDING_THRESHOLD: 1000,
  /** Maximum allowed outdated embeddings before warning */
  MAX_OUTDATED_THRESHOLD: 500,
} as const;

// ==================== Metrics Constants ====================

/**
 * Metrics configuration for RAG performance tracking.
 */
export const METRICS_CONSTANTS = {
  /** Window size for metrics calculation in minutes */
  DEFAULT_WINDOW_MINUTES: 60,
  /** Maximum entries to keep in memory */
  MAX_ENTRIES: 10000,
  /** Cost per 1K tokens for text-embedding-3-small */
  COST_PER_1K_TOKENS_USD: 0.00002,
  /** Milliseconds per minute */
  MS_PER_MINUTE: 60000,
  /** Tokens per cost calculation unit */
  TOKENS_PER_COST_UNIT: 1000,
  /** Error rate threshold for alerts (10%) */
  ERROR_RATE_ALERT_THRESHOLD: 0.1,
  /** Latency threshold for alerts in milliseconds (5 seconds) */
  LATENCY_ALERT_THRESHOLD_MS: 5000,
  /** Percentage multiplier for display */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

// ==================== Resolution Confidence Constants ====================

/**
 * Confidence thresholds for Slack resolution detection.
 */
export const RESOLUTION_CONFIDENCE_THRESHOLDS = {
  MIN_RESOLUTION: 0.2,
  HIGH_CONFIDENCE: 0.6,
  PATTERN_WEIGHT: 0.2,
  REACTION_WEIGHT: 0.2,
  CODE_BLOCK_WEIGHT: 0.15,
  MESSAGE_LENGTH_WEIGHT: 0.1,
  POSITION_WEIGHT: 0.15,
  /** Minimum message length for any length score */
  MIN_LENGTH_CHARS: 50,
  /** Message length threshold for low score */
  LOW_LENGTH_CHARS: 100,
  /** Message length threshold for medium score */
  MEDIUM_LENGTH_CHARS: 300,
  /** Score multiplier for low length messages */
  LOW_LENGTH_MULTIPLIER: 0.3,
  /** Score multiplier for medium length messages */
  MEDIUM_LENGTH_MULTIPLIER: 0.7,
} as const;

// ==================== Ingestion Constants ====================

/**
 * Default configuration for ingestion batch operations.
 */
export const INGESTION_DEFAULTS = {
  BATCH_SIZE: 50,
} as const;

// ==================== Default Tier Config ====================

/**
 * Default tenant tier configuration for cost controls.
 */
export const DEFAULT_TIER_CONFIG_VALUES = {
  PREFERRED_TIER: "STANDARD" as const,
  DEGRADE_ON_BUDGET_WARNING: true,
  ALLOW_PREMIUM: false,
} as const;
