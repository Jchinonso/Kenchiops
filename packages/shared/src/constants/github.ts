/**
 * GitHub-related Constants
 *
 * Context limits, patterns, status values, and display settings for GitHub operations.
 * This is a barrel file that re-exports from specialized modules.
 *
 * @module constants/github
 */

// ==================== Re-export Limits ====================

export {
  GITHUB_CONTEXT_LIMITS,
  GITHUB_COMMENT_DISPLAY,
  CI_FAILURE_DISPLAY,
  GITHUB_ANNOTATION_LIMITS,
  LOG_PARSING_LIMITS,
  TRUNCATION_WINDOW_CONFIG,
  PR_CONTEXT_CORRELATION,
  SHORT_COMMIT_SHA_LENGTH,
} from "./githubLimits.js";

// ==================== Re-export Patterns ====================

export {
  GITHUB_SIGNATURE,
  FILE_PATH_VALIDATION,
  EXCLUDED_PATH_PATTERNS,
  ERROR_INDICATORS,
  CI_FAILURE_TIER1_PATTERNS,
  CI_FAILURE_TIER2_PATTERNS,
  CI_FAILURE_TIER3_PATTERNS,
  CI_FAILURE_TIER4_PATTERNS,
  CI_FAILURE_PATTERNS,
  FILE_REFERENCE_PATTERNS,
} from "./githubPatterns.js";

// ==================== Re-export Status ====================

export {
  GITHUB_STATUS,
  GITHUB_CONCLUSION,
  GITHUB_ANNOTATION_LEVEL,
  TEXT_SANITIZATION_PATTERNS,
} from "./githubStatus.js";
