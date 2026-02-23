/**
 * Netlify Webhook and API Constants
 *
 * Constants for Netlify webhook JWS signature verification, deploy events,
 * and API configuration.
 *
 * @module constants/netlify
 */

// ==================== Signature Verification ====================

/**
 * Netlify webhook JWS signature verification constants.
 * Netlify uses JWS (JSON Web Signature) with HMAC-SHA256.
 * The `x-webhook-signature` header contains a compact JWS token (header.payload.signature).
 */
export const NETLIFY_SIGNATURE = {
  HEADER: "x-webhook-signature",
  ALGORITHM: "sha256",
  ISSUER: "netlify",
} as const;

// ==================== Deploy Events ====================

/**
 * Netlify deploy webhook event types.
 * Sent in the `X-Netlify-Event` header.
 */
export const NETLIFY_DEPLOY_EVENTS = {
  DEPLOY_BUILDING: "deploy_building",
  DEPLOY_CREATED: "deploy_created",
  DEPLOY_FAILED: "deploy_failed",
  DEPLOY_LOCKED: "deploy_locked",
  DEPLOY_UNLOCKED: "deploy_unlocked",
} as const;

export type NetlifyDeployEventType =
  (typeof NETLIFY_DEPLOY_EVENTS)[keyof typeof NETLIFY_DEPLOY_EVENTS];

/**
 * Netlify deploy event types that represent failures.
 * Used for filtering at the event-header level.
 */
export const NETLIFY_FAILURE_EVENTS: ReadonlySet<string> = new Set([
  NETLIFY_DEPLOY_EVENTS.DEPLOY_FAILED,
]);

/**
 * Netlify deploy body `state` values that represent failures.
 * The primary failure indicator is `state: "error"` in the webhook payload.
 */
export const NETLIFY_FAILURE_STATES: ReadonlySet<string> = new Set(["error"]);

// ==================== API Configuration ====================

/**
 * Header containing the Netlify event type.
 */
export const NETLIFY_EVENT_HEADER = "x-netlify-event" as const;

/**
 * Netlify API base URL.
 */
export const NETLIFY_API_BASE_URL = "https://api.netlify.com/api/v1" as const;

/**
 * Netlify deploy context types.
 */
export const NETLIFY_CONTEXTS = {
  PRODUCTION: "production",
  DEPLOY_PREVIEW: "deploy-preview",
  BRANCH_DEPLOY: "branch-deploy",
} as const;

// ==================== Parsing ====================

/**
 * Pattern to extract owner/repo from a GitHub commit URL.
 * Expected format: `https://github.com/<owner>/<repo>/commit/<sha>`
 */
export const NETLIFY_COMMIT_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/commit\//;
