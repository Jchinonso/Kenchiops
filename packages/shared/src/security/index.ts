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

// Re-export constants for convenience
export {
  SECRET_PATTERNS,
  FORBIDDEN_FIELDS,
  REDACTION_PLACEHOLDER,
  type SecretPattern,
} from "../constants/index.js";
