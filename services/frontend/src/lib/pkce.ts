/**
 * PKCE (Proof Key for Code Exchange) — Browser Implementation
 *
 * Implements RFC 7636 using the Web Crypto API (browser-compatible).
 * Generates cryptographically random code verifiers and S256 challenges.
 *
 * The code_verifier is stored in sessionStorage so it survives the OAuth
 * redirect round-trip but is cleared when the browser tab closes.
 */

// ==================== Constants ====================

/** Number of random bytes for the code verifier (32 bytes -> 43 base64url chars). */
const VERIFIER_BYTE_LENGTH = 32;

/** SessionStorage key for the PKCE code verifier. */
const VERIFIER_STORAGE_KEY = "kenchi_pkce_verifier";

// ==================== Base64url ====================

/** Convert a Uint8Array to a base64url-encoded string (no padding). */
const toBase64Url = (buffer: Uint8Array): string => {
  const binary = Array.from(buffer, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// ==================== PKCE Functions ====================

/** Generate a cryptographically random PKCE code verifier (43 base64url chars). */
export const generateCodeVerifier = (): string => {
  const buffer = new Uint8Array(VERIFIER_BYTE_LENGTH);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
};

/** Generate an S256 code challenge from a code verifier using Web Crypto API. */
export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
};

// ==================== SessionStorage Helpers ====================

/** Store the code verifier in sessionStorage for retrieval after OAuth redirect. */
export const storeCodeVerifier = (verifier: string): void => {
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
};

/** Retrieve and clear the stored code verifier (one-time use). */
export const consumeCodeVerifier = (): string | null => {
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  if (verifier !== null) {
    sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
  }
  return verifier;
};

// ==================== Combined Flow ====================

/**
 * Generate a PKCE code verifier + challenge pair, storing the verifier
 * in sessionStorage. Returns the challenge to pass as a query parameter.
 */
export const initPkceFlow = async (): Promise<{
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
}> => {
  const verifier = generateCodeVerifier();
  storeCodeVerifier(verifier);
  const codeChallenge = await generateCodeChallenge(verifier);
  return { codeChallenge, codeChallengeMethod: "S256" };
};
