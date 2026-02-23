/**
 * GitHub Check Run Filters
 *
 * Shared helpers for identifying which GitHub check_run conclusions
 * and check names should be skipped. Used by both the webhook handler
 * and the GitHub webhook adapter.
 *
 * @module helpers/githubCheckFilters
 */

import { GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";

/**
 * Conclusions that should be skipped (not actual failures).
 */
export const SKIP_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.CANCELLED,
  GITHUB_CHECK_CONCLUSIONS.SKIPPED,
  GITHUB_CHECK_CONCLUSIONS.STALE,
]);

/**
 * Check names that are status/summary checks and should be skipped.
 * These checks aggregate other check results and have no actual failure logs.
 */
const STATUS_CHECK_PATTERNS: readonly RegExp[] = [
  /^ci[\s-_]?success$/i,
  /^ci[\s-_]?status$/i,
  /^all[\s-_]?checks/i,
  /^status[\s-_]?check/i,
  /^branch[\s-_]?protection/i,
  /^required[\s-_]?checks/i,
];

/**
 * Check if a check name is a status/summary check that should be skipped.
 */
export const isStatusCheck = (checkName: string): boolean =>
  STATUS_CHECK_PATTERNS.some((pattern) => pattern.test(checkName));
