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
