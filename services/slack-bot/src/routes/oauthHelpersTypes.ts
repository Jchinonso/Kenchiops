/**
 * OAuth Helpers Types
 *
 * Type definitions for Slack OAuth flow helpers.
 */

import type { Tenant } from "@kenchi/shared";

/**
 * Stored OAuth state data
 */
export interface StoredState {
  readonly createdAt: number;
  readonly tenantId?: string;
}

/**
 * Slack workspace data for linking
 */
export interface SlackWorkspaceData {
  readonly slackWorkspaceId: string;
  readonly slackTeamName: string;
  readonly slackBotToken: string;
  readonly slackBotUserId: string;
}

/**
 * Result of tenant linking operation
 */
export interface TenantLinkResult {
  readonly tenant: Tenant;
  readonly isNewTenant: boolean;
}

/**
 * OAuth response from Slack
 */
export interface SlackOAuthResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
  readonly bot_user_id: string;
  readonly app_id: string;
  readonly team: {
    readonly id: string;
    readonly name: string;
  };
  readonly authed_user: {
    readonly id: string;
  };
}

/**
 * Validation error types for OAuth callback
 */
export type ValidationErrorType =
  | "oauth_denied"
  | "invalid_params"
  | "invalid_state"
  | "missing_config"
  | "token_exchange_failed";

/**
 * OAuth validation error with type and message.
 */
export interface OAuthValidationError {
  readonly type: ValidationErrorType;
  readonly message: string;
  readonly htmlResponse?: string;
}

/**
 * Tenant linking strategy interface
 */
export interface TenantLinkStrategy {
  readonly name: string;
  readonly matches: (state: StoredState, teamName: string) => Promise<boolean>;
  readonly execute: (
    state: StoredState,
    slackData: SlackWorkspaceData,
    teamName: string
  ) => Promise<TenantLinkResult>;
}
