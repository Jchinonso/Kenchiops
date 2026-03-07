/**
 * GitLab CI Constants
 *
 * Constants for GitLab CI webhook processing and integration.
 *
 * @module constants/gitlab
 */

/**
 * GitLab webhook token header name.
 * Unlike GitHub (HMAC signature), GitLab uses a plain secret token
 * sent via the X-Gitlab-Token header.
 */
export const GITLAB_TOKEN_HEADER = "x-gitlab-token" as const;

/**
 * Regex to extract the project path from a GitLab homepage URL.
 * Matches: https://gitlab.com/group/subgroup/project
 * Captures: group/subgroup/project
 */
export const GITLAB_HOMEPAGE_PATH_PATTERN = /^https?:\/\/[^/]+\/(.+)$/;

/**
 * GitLab job statuses that represent failures worth analyzing.
 */
export const GITLAB_FAILURE_STATUSES: ReadonlySet<string> = new Set(["failed"]);

/**
 * Maximum number of failed jobs to fetch per pipeline.
 * Caps the trace-fetching fan-out to prevent unbounded API calls
 * on pipelines with many failed jobs (e.g., monorepo matrix builds).
 */
export const GITLAB_MAX_FAILED_JOBS = 50 as const;
