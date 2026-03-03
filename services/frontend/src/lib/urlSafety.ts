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
