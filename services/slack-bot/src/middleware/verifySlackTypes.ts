/**
 * Verify Slack Types
 *
 * Type definitions for Slack webhook signature verification.
 */

/**
 * Verification result
 */
export interface VerificationResult {
  readonly valid: boolean;
  readonly error?: string;
}
