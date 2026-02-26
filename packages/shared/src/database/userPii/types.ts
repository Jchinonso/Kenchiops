/**
 * User PII Types
 *
 * Type definitions for PII access and GDPR erasure operations.
 *
 * @module database/userPii/types
 */

// ==================== Domain Types ====================

/**
 * User PII domain object.
 * Contains personally identifiable information for a user.
 */
export interface UserPii {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly githubUsername: string | null;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
  readonly oauthIdentities: ReadonlyArray<OAuthIdentitySummary>;
}

/**
 * Summary of an OAuth identity for PII purposes.
 */
export interface OAuthIdentitySummary {
  readonly provider: string;
  readonly providerUserId: string;
}

// ==================== Row Types ====================

/**
 * Database row returned from the PII query.
 */
export interface UserPiiRow {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly github_username: string | null;
  readonly created_at: Date;
  readonly last_login_at: Date | null;
  readonly oauth_identities: string | ReadonlyArray<OAuthIdentityRowEntry>;
}

/**
 * Individual OAuth identity entry from the JSON aggregation.
 */
export interface OAuthIdentityRowEntry {
  readonly provider: string;
  readonly provider_user_id: string;
}

// ==================== Result Types ====================

/**
 * Result of a PII erasure operation.
 */
export interface PiiErasureResult {
  readonly userId: string;
  readonly erasedAt: Date;
  readonly oauthIdentitiesRemoved: boolean;
}
