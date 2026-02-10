/**
 * Safety Validation Types
 *
 * Type definitions for the safety validation module.
 *
 * @module safety/validation/types
 */

// ==================== Sanitization Types ====================

/** Result of redacting sensitive data */
export interface RedactSensitiveResult {
  readonly text: string;
  readonly appliedRules: readonly string[];
}
