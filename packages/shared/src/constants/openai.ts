/**
 * OpenAI and text processing constants.
 */

/**
 * OpenAI API configuration defaults.
 */
export const OPENAI_DEFAULTS = {
  TEMPERATURE: 0.1,
  /** Default model for analysis */
  MODEL: "gpt-4-turbo-2024-04-09",
  /** Default max tokens for responses */
  MAX_TOKENS: 4096,
} as const;

/**
 * OpenAI API configuration constants.
 */
export const OPENAI_CONSTANTS = {
  MAX_PROMPT_TOKENS: 8000, // Leave room for response
  MAX_RETRIES: 3,
  DEFAULT_TIMEOUT_MS: 90000,
  TOKEN_BUFFER: 1000, // Buffer for event and instructions
  EXPONENTIAL_BACKOFF_BASE: 2, // Base for exponential backoff: 2^attempt
  CHARS_PER_TOKEN_ESTIMATE: 4, // Rough estimate: ~4 chars per token
  RATE_LIMIT_STATUS_CODE: 429,
  /** Circuit breaker failure threshold before opening */
  CIRCUIT_BREAKER_THRESHOLD: 3,
  /** Circuit breaker reset timeout in milliseconds (60 seconds) */
  CIRCUIT_BREAKER_RESET_MS: 60000,
} as const;

/**
 * Evidence truncation thresholds (token-based).
 */
export const EVIDENCE_TRUNCATION = {
  MIN_TOKENS_FOR_COMMITS: 500,
  MIN_TOKENS_FOR_DOCS: 1000,
  MAX_ERROR_LOGS: 10,
  MAX_RECENT_COMMITS: 5,
  MAX_HIGH_SIMILARITY_DOCS: 3,
  MAX_ADDITIONAL_LOGS: 20,
} as const;

/**
 * String matching configuration.
 */
export const MATCHING_CONFIG = {
  COMMIT_PREFIX_LENGTH: 7,
  LOG_PREFIX_LENGTH: 50,
  LOG_COMPARISON_PREFIX_LENGTH: 30,
  SHA_PREFIX_MIN_LENGTH: 6,
  SHA_PREFIX_MAX_LENGTH: 12,
  QUOTED_TEXT_MIN_LENGTH: 10,
} as const;

/**
 * SHA pattern for matching commit hashes (6-40 hex characters).
 * Pre-compiled for reuse across validation functions.
 */
export const SHA_PATTERN = /\b[0-9a-f]{6,40}\b/gi;
export const SHA_PATTERN_SINGLE = /\b[0-9a-f]{6,40}\b/i;

/**
 * Combined pattern for extracting quoted text (single and double quotes).
 * Captures content inside quotes without the quotes themselves.
 */
export const QUOTED_TEXT_PATTERN = /["']([^"']+)["']/g;

/**
 * OpenAI-related error and default messages.
 */
export const OPENAI_MESSAGES = {
  NO_CONTENT: "No content in OpenAI response",
  NO_JSON_FOUND: "No JSON found in response",
  NO_SUMMARY: "No summary provided",
  UNKNOWN_ERROR: "Unknown OpenAI error occurred",
} as const;

/**
 * Embedding configuration for RAG operations.
 * Uses text-embedding-3-small for optimal cost/performance balance.
 */
export const EMBEDDING_CONFIG = {
  /** OpenAI embedding model */
  MODEL: "text-embedding-3-small",
  /** Vector dimension for text-embedding-3-small */
  DIMENSION: 1536,
  /** Maximum input tokens for embedding model */
  MAX_INPUT_TOKENS: 8191,
  /** Timeout for embedding API calls in milliseconds */
  TIMEOUT_MS: 30000,
  /** Maximum texts to embed in a single batch */
  MAX_BATCH_SIZE: 100,
} as const;

/**
 * Chunking configuration for document processing.
 * Optimized for semantic coherence and retrieval quality.
 */
export const CHUNKING_CONFIG = {
  /** Target token count per chunk */
  TARGET_TOKENS: 400,
  /** Minimum token count per chunk */
  MIN_TOKENS: 100,
  /** Maximum token count per chunk */
  MAX_TOKENS: 500,
  /** Overlap percentage between adjacent chunks (0.1 = 10%) */
  OVERLAP_RATIO: 0.1,
  /** Characters per token estimate for chunking */
  CHARS_PER_TOKEN: 4,
  /** Search radius ratio for finding split boundaries (20% of target) */
  SPLIT_SEARCH_RADIUS_RATIO: 0.2,
} as const;

/**
 * Vector similarity thresholds for RAG retrieval.
 * Higher thresholds = more relevant but fewer results.
 */
