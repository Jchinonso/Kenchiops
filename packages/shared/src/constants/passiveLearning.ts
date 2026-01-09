/**
 * Constants for passive learning knowledge capture.
 *
 * Defines patterns, thresholds, and configuration for automatically
 * capturing knowledge from PR comments, Slack threads, and successful analyses.
 *
 * @module constants/passiveLearning
 */

/**
 * Time conversion constants for passive learning calculations.
 */
export const PASSIVE_LEARNING_TIME = {
  /** Minutes per hour */
  MINUTES_PER_HOUR: 60,
  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
  /** Milliseconds per second */
  MS_PER_SECOND: 1000,
  /** Percentage multiplier */
  PERCENTAGE_MULTIPLIER: 100,
  /** Minimum word length to count in similarity checks */
  MIN_WORD_LENGTH: 3,
  /** Maximum characters for title prefix */
  TITLE_PREFIX_MAX_LENGTH: 80,
} as const;

/**
 * Patterns for detecting fix explanations in PR comments.
 * These patterns indicate the comment contains valuable fix knowledge.
 */
export const FIX_COMMENT_PATTERNS = {
  /** High-confidence fix indicators */
  HIGH_CONFIDENCE: [
    /the\s+(issue|problem|error|bug)\s+was/i,
    /root\s+cause\s*(was|is|:)/i,
    /fix(ed)?\s*(by|with|:)/i,
    /solution\s*:/i,
    /resolved\s+by/i,
    /the\s+fix\s+(is|was)/i,
  ] as const,

  /** Medium-confidence fix indicators */
  MEDIUM_CONFIDENCE: [
    /fix(ed|es|ing)?/i,
    /resolv(ed|es|ing)?/i,
    /turns\s+out/i,
    /workaround\s*:/i,
    /this\s+(fixed|resolved|solved)/i,
    /after\s+(changing|updating|modifying)/i,
    /the\s+reason\s+(was|is)/i,
  ] as const,

  /** Low-confidence but potentially useful */
  LOW_CONFIDENCE: [
    /updated?\s+the/i,
    /changed?\s+to/i,
    /now\s+(works|working|passes)/i,
    /should\s+be\s+good/i,
  ] as const,
} as const;

/**
 * Patterns to exclude - comments that match these are not fix explanations.
 */
export const FIX_COMMENT_EXCLUSIONS = {
  /** Bot comment patterns to exclude */
  BOT_PATTERNS: [
    /^dependabot/i,
    /^renovate/i,
    /^github-actions/i,
    /^codecov/i,
    /^sonarcloud/i,
    /\[bot\]$/i,
  ] as const,

  /** Short/trivial comments to exclude */
  TRIVIAL_PATTERNS: [
    /^lgtm$/i,
    /^ship\s*it$/i,
    /^\+1$/,
    /^nice$/i,
    /^thanks?$/i,
    /^approved$/i,
  ] as const,
} as const;

/**
 * Configuration for PR fix comment ingestion.
 */
export const PR_FIX_COMMENT_CONFIG = {
  /** Maximum PR comments to fetch for fix detection */
  MAX_COMMENTS_TO_FETCH: 50,

  /** Minimum comment length to consider (characters) */
  MIN_COMMENT_LENGTH: 50,

  /** Maximum comment length to store (characters) */
  MAX_COMMENT_LENGTH: 5000,

  /** Minimum confidence score to ingest (0-1) */
  MIN_CONFIDENCE_THRESHOLD: 0.3,

  /** High confidence threshold for priority ingestion */
  HIGH_CONFIDENCE_THRESHOLD: 0.7,

  /** Maximum comments to process per PR */
  MAX_COMMENTS_PER_PR: 20,

  /** Time window after failure to look for fix comments (hours) */
  FIX_COMMENT_WINDOW_HOURS: 72,

  /** Similarity threshold for deduplication */
  DEDUP_SIMILARITY_THRESHOLD: 0.92,

  /** Confidence score weights for pattern matches */
  CONFIDENCE_WEIGHTS: {
    HIGH_PATTERN_MATCH: 0.4,
    MEDIUM_PATTERN_MATCH: 0.25,
    LOW_PATTERN_MATCH: 0.1,
    HAS_CODE_BLOCK: 0.15,
    HAS_FILE_REFERENCE: 0.1,
    LONGER_EXPLANATION: 0.1,
  } as const,

  /** Minimum word count for "longer explanation" bonus */
  LONGER_EXPLANATION_WORD_COUNT: 30,
} as const;

