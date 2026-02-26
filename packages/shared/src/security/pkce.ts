/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 for OAuth 2.0 public/confidential clients.
 * Generates cryptographically random code verifiers and S256 challenges.
 *
 * @module security/pkce
 */

import crypto from "node:crypto";

/** Number of random bytes for the code verifier (32 bytes -> 43 base64url chars). */
const VERIFIER_BYTE_LENGTH = 32;

/** Generate a cryptographically random PKCE code verifier (43 base64url chars). */
export const generateCodeVerifier = (): string =>
  crypto.randomBytes(VERIFIER_BYTE_LENGTH).toString("base64url");

/** Generate an S256 code challenge from a code verifier. */
export const generateCodeChallenge = (verifier: string): string =>
  crypto.createHash("sha256").update(verifier).digest("base64url");
