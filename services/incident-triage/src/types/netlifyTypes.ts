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
