/**
 * Reactivation Validator Types
 *
 * Types for the tenant reactivation validation report.
 * Used when unsuspending a tenant to surface warnings about
 * expired tokens, subscriptions, and missing integrations.
 *
 * @module database/tenant/reactivationValidatorTypes
 */

export type ReactivationWarningType =
  | "expired_token"
  | "expired_subscription"
  | "missing_installation"
  | "expired_trial";

export interface ReactivationWarning {
  readonly type: ReactivationWarningType;
  readonly provider?: string;
  readonly message: string;
}

export interface ReactivationReport {
  readonly canActivate: boolean;
  readonly warnings: readonly ReactivationWarning[];
}