export const VECTOR_SIMILARITY_THRESHOLDS = {
  /** Minimum similarity for diff chunk matches */
  DIFF_CHUNKS: 0.7,
  /** Minimum similarity for knowledge document matches */
  KNOWLEDGE_DOCS: 0.78,
  /** Minimum similarity for incident matches */
  INCIDENTS: 0.75,
  /** Default top-K results to retrieve */
  DEFAULT_TOP_K: 5,
  /** Maximum top-K results to allow */
  MAX_TOP_K: 20,
} as const;

/**
 * Knowledge document types for categorization.
 * Covers operational docs, incident analysis, technical references, and CI/DevOps contexts.
 */
export const KNOWLEDGE_DOC_TYPES = {
  // === Operational ===
  /** Operational procedures for handling incidents */
  RUNBOOK: "runbook",
  /** Standard operating procedures */
  SOP: "sop",
  /** Step-by-step troubleshooting guides */
  TROUBLESHOOTING: "troubleshooting",

  // === Incident Analysis ===
  /** Post-incident analysis and lessons learned */
  POSTMORTEM: "postmortem",
  /** Known issues and bugs documentation */
  KNOWN_ISSUES: "known_issues",

  // === CI/CD & DevOps ===
  /** CI/CD pipeline documentation and workflows */
  CI_CD: "ci_cd",
  /** Deployment guides and playbooks */
  DEPLOYMENT: "deployment",
  /** Testing guidelines and best practices */
  TESTING: "testing",
  /** Infrastructure documentation (Terraform, K8s, etc.) */
  INFRASTRUCTURE: "infrastructure",

  // === Technical Reference ===
  /** General technical documentation */
  DOCUMENTATION: "documentation",
  /** API reference documentation */
  API_DOCS: "api_docs",
  /** Architecture decision records and system design */
  ARCHITECTURE: "architecture",
  /** Configuration and environment setup guides */
  CONFIG_GUIDE: "config_guide",
  /** Database schemas, migrations, and data models */
  DATABASE: "database",

  // === Project Files ===
  /** Project README files */
  README: "readme",
  /** Release notes and change history */
  CHANGELOG: "changelog",

  // === Other ===
  /** Developer onboarding documentation */
  ONBOARDING: "onboarding",
  /** External curated documentation (tenant opt-in) */
  EXTERNAL: "external",

  // === Passive Learning (Auto-Generated) ===
  /** Fix explanations extracted from PR comments */
  PR_FIX_COMMENT: "pr_fix_comment",
  /** Resolution context from Slack threads */
  SLACK_RESOLUTION: "slack_resolution",
  /** Lessons learned from successful AI analyses */
  ANALYSIS_LESSON: "analysis_lesson",
} as const;

/** Type for knowledge document categories */
export type KnowledgeDocType = (typeof KNOWLEDGE_DOC_TYPES)[keyof typeof KNOWLEDGE_DOC_TYPES];

/**
 * Tenant prompt configuration limits.
 */
export const TENANT_PROMPT_LIMITS = {
  /** Maximum recommendations allowed per analysis */
  MAX_RECOMMENDATIONS: 10,
  /** Minimum recommendations per analysis */
  MIN_RECOMMENDATIONS: 1,
  /** Maximum length of custom instructions in characters */
  MAX_CUSTOM_INSTRUCTIONS_LENGTH: 2000,
} as const;

/**
 * Model versioning constants.
 */
export const MODEL_VERSIONING = {
  /** Hash multiplier for deterministic A/B test assignment */
  HASH_MULTIPLIER: 31,
  /** Modulo value for percentage-based hash (0-99) */
  HASH_MODULO: 100,
  /** Baseline model version ID */
  BASELINE_VERSION_ID: "base_v1",
  /** Baseline model name */
  BASELINE_VERSION_NAME: "Base Model",
  /** Baseline model description */
  BASELINE_DESCRIPTION: "Default OpenAI model without fine-tuning",
  /** Baseline model creation date (epoch start for versioning) */
  BASELINE_CREATED_AT: "2024-01-01T00:00:00Z",
} as const;

/**
 * Dataset extraction and validation thresholds.
 */
export const DATASET_THRESHOLDS = {
  /** Minimum examples recommended for fine-tuning */
  MIN_EXAMPLES: 10,
  /** Default extraction limit */
  DEFAULT_EXTRACTION_LIMIT: 1000,
  /** Minimum positive class ratio for balanced dataset */
  MIN_POSITIVE_RATIO: 0.2,
  /** Maximum positive class ratio for balanced dataset */
  MAX_POSITIVE_RATIO: 0.8,
  /** Minimum average confidence for quality dataset */
  MIN_AVG_CONFIDENCE: 0.5,
  /** Default minimum feedback count per analysis */
  DEFAULT_MIN_FEEDBACK: 1,
} as const;

