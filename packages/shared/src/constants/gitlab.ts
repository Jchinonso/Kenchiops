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
