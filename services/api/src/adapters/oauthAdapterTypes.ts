/**
 * OAuth Adapter Vendor Response Types
 *
 * Internal types representing raw responses from GitHub's OAuth
 * and user APIs. These shapes are vendor-specific and must never
 * cross port boundaries. Adapters map these to Kenchi domain types.
 *
 * @module adapters/oauthAdapterTypes
 */

// ==================== GitHub Token Exchange ====================

/** Raw response from GitHub's OAuth token endpoint. */
export interface GitHubTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
  readonly error?: string;
  readonly error_description?: string;
}

// ==================== GitHub User Profile ====================

/** Raw response from GitHub's /user endpoint. */
export interface GitHubUserProfile {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string;
}

/** Individual email entry from GitHub's /user/emails endpoint. */
export interface GitHubUserEmail {
  readonly email: string;
  readonly primary: boolean;
  readonly verified: boolean;
}

// ==================== GitHub Organizations ====================

/** Single organization entry from GitHub's /user/orgs endpoint. */
export interface GitHubOrg {
  readonly login: string;
}
