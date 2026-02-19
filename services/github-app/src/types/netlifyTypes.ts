/**
 * Netlify Webhook Type Definitions
 *
 * Types specific to Netlify deploy webhook payloads.
 * Based on Netlify Webhooks API Reference.
 *
 * @module types/netlifyTypes
 */

/**
 * Netlify deploy webhook payload.
 * Unlike Vercel, Netlify sends a flat payload (no envelope wrapper).
 */
export interface NetlifyDeployPayload {
  readonly id: string;
  readonly site_id: string;
  readonly build_id: string;
  readonly state: string;
  readonly name: string;
  readonly url: string;
  readonly ssl_url: string;
  readonly admin_url: string;
  readonly deploy_url: string;
  readonly commit_ref: string;
  readonly commit_url: string;
  readonly branch: string;
  readonly context: string;
  readonly review_id: number | null;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly published_at: string | null;
  readonly framework: string | null;
  readonly error_message: string | null;
  readonly deploy_time: number | null;
  readonly committer: string | null;
}

/**
 * Git context extracted from Netlify deploy payload fields.
 */
export interface NetlifyGitContext {
  readonly commitSha: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | undefined;
  readonly prNumber: number | undefined;
}

/**
 * A single log entry from the Netlify deploy log API.
 */
export interface NetlifyLogEntry {
  readonly id: string;
  readonly ts: string;
  readonly msg: string;
  readonly section: string;
}

/**
 * Decoded JWS payload claims from a Netlify webhook signature.
 */
export interface NetlifyJWSPayload {
  readonly iss: string;
  readonly sha256: string;
}
