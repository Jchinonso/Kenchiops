/**
 * Security Module
 *
 * Provides utilities for handling sensitive data safely:
 * - Secret redaction from logs and LLM inputs
 * - Field filtering for forbidden sensitive fields
 * - Detection utilities for security auditing
 */

export {
  redactSecrets,
  redactSecretsWithStats,
  redactObject,
  isForbiddenField,
  containsSecrets,
  detectSecretTypes,
  createCustomRedactor,
} from "./redaction.js";

export type {
  RedactionResult,
  RedactionOptions,
  ObjectRedactionOptions,
  CustomRedactionResult,
  CustomRedactor,
} from "./types.js";

// JWT utilities
export {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "./jwt.js";

// Encryption utilities (AES-256-GCM for data at rest)
export { encryptValue, decryptValue } from "./encryption.js";

// Cookie utilities (httpOnly auth cookies)
export {
  setAuthCookies,
  clearAuthCookies,
  extractAccessToken,
  extractRefreshToken,
  type AuthCookieTokens,
} from "./cookies.js";

// OAuth state store (Redis with in-memory fallback)
export { createOAuthStateStore } from "./oauthStateStore.js";

export type { OAuthStoredState, OAuthStateStore } from "./oauthStateStoreTypes.js";

// Re-export constants for convenience
export {
  SECRET_PATTERNS,
  FORBIDDEN_FIELDS,
  REDACTION_PLACEHOLDER,
  type SecretPattern,
} from "../constants/index.js";
