/**
 * Netlify Webhook Adapter
 *
 * Implements CIWebhookPort for Netlify deploy webhooks.
 * Handles JWS (JSON Web Signature) verification and normalization
 * of Netlify deploy payloads to NormalizedBuildEvent.
 *
 * @module adapters/netlifyWebhookAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  CI_PROVIDERS,
  NETLIFY_FAILURE_STATES,
  NETLIFY_SIGNATURE,
  type CIWebhookPort,
  type NormalizedBuildEvent,
  type RequestContext,
} from "@kenchi/shared";
import type { NetlifyDeployPayload } from "../types/netlifyTypes.js";
import { extractGitContext, mapNetlifyConclusion } from "../helpers/netlifyHelpers.js";

const logger = createLogger("netlify-webhook");

// ==================== JWS Helpers ====================

/**
 * Decode a base64url-encoded string to a Buffer.
 * Converts base64url alphabet (-_ instead of +/) and adds padding.
 */
const decodeBase64Url = (input: string): Buffer => {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

/**
 * Verify a Netlify JWS token against the webhook secret and raw body.
 *
 * Steps:
 * 1. Split JWS on "." into [headerB64, payloadB64, signatureB64]
 * 2. Compute HMAC-SHA256(secret, "headerB64.payloadB64") and compare to decoded signature
 * 3. Decode payload claims and verify iss === "netlify"
 * 4. Compute SHA-256(rawBody) and verify it matches the sha256 claim
 */
const verifyJWS = (rawBody: Buffer, jwsToken: string, secret: string): boolean => {
  const parts = jwsToken.split(".");
  const expectedPartCount = 3;
  if (parts.length !== expectedPartCount) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  // Verify HMAC-SHA256 signature
  const computedSig = crypto.createHmac("sha256", secret).update(signingInput).digest();

  const providedSig = decodeBase64Url(signatureB64);

  try {
    if (!crypto.timingSafeEqual(computedSig, providedSig)) {
      return false;
    }
  } catch {
    // timingSafeEqual throws if buffer lengths differ
    return false;
  }

  // Decode and verify claims
  const claimsJson = decodeBase64Url(payloadB64).toString("utf8");
  const claims = JSON.parse(claimsJson) as { readonly iss?: string; readonly sha256?: string };

  if (claims.iss !== NETLIFY_SIGNATURE.ISSUER) {
    return false;
  }

  // Verify body integrity: SHA-256 of raw body must match claim
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  return bodyHash === claims.sha256;
};

// ==================== Type Guard ====================

const isNetlifyPayload = (payload: unknown): payload is NetlifyDeployPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "id" in payload &&
  "site_id" in payload &&
  "state" in payload &&
  typeof (payload as Record<string, unknown>).state === "string";

// ==================== Adapter ====================

export const netlifyWebhookAdapter: CIWebhookPort = {
  verifySignature: (rawBody: Buffer, signature: string, secret: string): boolean => {
    try {
      return verifyJWS(rawBody, signature, secret);
    } catch {
      // Any parse/crypto error means invalid signature
      return false;
    }
  },

  normalizeEvent: (
    payload: unknown,
    _context: RequestContext // Unused: normalization is a pure sync transform
  ): NormalizedBuildEvent | null => {
    if (!isNetlifyPayload(payload)) {
      return null;
    }

    if (!NETLIFY_FAILURE_STATES.has(payload.state)) {
      return null;
    }

    const git = extractGitContext(payload);

    if (!git.commitSha || !git.owner || !git.repo) {
      logger.warn("Netlify deploy missing git context, skipping normalization", {
        deployId: payload.id,
        hasCommitSha: !!git.commitSha,
        hasOwner: !!git.owner,
        hasRepo: !!git.repo,
      });
      return null;
    }

    return {
      provider: CI_PROVIDERS.NETLIFY,
      buildId: payload.id,
      buildName: payload.name,
      conclusion: mapNetlifyConclusion(payload.state),
      commitSha: git.commitSha,
      branch: git.branch,
      repository: {
        fullName: `${git.owner}/${git.repo}`,
        owner: git.owner,
        name: git.repo,
      },
      pullRequestNumbers: git.prNumber !== undefined ? [git.prNumber] : [],
      installationId: 0, // Netlify doesn't use GitHub installation IDs
      timestamp: new Date(payload.created_at),
      metadata: {
        netlifySiteId: payload.site_id,
        netlifyBuildId: payload.build_id,
        netlifyDeployId: payload.id,
        deployContext: payload.context,
        deployUrl: payload.deploy_url,
        framework: payload.framework ?? null,
        errorMessage: payload.error_message ?? null,
      },
    };
  },

  isFailureEvent: (payload: unknown): boolean => {
    if (!isNetlifyPayload(payload)) {
      return false;
    }
    return NETLIFY_FAILURE_STATES.has(payload.state);
  },
};
