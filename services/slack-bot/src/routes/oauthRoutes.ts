/**
 * Slack OAuth Routes
 *
 * Handles the OAuth installation flow for multi-tenant Slack App installations.
 * When a new workspace installs the app, we:
 * 1. Redirect to Slack's OAuth authorization page
 * 2. Receive the callback with authorization code
 * 3. Exchange code for tokens
 * 4. Link the Slack workspace to an existing tenant (or create new one)
 */

import express, { type Request, type Response } from "express";
import crypto from "crypto";
import {
  createLogger,
  config,
  HTTP_STATUS,
  findByGitHubOrg,
  linkSlackWorkspace,
  createFromSlackInstall,
  SLACK_OAUTH_TIMING,
  SLACK_OAUTH_SCOPES_STRING,
  type Tenant,
} from "@kenchi/shared";

const logger = createLogger("slack-oauth");
const router = express.Router();

/**
 * Stored OAuth state data
 */
interface StoredState {
  readonly createdAt: number;
  readonly tenantId?: string;
}

/**
 * Slack workspace data for linking
 */
interface SlackWorkspaceData {
  readonly slackWorkspaceId: string;
  readonly slackTeamName: string;
  readonly slackBotToken: string;
  readonly slackBotUserId: string;
}

/**
 * Result of tenant linking operation
 */
interface TenantLinkResult {
  readonly tenant: Tenant;
  readonly isNewTenant: boolean;
}

/**
 * OAuth state storage (in-memory for development, use Redis in production)
 */
const oauthStates = new Map<string, StoredState>();

/**
 * Clean up expired OAuth states
 * Uses functional approach: filter expired keys, then delete them
 */
const cleanupExpiredStates = (): void => {
  const expiryTime = Date.now() - SLACK_OAUTH_TIMING.STATE_EXPIRY_MS;
  Array.from(oauthStates.entries())
    .filter(([, value]) => value.createdAt < expiryTime)
    .forEach(([key]) => oauthStates.delete(key));
};

// Clean up expired states periodically
setInterval(cleanupExpiredStates, SLACK_OAUTH_TIMING.CLEANUP_INTERVAL_MS);

/**
 * OAuth response from Slack
 */
interface SlackOAuthResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
  readonly bot_user_id: string;
  readonly app_id: string;
  readonly team: {
    readonly id: string;
    readonly name: string;
  };
  readonly authed_user: {
    readonly id: string;
  };
}

/**
 * Validation error types for OAuth callback
 */
type ValidationErrorType =
  | "oauth_denied"
  | "invalid_params"
  | "invalid_state"
  | "missing_config"
  | "token_exchange_failed";

/**
 * Validation error with type and message
 */
interface ValidationError {
  readonly type: ValidationErrorType;
  readonly message: string;
  readonly htmlResponse?: string;
}

/**
 * Error response handlers for each validation error type
 */
const errorResponseHandlers: Record<
  ValidationErrorType,
  (res: Response, error: ValidationError) => void
> = {
  oauth_denied: (res, error) => {
    res.status(HTTP_STATUS.BAD_REQUEST).send(error.htmlResponse);
  },
  invalid_params: (res, error) => {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
  },
  invalid_state: (res, error) => {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
  },
  missing_config: (res, error) => {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
  },
  token_exchange_failed: (res, error) => {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
  },
};

/**
 * Tenant linking strategy interface
 */
interface TenantLinkStrategy {
  readonly name: string;
  readonly matches: (state: StoredState, teamName: string) => Promise<boolean>;
  readonly execute: (
    state: StoredState,
    slackData: SlackWorkspaceData,
    teamName: string
  ) => Promise<TenantLinkResult>;
}

/**
 * Tenant linking strategies in priority order
 */
const tenantLinkStrategies: readonly TenantLinkStrategy[] = [
  {
    name: "existing_tenant_id",
    matches: async (state) => Boolean(state.tenantId),
    execute: async (state, slackData) => {
      // tenantId is guaranteed by matches check above
      if (!state.tenantId) {
        throw new Error("Tenant ID required but missing");
      }
      const tenant = await linkSlackWorkspace({
        tenantId: state.tenantId,
        ...slackData,
      });
      return { tenant, isNewTenant: false };
    },
  },
  {
    name: "matching_github_org",
    matches: async (_state, teamName) => {
      const existing = await findByGitHubOrg(teamName);
      return Boolean(existing);
    },
    execute: async (_state, slackData, teamName) => {
      const existingTenant = await findByGitHubOrg(teamName);
      // existingTenant is guaranteed by matches check above
      if (!existingTenant) {
        throw new Error("Existing tenant not found");
      }
      const tenant = await linkSlackWorkspace({
        tenantId: existingTenant.id,
        ...slackData,
      });
      return { tenant, isNewTenant: false };
    },
  },
  {
    name: "create_new",
    matches: async () => true, // Default fallback
    execute: async (_state, slackData) => {
      const tenant = await createFromSlackInstall(slackData);
      return { tenant, isNewTenant: true };
    },
  },
];

/**
 * Link Slack workspace to tenant using strategy pattern
 */
const linkTenantWithStrategy = async (
  state: StoredState,
  slackData: SlackWorkspaceData,
  teamName: string
): Promise<TenantLinkResult> => {
  const matchingStrategy = await findMatchingStrategy(state, teamName);
  const result = await matchingStrategy.execute(state, slackData, teamName);

  logger.info(`Tenant linked via strategy: ${matchingStrategy.name}`, {
    tenantId: result.tenant.id,
    teamName,
    isNewTenant: result.isNewTenant,
  });

  return result;
};

