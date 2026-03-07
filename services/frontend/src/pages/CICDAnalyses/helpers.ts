/**
 * CICDAnalyses page helper functions.
 */

import { buildSafeGitHubUrl } from "@/lib/urlSafety";

/** Build a commit URL for the given provider. Returns null when the URL cannot be constructed. */
export const buildCommitUrl = (
  repo: string,
  commitSha: string,
  ciProvider: string | null
): string | null => {
  if (ciProvider === null || ciProvider === "github_actions") {
    // Defense-in-depth: validate repository path to prevent URL path traversal
    return buildSafeGitHubUrl(repo, `/commit/${commitSha}`);
  }
  // GitLab and other providers require an instance URL we don't have
  return null;
};
