/**
 * CICDAnalyses page helper functions.
 */

/** Build a commit URL for the given provider. Returns null when the URL cannot be constructed. */
export const buildCommitUrl = (
  repo: string,
  commitSha: string,
  ciProvider: string | null
): string | null => {
  if (ciProvider === null || ciProvider === "github_actions") {
    return `https://github.com/${repo}/commit/${commitSha}`;
  }
  // GitLab and other providers require an instance URL we don't have
  return null;
};