/**
 * Configuration for Slack resolution capture.
 */
export const SLACK_RESOLUTION_CONFIG = {
  /** Reactions that indicate resolution */
  RESOLUTION_REACTIONS: [
    "white_check_mark",
    "heavy_check_mark",
    "done",
    "resolved",
    "thumbsup",
  ] as const,

  /** Keywords that indicate resolution in thread */
  RESOLUTION_KEYWORDS: [
    /fixed\s+it/i,
    /all\s+good\s+now/i,
    /resolved/i,
    /it('s|\s+is)\s+working/i,
    /merged\s+the\s+fix/i,
    /deployed/i,
    /issue\s+resolved/i,
    /problem\s+solved/i,
  ] as const,

  /** Minimum thread length to consider (messages) */
  MIN_THREAD_LENGTH: 2,

  /** Maximum thread messages to capture */
  MAX_THREAD_MESSAGES: 50,
} as const;

/**
 * Configuration for analysis lesson extraction.
 */
export const ANALYSIS_LESSON_CONFIG = {
  /** Minimum confidence score for the original analysis */
  MIN_ANALYSIS_CONFIDENCE: 0.6,

  /** Require explicit "Helpful" feedback */
  REQUIRE_POSITIVE_FEEDBACK: true,

  /** Include failed recommendations in lessons */
  INCLUDE_FAILED_RECOMMENDATIONS: false,

  /** Time to wait after feedback before extracting lesson (minutes) */
  EXTRACTION_DELAY_MINUTES: 5,

  /** Maximum length for normalized error signature components */
  MAX_SIGNATURE_COMPONENT_LENGTH: 100,

  /** Maximum length for cause preview in title */
  MAX_CAUSE_PREVIEW_LENGTH: 60,

  /** Maximum test failures to include in lesson content */
  MAX_TEST_FAILURES_DISPLAYED: 5,

  /** Maximum annotations to include in lesson content */
  MAX_ANNOTATIONS_DISPLAYED: 5,

  /** Maximum length for annotation message in lesson content */
  MAX_ANNOTATION_MESSAGE_LENGTH: 300,
} as const;

/**
 * Quality scoring weights for knowledge documents.
 */
export const KNOWLEDGE_QUALITY_WEIGHTS = {
  /** Weight for source reliability (PR comment > Slack > auto-generated) */
  SOURCE_RELIABILITY: 0.25,

  /** Weight for positive feedback signals */
  FEEDBACK_SIGNAL: 0.25,

  /** Weight for recency (newer = higher for evolving issues) */
  RECENCY: 0.2,

  /** Weight for specificity (repo-specific > generic) */
  SPECIFICITY: 0.15,

  /** Weight for retrieval frequency (often retrieved = valuable) */
  RETRIEVAL_FREQUENCY: 0.15,
} as const;

/**
 * Source reliability scores for different knowledge sources.
 */
export const SOURCE_RELIABILITY_SCORES = {
  /** Manual team documentation (highest reliability) */
  TEAM_DOCS: 1.0,

  /** Linked commit fixes: failure + commit message + diff (very high reliability) */
  LINKED_FIX: 0.9,

  /** PR comments with fix explanations */
  PR_FIX_COMMENT: 0.85,

  /** Slack resolution threads */
  SLACK_RESOLUTION: 0.75,

  /** Auto-extracted analysis lessons */
  ANALYSIS_LESSON: 0.7,

  /** External curated sources */
  EXTERNAL: 0.6,
} as const;

/**
 * Garbage collection configuration for knowledge documents.
 */
export const KNOWLEDGE_GC_CONFIG = {
  /** Days without retrieval before marking for review */
  STALE_THRESHOLD_DAYS: 90,

  /** Days without retrieval before archival */
  ARCHIVE_THRESHOLD_DAYS: 180,

  /** Minimum negative feedback ratio to reduce ranking */
  NEGATIVE_FEEDBACK_THRESHOLD: 0.3,

  /** Maximum documents per tenant per type */
  MAX_DOCS_PER_TENANT_TYPE: 1000,
} as const;

/**
 * Configuration for feedback URL signing.
 */
export const FEEDBACK_URL_CONFIG = {
  /** Default expiry time for feedback URLs (7 days in milliseconds) */
  DEFAULT_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

  /** Days in milliseconds multiplier */
  DAYS_TO_MS: 24 * 60 * 60 * 1000,
} as const;
