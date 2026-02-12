/**
 * User Authentication Types
 *
 * Row types (snake_case) map to database columns.
 * Domain types (camelCase) are used in service/handler layers.
 *
 * @module database/user/types
 */

// ==================== Enum Types ====================

export type OAuthProvider = "github" | "gitlab" | "bitbucket" | "azure_devops";

export type UserRole = "owner" | "admin" | "member" | "viewer";

export type UserStatus = "active" | "suspended" | "deleted";

// ==================== Row Types ====================

export interface UserRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly email: string | null;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly last_login_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface OAuthIdentityRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider: OAuthProvider;
  readonly provider_user_id: string;
  readonly provider_username: string | null;
  readonly provider_email: string | null;
  readonly provider_avatar_url: string | null;
  readonly instance_url: string | null;
  readonly access_token: string | null;
  readonly refresh_token: string | null;
  readonly token_expires_at: Date | null;
  readonly scopes: readonly string[] | null;
  readonly raw_profile: Record<string, unknown>;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RefreshTokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly token_hash: string;
  readonly family_id: string;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
  readonly replaced_by: string | null;
  readonly user_agent: string | null;
  readonly ip_address: string | null;
  readonly created_at: Date;
}

export interface OAuthStateRow {
  readonly id: string;
  readonly state_token: string;
  readonly provider: OAuthProvider;
  readonly instance_url: string | null;
  readonly redirect_after: string | null;
  readonly metadata: Record<string, unknown>;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly created_at: Date;
}

// ==================== Domain Types ====================

export interface User {
  readonly id: string;
  readonly tenantId: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OAuthIdentity {
  readonly id: string;
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerUserId: string;
  readonly providerUsername: string | null;
  readonly providerEmail: string | null;
  readonly providerAvatarUrl: string | null;
  readonly instanceUrl: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly scopes: readonly string[] | null;
  readonly rawProfile: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBy: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
}

export interface OAuthState {
  readonly id: string;
  readonly stateToken: string;
  readonly provider: OAuthProvider;
  readonly instanceUrl: string | null;
  readonly redirectAfter: string | null;
  readonly metadata: Record<string, unknown>;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

// ==================== Input Types ====================

export interface CreateUserInput {
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly tenantId: string | null;
  readonly role?: UserRole;
}

export interface UpsertOAuthIdentityInput {
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerUserId: string;
  readonly providerUsername: string | null;
  readonly providerEmail: string | null;
  readonly providerAvatarUrl: string | null;
  readonly instanceUrl: string | null;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly scopes: readonly string[];
  readonly rawProfile: Record<string, unknown>;
}

export interface OAuthStateInput {
  readonly provider: OAuthProvider;
  readonly instanceUrl: string | null;
  readonly redirectAfter: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

/** Input for the atomic refresh token rotation (find + validate + create + replace in one transaction). */
export interface RotateRefreshTokenInput {
  readonly tokenHash: string;
  readonly newTokenHash: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

/** Result of an atomic token rotation attempt. */
export type RotateRefreshTokenResult =
  | { readonly status: "rotated"; readonly oldToken: RefreshToken; readonly newToken: RefreshToken }
  | { readonly status: "reused"; readonly oldToken: RefreshToken };

// ==================== OAuth Response Types ====================

export interface OAuthProviderProfile {
  readonly providerUserId: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly rawProfile: Record<string, unknown>;
}

export interface OAuthTokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number | null;
  readonly scope: string;
  readonly tokenType: string;
}

// ==================== JWT Types ====================

export interface JWTPayload {
  readonly sub: string;
  readonly tid: string | null;
  readonly role: UserRole;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface AuthenticatedUser {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
  readonly tokenId: string;
}

// ==================== Validation Types ====================

export interface UserValidationRule {
  readonly isInvalid: (input: CreateUserInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

export interface OAuthIdentityValidationRule {
  readonly isInvalid: (input: UpsertOAuthIdentityInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}
