/**
 * URL Safety Utilities
 *
 * Validates URLs before rendering them as clickable links to prevent
 * protocol injection attacks (javascript:, data:, vbscript: URIs).
 *
 * Used as defense-in-depth: even when URLs come from our own API,
 * we validate the protocol to guard against stored data injection.
 */

/**
 * Validate that a URL uses a safe protocol (http or https only).
 * Blocks javascript:, data:, vbscript:, and other dangerous URI schemes.
 *
 * Returns false for malformed URLs that cannot be parsed.
 */
export const isSafeUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Validate that a string is a safe GitHub "owner/repo" path segment.
 * Prevents path traversal (../) and special characters that could redirect
 * users to attacker-controlled domains when used in GitHub URLs.
 *
 * Valid: "octocat/Hello-World", "my-org/my.repo", "user123/repo_name"
 * Invalid: "../../evil.com", "../foo", "owner/repo/../../evil"
 */
export const isSafeRepoPath = (repoPath: string): boolean => {
  // Must match "owner/repo" — alphanumeric, hyphens, underscores, dots only
  // No path traversal, no leading slashes, no encoded characters
  if (!repoPath || repoPath.includes("..") || repoPath.includes("%")) {
    return false;
  }
  // Allow: letters, digits, hyphens, underscores, dots, and exactly one slash
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repoPath);
};

/**
 * Build a safe GitHub URL for a repository path (owner/repo).
 * Returns null if the repository path fails validation.
 */
export const buildSafeGitHubUrl = (repoPath: string, suffix?: string): string | null => {
  if (!isSafeRepoPath(repoPath)) {
    return null;
  }
  if (suffix !== undefined) {
    if (suffix.includes("..") || suffix.includes("%")) {
      return null;
    }
    if (!/^\/[a-zA-Z0-9/_.\-@]+$/.test(suffix)) {
      return null;
    }
  }
  const base = `https://github.com/${repoPath}`;
  return suffix ? `${base}${suffix}` : base;
};
