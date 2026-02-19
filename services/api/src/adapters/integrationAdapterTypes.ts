/**
 * Integration Adapter Vendor Response Types
 *
 * Internal types representing raw responses from CI provider APIs
 * (Vercel, Netlify). These shapes are vendor-specific and must
 * never cross port boundaries. Adapters map these to Kenchi domain types.
 *
 * @module adapters/integrationAdapterTypes
 */

// ==================== Vercel ====================

export interface VercelTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly team_id?: string | null;
  readonly error?: string;
  readonly error_description?: string;
}

export interface VercelTeam {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface VercelProject {
  readonly id: string;
  readonly name: string;
  readonly link?: {
    readonly type: string;
    readonly repo: string;
  };
}

export interface VercelProjectsResponse {
  readonly projects: readonly VercelProject[];
}

export interface VercelWebhookResponse {
  readonly id: string;
  readonly url: string;
  readonly events: readonly string[];
}

// ==================== Netlify ====================

export interface NetlifyTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
  readonly error_description?: string;
}

export interface NetlifyAccount {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface NetlifySite {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly admin_url: string;
}

export interface NetlifyHook {
  readonly id: string;
  readonly site_id: string;
  readonly type: string;
  readonly event: string;
}
