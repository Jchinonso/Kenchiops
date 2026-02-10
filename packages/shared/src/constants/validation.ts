/**
 * Validation patterns and constants.
 */

/**
 * Email validation regex pattern.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Slack channel ID regex pattern.
 * Matches channel IDs that start with C (public), D (DM), or G (private/group).
 * Example: C0A4FFS1086, D01234567, G0ABCDEFG
 */
export const SLACK_CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]+$/;

/**
 * Default error message for validation failures.
 */
export const DEFAULT_VALIDATION_ERROR_MESSAGE = "validation failed" as const;

/**
 * Dangerous keywords that should not appear in LLM-recommended actions.
 */
export const DANGEROUS_KEYWORDS = [
  "delete",
  "drop",
  "truncate",
  "force",
  "disable",
  "remove all",
  "destroy",
  "--force",
  "rm -rf",
] as const;

/**
 * Compiled regex pattern for dangerous keywords (memoized).
 * Created once at module load time for performance.
 */
export const DANGEROUS_KEYWORDS_PATTERN = ((): RegExp => {
  const escapedKeywords = DANGEROUS_KEYWORDS.map((keyword) =>
    keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`\\b(${escapedKeywords.join("|")})\\b`, "i");
})();

// ==================== Hallucination Detection Constants ====================

/**
 * Hallucination detection configuration.
 */
export const HALLUCINATION_CONFIG = {
  /** Minimum claim length to extract */
  MIN_CLAIM_LENGTH: 20,
  /** Maximum claim length to extract */
  MAX_CLAIM_LENGTH: 500,
  /** Minimum word length for claim verification (filters stopwords) */
  MIN_SIGNIFICANT_WORD_LENGTH: 4,
  /** Minimum matched words ratio for claim support */
  CLAIM_SUPPORT_WORD_RATIO: 0.3,
  /** Minimum matched words count for claim support */
  MIN_MATCHED_WORDS: 3,
  /** Maximum text to analyze (DoS prevention) */
  MAX_TEXT_LENGTH: 50_000,
  /** Truncate matched text in indicators to this length */
  MATCH_TEXT_TRUNCATE_LENGTH: 100,
} as const;

/**
 * Text characteristic thresholds for hallucination risk.
 */
export const HALLUCINATION_TEXT_THRESHOLDS = {
  /** Average sentence length above this is suspicious */
  SUSPICIOUS_AVG_SENTENCE_LENGTH: 150,
  /** Number density (per 100 chars) above this is suspicious */
  SUSPICIOUS_NUMBER_DENSITY: 2,
  /** Multiple specific dates/years above this count is suspicious */
  SUSPICIOUS_DATE_COUNT: 3,
  /** Minimum text length for reliable analysis */
  MIN_RELIABLE_TEXT_LENGTH: 100,
} as const;

/**
 * Common stopwords to exclude from claim verification.
 * These words are too generic to indicate meaningful claim support.
 */
export const CLAIM_STOPWORDS: ReadonlySet<string> = new Set([
  "there",
  "which",
  "about",
  "error",
  "would",
  "could",
  "should",
  "being",
  "these",
  "those",
  "their",
  "other",
  "where",
  "every",
  "after",
  "before",
  "while",
  "since",
  "during",
  "that",
  "this",
  "what",
  "when",
  "have",
  "been",
  "from",
  "with",
  "they",
  "will",
  "more",
  "some",
  "than",
  "into",
  "only",
  "over",
  "such",
  "also",
  "back",
  "most",
  "made",
  "then",
  "them",
]);

// ==================== Sanitization Constants ====================

/**
 * Sanitization configuration.
 */
export const SANITIZATION_CONFIG = {
  /** Maximum input length for sanitization (DoS prevention) */
  MAX_INPUT_LENGTH: 100_000,
  /** Maximum command length for validation */
  MAX_COMMAND_LENGTH: 10_000,
  /** Maximum path length for sanitization */
  MAX_PATH_LENGTH: 4096,
} as const;

/**
 * Command validation risk thresholds.
 */
export const COMMAND_RISK_THRESHOLDS = {
  /** Number of high-risk patterns to trigger critical level */
  CRITICAL_HIGH_RISK_COUNT: 2,
} as const;

// ==================== Input Validation Limits ====================

/**
 * Input validation limits for DoS prevention.
 */
export const INPUT_VALIDATION_LIMITS = {
  /** Maximum text length for uncertainty detection */
  MAX_UNCERTAINTY_TEXT_LENGTH: 50_000,
  /** Maximum text length for evidence alignment */
  MAX_EVIDENCE_TEXT_LENGTH: 100_000,
  /** Maximum number of logs to check for alignment */
  MAX_LOGS_TO_CHECK: 100,
  /** Maximum number of commits to check for alignment */
  MAX_COMMITS_TO_CHECK: 50,
  /** Maximum number of related docs to check */
  MAX_RELATED_DOCS_TO_CHECK: 20,
} as const;
