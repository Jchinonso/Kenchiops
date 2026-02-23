/**
 * Integration OAuth Port Interface
 *
 * Provider-agnostic contract for CI integration adapters.
 * This is separate from OAuthPort (user login) — integration
 * OAuth manages tenant-level CI provider connections (Vercel, Netlify).
 * Vendor-specific types never cross this boundary.
 *
 * @module ports/integrationOAuthPort
 */

import type { RequestContext } from "@kenchi/shared";

// ==================== Port Domain Types ====================

export interface IntegrationTokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
}

export interface IntegrationProject {
  readonly id: string;
  readonly name: string;
  readonly url: string | null;
}

export interface CreatedWebhook {
  readonly webhookId: string;
  readonly url: string;
}

// ==================== Port Interface ====================

/**
 * Provider-agnostic integration OAuth adapter interface.
 *
 * Adapters implement this to handle OAuth token exchange,
 * project listing, and webhook management for CI providers.
 */
export interface IntegrationOAuthPort {
  /** Exchange an authorization code for integration tokens. */
  readonly exchangeCode: (
    code: string,
    redirectUri: string,
    context: RequestContext
  ) => Promise<IntegrationTokenResponse>;

  /** List projects/sites accessible with the given token. */
  readonly listProjects: (
    accessToken: string,
    teamId: string | null,
    context: RequestContext
  ) => Promise<readonly IntegrationProject[]>;

  /** Create a webhook on the provider for deployment events. */
  readonly createWebhook: (
    accessToken: string,
    webhookUrl: string,
    secret: string,
    teamId: string | null,
    context: RequestContext
  ) => Promise<CreatedWebhook>;

  /** Delete a webhook by ID. */
  readonly deleteWebhook: (
    accessToken: string,
    webhookId: string,
    teamId: string | null,
    context: RequestContext
  ) => Promise<void>;

  /** Refresh an expired access token (optional, Vercel only). */
  readonly refreshToken?: (
    refreshToken: string,
    context: RequestContext
  ) => Promise<IntegrationTokenResponse>;
}
