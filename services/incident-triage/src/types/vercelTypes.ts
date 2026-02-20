/**
 * Vercel Webhook Type Definitions
 *
 * Types specific to Vercel deployment webhook payloads.
 * Based on Vercel Webhooks API Reference.
 *
 * @module types/vercelTypes
 */

/**
 * Vercel deployment webhook payload (top-level envelope).
 */
export interface VercelWebhook {
  readonly type: string;
  readonly id: string;
  readonly createdAt: number;
  readonly region: string | null;
  readonly payload: VercelDeploymentPayload;
}

/**
 * Deployment payload nested inside the webhook envelope.
 */
export interface VercelDeploymentPayload {
  readonly team: { readonly id: string } | null;
  readonly user: { readonly id: string };
  readonly deployment: VercelDeployment;
  readonly links: {
    readonly deployment: string;
    readonly project: string;
  };
  readonly target: "production" | "preview" | null;
  readonly project: { readonly id: string };
  readonly plan: string;
  readonly regions: readonly string[];
}

/**
 * Vercel deployment info within a webhook payload.
 */
export interface VercelDeployment {
  readonly id: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly url: string;
  readonly name: string;
}

/**
 * Git context extracted from Vercel deployment metadata.
 */
export interface VercelGitContext {
  readonly commitSha: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | undefined;
  readonly prNumber: number | undefined;
}
