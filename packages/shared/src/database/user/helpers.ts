/**
 * User Helpers
 *
 * Row mappers and validation functions for user entities.
 *
 * @module database/user/helpers
 */

import { ValidationError, VALID_OAUTH_PROVIDERS } from "../common.js";
import type {
  UserRow,
  OAuthIdentityRow,
  RefreshTokenRow,
  OAuthStateRow,
  User,
  OAuthIdentity,
  RefreshToken,
  OAuthState,
  CreateUserInput,
  UpsertOAuthIdentityInput,
  UserValidationRule,
  OAuthIdentityValidationRule,
} from "./types.js";

// ==================== Row Mappers ====================

export const rowToUser = (row: UserRow): User => ({
  id: row.id,
  tenantId: row.selected_tenant_id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  role: row.role,
  status: row.status,
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const extractUser = (rows: readonly UserRow[]): User | null =>
  rows.length > 0 ? rowToUser(rows[0]) : null;

export const rowToOAuthIdentity = (row: OAuthIdentityRow): OAuthIdentity => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  providerUserId: row.provider_user_id,
  providerUsername: row.provider_username,
  providerEmail: row.provider_email,
  providerAvatarUrl: row.provider_avatar_url,
  instanceUrl: row.instance_url,
  accessToken: row.access_token,
  refreshToken: row.refresh_token,
  tokenExpiresAt: row.token_expires_at,
  scopes: row.scopes,
  rawProfile: row.raw_profile,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const extractOAuthIdentity = (rows: readonly OAuthIdentityRow[]): OAuthIdentity | null =>
  rows.length > 0 ? rowToOAuthIdentity(rows[0]) : null;

export const rowToRefreshToken = (row: RefreshTokenRow): RefreshToken => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  familyId: row.family_id,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  replacedBy: row.replaced_by,
  userAgent: row.user_agent,
  ipAddress: row.ip_address,
  createdAt: row.created_at,
});

export const extractRefreshToken = (rows: readonly RefreshTokenRow[]): RefreshToken | null =>
  rows.length > 0 ? rowToRefreshToken(rows[0]) : null;

export const rowToOAuthState = (row: OAuthStateRow): OAuthState => ({
  id: row.id,
  stateToken: row.state_token,
  provider: row.provider,
  instanceUrl: row.instance_url,
  redirectAfter: row.redirect_after,
  metadata: row.metadata,
  expiresAt: row.expires_at,
  consumedAt: row.consumed_at,
  createdAt: row.created_at,
});

export const extractOAuthState = (rows: readonly OAuthStateRow[]): OAuthState | null =>
  rows.length > 0 ? rowToOAuthState(rows[0]) : null;

// ==================== Validation ====================

const CREATE_USER_RULES: readonly UserValidationRule[] = [
  {
    isInvalid: (input) => input.displayName.trim().length === 0,
    getMessage: () => "Display name is required",
    field: "displayName",
  },
];

export const validateCreateUserInput = (input: CreateUserInput): void => {
  const failedRule = CREATE_USER_RULES.find((rule) => rule.isInvalid(input));
  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateCreateUserInput",
    metadata: { field: failedRule.field },
  });
};

const UPSERT_OAUTH_IDENTITY_RULES: readonly OAuthIdentityValidationRule[] = [
  {
    isInvalid: (input) => input.userId.trim().length === 0,
    getMessage: () => "User ID is required",
    field: "userId",
  },
  {
    isInvalid: (input) => !VALID_OAUTH_PROVIDERS.has(input.provider),
    getMessage: () => "Invalid OAuth provider",
    field: "provider",
  },
  {
    isInvalid: (input) => input.providerUserId.trim().length === 0,
    getMessage: () => "Provider user ID is required",
    field: "providerUserId",
  },
  {
    isInvalid: (input) => input.accessToken.trim().length === 0,
    getMessage: () => "Access token is required",
    field: "accessToken",
  },
];

export const validateUpsertOAuthIdentityInput = (input: UpsertOAuthIdentityInput): void => {
  const failedRule = UPSERT_OAUTH_IDENTITY_RULES.find((rule) => rule.isInvalid(input));
  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateUpsertOAuthIdentityInput",
    metadata: { field: failedRule.field },
  });
};
