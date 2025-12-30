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