/**
 * Find the first matching strategy using recursive async search
 */
const findMatchingStrategy = async (
  state: StoredState,
  teamName: string,
  index: number = 0
): Promise<TenantLinkStrategy> => {
  const strategy = tenantLinkStrategies[index];
  const isLastStrategy = index >= tenantLinkStrategies.length - 1;

  // Base case: last strategy is always the default fallback
  if (isLastStrategy) {
    return strategy;
  }

  const matches = await strategy.matches(state, teamName);
  return matches ? strategy : findMatchingStrategy(state, teamName, index + 1);
};

/**
 * Status message lookup based on tenant state
 */
const statusMessages: Record<string, (isNewTenant: boolean, status: string) => string> = {
  new_tenant: () =>
    "Your Slack workspace is connected! Now install the GitHub App to complete setup.",
  active: () => "Installation complete! Kenchi is now active in your workspace.",
  default: () => "Slack connected! Waiting for GitHub App installation to complete.",
};

/**
 * Get status message for tenant
 */
const getStatusMessage = (isNewTenant: boolean, status: string): string => {
  const key = isNewTenant ? "new_tenant" : status === "active" ? "active" : "default";
  return statusMessages[key](isNewTenant, status);
};

/**
 * Build success HTML response
 */
const buildSuccessHtml = (
  teamName: string,
  status: string,
  statusMessage: string,
  isNewTenant: boolean
): string => `
  <html>
    <head>
      <title>Kenchi Installed</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { color: #2eb67d; }
        .pending { color: #ecb22e; }
        .card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1 class="${status === "active" ? "success" : "pending"}">
        ${status === "active" ? "Installation Complete!" : "Almost There!"}
      </h1>
      <div class="card">
        <p><strong>Workspace:</strong> ${teamName}</p>
        <p><strong>Status:</strong> ${status}</p>
        <p>${statusMessage}</p>
      </div>
      ${isNewTenant ? `<p><a href="https://github.com/apps/kenchi-devops/installations/new">Install GitHub App</a></p>` : ""}
    </body>
  </html>
`;

/**
 * GET /slack/install
 * Initiates the Slack OAuth flow by redirecting to Slack's authorization page.
 */
router.get("/slack/install", (req: Request, res: Response) => {
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
  oauthStates.set(state, {
    createdAt: Date.now(),
    tenantId: typeof tenantId === "string" ? tenantId : undefined,
  });

  const redirectUri =
    config.SLACK_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/slack/oauth/callback`;
  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", SLACK_OAUTH_SCOPES_STRING);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  logger.info("Initiating Slack OAuth flow", {
    tenantId: tenantId ?? "(new installation)",
    redirectUri,
  });

  res.redirect(authUrl.toString());
});

/**
 * Validate OAuth callback request
 */
const validateOAuthCallback = (
  code: unknown,
  state: unknown,
  error: unknown
):
  | { valid: true; code: string; state: string; storedState: StoredState }
  | { valid: false; error: ValidationError } => {
  // Check for OAuth denial
  if (error) {
    return {
      valid: false,
      error: {
        type: "oauth_denied",
        message: String(error),
        htmlResponse: `
          <html>
            <head><title>Installation Failed</title></head>
            <body>
              <h1>Installation Failed</h1>
              <p>Error: ${error}</p>
              <p><a href="/slack/install">Try again</a></p>
            </body>
          </html>
        `,
      },
    };
  }

  // Validate params
  if (typeof code !== "string" || typeof state !== "string") {
    return {
      valid: false,
      error: { type: "invalid_params", message: "Invalid callback parameters" },
    };
  }

  // Validate state
  const storedState = oauthStates.get(state);
  if (!storedState) {
    return {
      valid: false,
      error: { type: "invalid_state", message: "Invalid or expired state" },
    };
  }

  oauthStates.delete(state);

  // Validate config
  if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
    return {
      valid: false,
      error: { type: "missing_config", message: "Slack OAuth not configured" },
    };
  }

  return { valid: true, code, state, storedState };
};

/**
 * GET /slack/oauth/callback
 * Handles the OAuth callback from Slack after user authorization.
 */
router.get("/slack/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  const validation = validateOAuthCallback(code, state, error);
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

    const redirectUri =
      config.SLACK_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/slack/oauth/callback`;
    const tokenUrl = new URL("https://slack.com/api/oauth.v2.access");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("code", validation.code);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);

    const tokenResponse = await fetch(tokenUrl.toString(), { method: "POST" });
    const tokenData = (await tokenResponse.json()) as SlackOAuthResponse;

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
      error: caughtError instanceof Error ? caughtError.message : "Unknown error",
    });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: "Failed to complete OAuth flow",
    });
  }
});

/**
 * GET /slack/oauth/status
 * Health check for OAuth configuration
 */
router.get("/slack/oauth/status", (_req: Request, res: Response) => {
  res.json({
    configured: !!(config.SLACK_CLIENT_ID && config.SLACK_CLIENT_SECRET),
    multiTenantMode: config.MULTI_TENANT_MODE ?? false,
    hasClientId: !!config.SLACK_CLIENT_ID,
    hasClientSecret: !!config.SLACK_CLIENT_SECRET,
    hasRedirectUri: !!config.SLACK_REDIRECT_URI,
  });
});

export { router as oauthRoutes };