/**
 * Fine-tuning API configuration constants.
 */
export const FINE_TUNING_CONFIG = {
  /** Default base model for fine-tuning */
  DEFAULT_BASE_MODEL: "gpt-4o-mini-2024-07-18",
  /** Default number of epochs */
  DEFAULT_EPOCHS: 3,
  /** Job polling interval in milliseconds */
  POLL_INTERVAL_MS: 30000,
  /** Maximum poll attempts before timeout */
  MAX_POLL_ATTEMPTS: 120,
  /** Seconds to milliseconds multiplier for timestamp conversion */
  TIMESTAMP_MULTIPLIER: 1000,
  /** Default job list limit */
  DEFAULT_JOB_LIST_LIMIT: 10,
} as const;

/**
 * Fine-tuning job status values.
 */
export const FINE_TUNING_STATUS = {
  VALIDATING_FILES: "validating_files",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

/** Type for fine-tuning job status values. */
export type FineTuningStatus = (typeof FINE_TUNING_STATUS)[keyof typeof FINE_TUNING_STATUS];

// ==================== Phase 4 Constants ====================

/**
 * Relationship types for Multi-Hop RAG graph traversal.
 * Defines how incidents and documents relate to each other.
 */
export const RELATIONSHIP_TYPES = {
  /** Document A was caused by Document B */
  CAUSED_BY: "caused_by",
  /** Documents are related but no causal link */
  RELATED_TO: "related_to",
  /** Document A mitigated issue in Document B */
  MITIGATED_BY: "mitigated_by",
  /** Document A depends on Document B */
  DEPENDS_ON: "depends_on",
  /** Document A is a duplicate of Document B */
  DUPLICATE_OF: "duplicate_of",
  /** Document A supersedes (replaces) Document B */
  SUPERSEDES: "supersedes",
  /** Document A blocks resolution of Document B */
  BLOCKS: "blocks",
  /** Document A is the parent of Document B */
  PARENT_OF: "parent_of",
  /** Document A is a child of Document B */
  CHILD_OF: "child_of",
} as const;

/** Type for relationship types */
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

/**
 * Multi-hop RAG configuration.
 */
export const MULTI_HOP_CONFIG = {
  /** Maximum depth for graph traversal */
  MAX_HOP_DEPTH: 3,
  /** Maximum related documents to retrieve per hop */
  MAX_DOCS_PER_HOP: 5,
  /** Minimum relationship strength to follow */
  MIN_RELATIONSHIP_STRENGTH: 0.5,
  /** Similarity decay factor per hop (0.9 = 10% decay) */
  SIMILARITY_DECAY_PER_HOP: 0.9,
  /** Maximum total documents from graph traversal */
  MAX_TOTAL_GRAPH_DOCS: 15,
} as const;

/**
 * External source types for Cross-Repo Knowledge.
 */
export const EXTERNAL_SOURCE_TYPES = {
  /** GitHub issue collections */
  GITHUB_ISSUES: "github_issues",
  /** Confluence documentation */
  CONFLUENCE: "confluence",
  /** Notion documentation */
  NOTION: "notion",
  /** Public runbook repositories */
  PUBLIC_RUNBOOKS: "public_runbooks",
  /** Incident databases (e.g., public postmortems) */
  INCIDENT_DATABASE: "incident_database",
  /** Community documentation */
  COMMUNITY_DOCS: "community_docs",
  /** Custom API endpoints */
  CUSTOM_API: "custom_api",
} as const;

/** Type for external source types */
export type ExternalSourceType = (typeof EXTERNAL_SOURCE_TYPES)[keyof typeof EXTERNAL_SOURCE_TYPES];

/**
 * Technology stack tags for relevance filtering.
 * Used to match external docs with tenant tech stack.
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

/** Type for tech stack tags */
export type TechStackTag = (typeof TECH_STACK_TAGS)[keyof typeof TECH_STACK_TAGS];

/**
 * External source configuration.
 */
export const EXTERNAL_SOURCE_CONFIG = {
  /** Default sync frequency in hours */
  DEFAULT_SYNC_FREQUENCY_HOURS: 24,
  /** Minimum sync frequency in hours */
  MIN_SYNC_FREQUENCY_HOURS: 1,
  /** Maximum sync frequency in hours */
  MAX_SYNC_FREQUENCY_HOURS: 168,
  /** Default credibility score for new sources */
  DEFAULT_CREDIBILITY_SCORE: 0.5,
  /** Minimum credibility for inclusion in results */
  MIN_CREDIBILITY_THRESHOLD: 0.3,
  /** Maximum documents per external source */
  MAX_DOCS_PER_SOURCE: 10000,
} as const;

/**
 * TTL (Time-To-Live) policies for document staleness.
 */
export const TTL_POLICIES = {
  /** Default TTL for diff chunks in days */
  DIFF_CHUNKS_DEFAULT_DAYS: 90,
  /** Default TTL for knowledge docs in days */
  KNOWLEDGE_DOCS_DEFAULT_DAYS: 365,
  /** TTL for incident/postmortem docs in days */
  INCIDENT_DOCS_DAYS: 730,
  /** TTL for external docs in days */
  EXTERNAL_DOCS_DAYS: 30,
  /** Hours before expiry to trigger re-ingestion */
  REFRESH_BEFORE_EXPIRY_HOURS: 24,
  /** Maximum stale documents before forced cleanup */
  MAX_STALE_DOCS_THRESHOLD: 5000,
  /** Days in milliseconds multiplier */
  DAYS_TO_MS: 86400000,
} as const;

/**
 * Automated QA drift detection thresholds.
 */
export const DRIFT_DETECTION_THRESHOLDS = {
  /** Recall@5 degradation threshold (5% drop = alert) */
  RECALL_AT_5_DROP_PERCENT: 5,
  /** Recall@10 degradation threshold */
  RECALL_AT_10_DROP_PERCENT: 5,
  /** MRR degradation threshold (10% drop = alert) */
  MRR_DROP_PERCENT: 10,
  /** Embedding error rate threshold */
  ERROR_RATE_THRESHOLD_PERCENT: 5,
  /** Latency SLA breach threshold in milliseconds */
  LATENCY_SLA_MS: 5000,
  /** Minimum sample size for drift detection */
  MIN_SAMPLE_SIZE: 50,
  /** Number of historical data points for trend analysis */
  TREND_WINDOW_SIZE: 30,
  /** Standard deviations for anomaly detection */
  ANOMALY_STDDEV_THRESHOLD: 2,
  /** Percentage multiplier for deviation calculations */
  PERCENTAGE_MULTIPLIER: 100,
  /** Maximum deviation value when baseline is zero */
  MAX_DEVIATION_WHEN_ZERO_BASELINE: 100,
} as const;

/**
 * RAG test case configuration.
 */
export const RAG_TEST_CASE_CONFIG = {
  /** Default minimum recall expected */
  DEFAULT_MIN_RECALL: 0.8,
  /** Maximum test cases per tenant */
  MAX_TEST_CASES_PER_TENANT: 100,
  /** Test case priorities (1=critical, 5=low) */
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
  /** Light tier: faster, cheaper, lower quality */
  LIGHT: {
    name: "light",
    model: "text-embedding-3-small",
    dimension: 512,
    costPer1kTokens: 0.00001,
  },
  /** Standard tier: balanced cost/quality */
  STANDARD: {
    name: "standard",
    model: "text-embedding-3-small",
    dimension: 1536,
    costPer1kTokens: 0.00002,
  },
  /** Premium tier: highest quality, higher cost */
  PREMIUM: {
    name: "premium",
    model: "text-embedding-3-large",
    dimension: 3072,
    costPer1kTokens: 0.00013,
  },
} as const;

/** Type for embedding tier names */
export type EmbeddingTierName = keyof typeof EMBEDDING_TIERS;

/**
 * Cost control configuration.
 */
export const COST_CONTROL_CONFIG = {
  /** Default monthly budget in USD (0 = unlimited) */
  DEFAULT_MONTHLY_BUDGET_USD: 0,
  /** Budget alert threshold (80% consumed) */
  BUDGET_ALERT_THRESHOLD_PERCENT: 80,
  /** Budget critical threshold (95% consumed) */
  BUDGET_CRITICAL_THRESHOLD_PERCENT: 95,
  /** Tokens per cost calculation unit */
  TOKENS_PER_COST_UNIT: 1000,
  /** Query cache TTL for early exit optimization (seconds) */
  QUERY_CACHE_TTL_SECONDS: 300,
  /** Minimum keyword matches for early exit skip */
  EARLY_EXIT_MIN_KEYWORD_MATCHES: 2,
  /** Default days for cost trend analysis */
  DEFAULT_TREND_DAYS: 30,
  /** Default retention days for cost records */
  DEFAULT_COST_RETENTION_DAYS: 90,
  /** Default top consumers limit */
  DEFAULT_TOP_CONSUMERS_LIMIT: 10,
  /** Milliseconds per second for TTL calculations */
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

/** Type for RAG metric types */
export type RAGMetricType = (typeof RAG_METRIC_TYPES)[keyof typeof RAG_METRIC_TYPES];
