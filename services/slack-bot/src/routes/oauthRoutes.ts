/**
 * Slack OAuth Routes
 *
 * Handles the OAuth installation flow for multi-tenant Slack App installations.
 * When a new workspace installs the app, we:
 * 1. Redirect to Slack's OAuth authorization page
 * 2. Receive the callback with authorization code
 * 3. Exchange code for tokens
 * 4. Link the Slack workspace to an existing tenant (or create new one)
 *
 * This is the public API that re-exports from focused modules:
 * - oauthHelpers.ts: Types, strategies, validation
 */

import express, { type Request, type Response } from "express";
import crypto from "crypto";
import {
  createLogger,
  config,
  HTTP_STATUS,
  SLACK_OAUTH_SCOPES_STRING,
  getErrorMessage,
  asyncHandler,
  resilientFetch,
} from "@kenchi/shared";
import {
  oauthStateStore,
  errorResponseHandlers,
  validateOAuthCallback,
  linkTenantWithStrategy,
  getStatusMessage,
  buildSuccessHtml,
  type SlackWorkspaceData,
  type SlackOAuthResponse,
} from "./oauthHelpers.js";

// Re-export types for consumers
export type {
  StoredState,
  SlackWorkspaceData,
  TenantLinkResult,
  SlackOAuthResponse,
  ValidationErrorType,
  OAuthValidationError,
} from "./oauthHelpers.js";

const logger = createLogger("slack-oauth");
const router = express.Router();

// ==================== Routes ====================

/**
 * GET /slack/install
 * Initiates the Slack OAuth flow by redirecting to Slack's authorization page.
 */
router.get(
  "/slack/install",
  asyncHandler(async (req: Request, res: Response) => {
    const { tenant_id: tenantId } = req.query;

    const clientId = config.SLACK_CLIENT_ID;
    if (!clientId) {
      logger.error("SLACK_CLIENT_ID not configured");
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Slack OAuth not configured. Set SLACK_CLIENT_ID.",
      });
      return;
    }

    const state = crypto.randomBytes(32).toString("hex");
    await oauthStateStore.set(state, {
      createdAt: Date.now(),
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
    });

    // SECURITY (VULN-504): Never derive redirect URI from the Host header.
    // The Host header is attacker-controlled and would allow OAuth token theft
    // by redirecting the callback to a malicious domain.
    const redirectUri = config.SLACK_REDIRECT_URI;
    if (!redirectUri) {
      logger.error("SLACK_REDIRECT_URI not configured");
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Slack OAuth redirect URI not configured. Set SLACK_REDIRECT_URI.",
      });
      return;
    }

    const authUrl = new URL("https://slack.com/oauth/v2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", SLACK_OAUTH_SCOPES_STRING);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    logger.info("Initiating Slack OAuth flow", {
      tenantId: tenantId ?? "(new installation)",
    });

    res.redirect(authUrl.toString());
  })
);

/**
 * GET /slack/oauth/callback
 * Handles the OAuth callback from Slack after user authorization.
 */
router.get("/slack/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  const validation = await validateOAuthCallback(code, state, error);
  if (!validation.valid) {
    logger.warn(`OAuth validation failed: ${validation.error.type}`);
    errorResponseHandlers[validation.error.type](res, validation.error);
    return;
  }

  const { storedState } = validation;

  try {
    // These are guaranteed to exist by validateOAuthCallback above
    const clientId = config.SLACK_CLIENT_ID;
    const clientSecret = config.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: "OAuth not configured" });
      return;
    }

    // SECURITY (VULN-504): Use configured redirect URI only, never Host header.
    const redirectUri = config.SLACK_REDIRECT_URI;
    if (!redirectUri) {
      res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json({ error: "OAuth redirect URI not configured" });
      return;
    }
    const tokenUrl = new URL("https://slack.com/api/oauth.v2.access");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("code", validation.code);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);

    const tokenResponse = await resilientFetch<SlackOAuthResponse>(
      tokenUrl.toString(),
      "POST",
      undefined,
      { timeout: 10_000, maxRetries: 2 }
    );
    const tokenData = tokenResponse.data;

    if (!tokenData.ok) {
      logger.error("Failed to exchange OAuth code", { error: tokenData.error });
      errorResponseHandlers.token_exchange_failed(res, {
        type: "token_exchange_failed",
        message: `Slack OAuth failed: ${tokenData.error}`,
      });
      return;
    }

    logger.info("Slack OAuth tokens received", {
      teamId: tokenData.team.id,
      teamName: tokenData.team.name,
      botUserId: tokenData.bot_user_id,
    });

    const slackData: SlackWorkspaceData = {
      slackWorkspaceId: tokenData.team.id,
      slackTeamName: tokenData.team.name,
      slackBotToken: tokenData.access_token,
      slackBotUserId: tokenData.bot_user_id,
    };

    const { tenant, isNewTenant } = await linkTenantWithStrategy(
      storedState,
      slackData,
      tokenData.team.name
    );

    const statusMessage = getStatusMessage(isNewTenant, tenant.status);
    const html = buildSuccessHtml(tokenData.team.name, tenant.status, statusMessage, isNewTenant);

    res.send(html);
  } catch (caughtError) {
    logger.error("OAuth callback error", {
      error: getErrorMessage(caughtError),
    });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: "Failed to complete OAuth flow",
    });
  }
});

/**
 * GET /slack/oauth/status
 * Health check for OAuth configuration.
 */
// SECURITY (VULN-505): Only return a boolean configured status.
// Never expose which specific credentials are present or absent.
router.get("/slack/oauth/status", (_req: Request, res: Response) => {
  res.json({
    configured: !!(
      config.SLACK_CLIENT_ID &&
      config.SLACK_CLIENT_SECRET &&
      config.SLACK_REDIRECT_URI
    ),
  });
});

export { router as oauthRoutes };
