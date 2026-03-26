/**
 * CircleCI Constants
 *
 * Constants for CircleCI webhook processing and API integration.
 *
 * @module constants/circleci
 */

/**
 * CircleCI webhook signature header name.
 * CircleCI uses HMAC-SHA256 with the `circleci-signature` header.
 * Format: `v1=<hex-digest>`
 */
export const CIRCLECI_SIGNATURE_HEADER = "circleci-signature" as const;

/**
 * Prefix for CircleCI HMAC signature values.
 */
export const CIRCLECI_SIGNATURE_PREFIX = "v1=" as const;

/**
 * CircleCI job statuses that represent failures worth analyzing.
 *
 * @see https://circleci.com/docs/webhooks/#job-completed
 */
export const CIRCLECI_FAILURE_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "error",
  "infrastructure_fail",
  "timedout",
  "canceled",
]);

/**
 * Maximum number of failed jobs to fetch per workflow.
 * Caps the log-fetching fan-out to prevent unbounded API calls.
 */
export const CIRCLECI_MAX_FAILED_JOBS = 50 as const;

/**
 * CircleCI API v2 base URL.
 */
export const CIRCLECI_API_BASE_URL = "https://circleci.com/api/v2" as const;
