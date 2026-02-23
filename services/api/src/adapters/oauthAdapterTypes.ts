/**
 * OAuth Adapter Vendor Response Types
 *
 * Internal types representing raw responses from OAuth provider APIs
 * (GitHub, GitLab, Bitbucket, Azure DevOps). These shapes are
 * vendor-specific and must never cross port boundaries.
 * Adapters map these to Kenchi domain types.
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

// ==================== GitLab Token Exchange ====================

/** Raw response from GitLab's OAuth endpoint. */
export interface GitLabTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
  readonly created_at: number;
  readonly error?: string;
  readonly error_description?: string;
}

// ==================== GitLab User Profile ====================

/** Raw response from GitLab's /api/v4/user endpoint. */
export interface GitLabUserProfile {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly email: string | null;
  readonly avatar_url: string | null;
  readonly state: string;
  readonly web_url: string;
  readonly confirmed_at: string | null;
}

// ==================== GitLab Groups ====================

/** Single group entry from GitLab's /api/v4/groups endpoint. */
export interface GitLabGroup {
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly full_path: string;
  readonly web_url: string;
}

// ==================== Bitbucket Token Exchange ====================

/** Raw response from Bitbucket's OAuth endpoint. */
export interface BitbucketTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scopes: string;
  readonly error?: string;
  readonly error_description?: string;
}

// ==================== Bitbucket User Profile ====================

/** Raw response from Bitbucket's /2.0/user endpoint. */
export interface BitbucketUserProfile {
  readonly uuid: string;
  readonly username: string;
  readonly display_name: string;
  readonly links: {
    readonly avatar: {
      readonly href: string;
    };
  };
}

/** Individual email entry from Bitbucket's /2.0/user/emails endpoint. */
export interface BitbucketEmail {
  readonly email: string;
  readonly is_primary: boolean;
  readonly is_confirmed: boolean;
}

/** Paginated response from Bitbucket's /2.0/user/emails endpoint. */
export interface BitbucketEmailsResponse {
  readonly values: readonly BitbucketEmail[];
}

// ==================== Bitbucket Workspaces ====================

/** Single workspace entry from Bitbucket's /2.0/workspaces endpoint. */
export interface BitbucketWorkspace {
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
}

/** Paginated response from Bitbucket's /2.0/workspaces endpoint. */
export interface BitbucketWorkspacesResponse {
  readonly values: readonly BitbucketWorkspace[];
}

// ==================== Azure DevOps Token Exchange ====================

/** Raw response from Azure DevOps OAuth endpoint. */
export interface AzureDevOpsTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly error?: string;
  readonly error_description?: string;
}

// ==================== Azure DevOps User Profile ====================

/** Raw response from Azure DevOps /_apis/profile/profiles/me endpoint. */
export interface AzureDevOpsUserProfile {
  readonly id: string;
  readonly displayName: string;
  readonly emailAddress: string | null;
  readonly publicAlias: string;
}

// ==================== Azure DevOps Accounts ====================

/** Single account entry from Azure DevOps /_apis/accounts endpoint. */
export interface AzureDevOpsAccount {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountUri: string;
}

/** Response from Azure DevOps /_apis/accounts endpoint. */
export interface AzureDevOpsAccountsResponse {
  readonly count: number;
  readonly value: readonly AzureDevOpsAccount[];
}
