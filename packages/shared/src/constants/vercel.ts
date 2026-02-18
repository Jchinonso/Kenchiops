/**
 * Vercel Webhook and API Constants
 *
 * Constants for Vercel webhook signature verification, deployment events,
 * and API configuration.
 *
 * @module constants/vercel
 */

// ==================== Signature Verification ====================

/**
 * Vercel webhook signature verification constants.
 * Vercel uses HMAC-SHA1 with no prefix on the signature value.
 */
export const VERCEL_SIGNATURE = {
  HEADER: "x-vercel-signature",
  ALGORITHM: "sha1",
} as const;

// ==================== Deployment Events ====================

/**
 * Vercel deployment webhook event types.
 */
export const VERCEL_DEPLOYMENT_EVENTS = {
  CREATED: "deployment.created",
  READY: "deployment.ready",
  SUCCEEDED: "deployment.succeeded",
  ERROR: "deployment.error",
  CANCELED: "deployment.canceled",
} as const;

export type VercelDeploymentEventType =
  (typeof VERCEL_DEPLOYMENT_EVENTS)[keyof typeof VERCEL_DEPLOYMENT_EVENTS];

/**
 * Vercel deployment events that represent failures we should analyze.
 */
export const VERCEL_FAILURE_EVENTS: ReadonlySet<string> = new Set([
  VERCEL_DEPLOYMENT_EVENTS.ERROR,
  VERCEL_DEPLOYMENT_EVENTS.CANCELED,
]);

// ==================== API Configuration ====================

/**
 * Vercel API base URL.
 */
export const VERCEL_API_BASE_URL = "https://api.vercel.com" as const;

/**
 * Vercel deployment target environments.
 */
export const VERCEL_TARGETS = {
  PRODUCTION: "production",
  PREVIEW: "preview",
} as const;
