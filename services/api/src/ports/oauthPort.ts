/**
 * OAuth Port Interface
 *
 * Provider-agnostic contract for OAuth adapters.
 * Adapters implement this interface to handle OAuth flows
 * for different providers (GitHub, GitLab, etc.).
 * Vendor-specific types never cross this boundary.
 *
 * @module ports/oauthPort
 */

import type { OAuthTokenResponse, OAuthProviderProfile, RequestContext } from "@kenchi/shared";

/**
 * Organization identity returned by an OAuth provider.
 */
export interface OAuthOrganization {
  readonly login: string;
}

/**
 * Provider-agnostic OAuth adapter interface.
 *
 * All methods accept an optional instanceUrl for self-hosted
 * provider instances (e.g., GitHub Enterprise). Pass null
 * for cloud-hosted providers.
 */
export interface OAuthPort {
  /** Exchange an authorization code for an access token. */
  readonly exchangeCode: (
    code: string,
    instanceUrl: string | null,
    context: RequestContext
  ) => Promise<OAuthTokenResponse>;

  /** Fetch the authenticated user's profile from the provider. */
  readonly getUserProfile: (
    accessToken: string,
    instanceUrl: string | null,
    context: RequestContext
  ) => Promise<OAuthProviderProfile>;

  /** Fetch the authenticated user's organizations from the provider. */
  readonly getUserOrganizations: (
    accessToken: string,
    instanceUrl: string | null,
    context: RequestContext
  ) => Promise<readonly OAuthOrganization[]>;
}
