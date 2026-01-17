/**
 * RAG (Retrieval-Augmented Generation) constants.
 * Includes embedding, chunking, similarity, relationships, and cost control.
 */

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

export type KnowledgeDocType = (typeof KNOWLEDGE_DOC_TYPES)[keyof typeof KNOWLEDGE_DOC_TYPES];

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

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

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

export type ExternalSourceType = (typeof EXTERNAL_SOURCE_TYPES)[keyof typeof EXTERNAL_SOURCE_TYPES];

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

export type TechStackTag = (typeof TECH_STACK_TAGS)[keyof typeof TECH_STACK_TAGS];

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

export type EmbeddingTierName = keyof typeof EMBEDDING_TIERS;

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
} as const;

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

export type RAGMetricType = (typeof RAG_METRIC_TYPES)[keyof typeof RAG_METRIC_TYPES];

/**
 * Evidence knowledge document type for mapping.
 */
export type EvidenceKnowledgeDocType =
  | "runbook"
  | "past_incident"
  | "documentation"
  | "best_practice"
  | "playbook";

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
