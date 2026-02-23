/**
 * OAuth Helpers
 *
 * Helper functions, types, and strategies for Slack OAuth flow.
 */

import type { Response } from "express";
import {
  createLogger,
  config,
  HTTP_STATUS,
  findByOrgName,
  linkSlackWorkspace,
  createFromSlackInstall,
  createOAuthStateStore,
  ValidationError,
  NotFoundError,
} from "@kenchi/shared";
import type {
  StoredState,
  SlackWorkspaceData,
  TenantLinkResult,
  ValidationErrorType,
  OAuthValidationError,
  TenantLinkStrategy,
} from "./oauthHelpersTypes.js";

export type {
  StoredState,
  SlackWorkspaceData,
  TenantLinkResult,
  SlackOAuthResponse,
  ValidationErrorType,
  OAuthValidationError,
} from "./oauthHelpersTypes.js";

const logger = createLogger("slack-oauth");

// ==================== State Management ====================

/**
 * OAuth state store backed by Redis with automatic in-memory fallback.
 * Redis handles TTL-based cleanup; in-memory store checks expiry on read.
 */
export const oauthStateStore = createOAuthStateStore();

// ==================== Error Response Handlers ====================

/**
 * Error response handlers for each validation error type
 */
export const errorResponseHandlers: Record<
  ValidationErrorType,
  (res: Response, error: OAuthValidationError) => void
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

// ==================== Tenant Linking Strategies ====================

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
        throw new ValidationError("Tenant ID required but missing", {
          operation: "link_slack_workspace",
        });
      }
      const tenant = await linkSlackWorkspace({
        tenantId: state.tenantId,
        ...slackData,
      });
      return { tenant, isNewTenant: false };
    },
  },
  {
    // Intentionally uses provider-unscoped findByOrgName: Slack workspaces
    // aren't tied to a specific Git provider, so we do a fuzzy best-guess
    // match by org name. The existing_tenant_id strategy (above) is preferred
    // when the user links from the dashboard with an explicit tenantId.
    name: "matching_org_name",
    matches: async (_state, teamName) => {
      const existing = await findByOrgName(teamName);
      return Boolean(existing);
    },
    execute: async (_state, slackData, teamName) => {
      const existingTenant = await findByOrgName(teamName);
      // existingTenant is guaranteed by matches check above
      if (!existingTenant) {
        throw new NotFoundError(`Tenant not found for GitHub org: ${teamName}`, {
          operation: "link_slack_workspace",
          metadata: { teamName },
        });
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
 * Find the first matching strategy using recursive async search.
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
 * Link Slack workspace to tenant using strategy pattern.
 */
export const linkTenantWithStrategy = async (
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

// ==================== Status Messages ====================

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
 * Get status message for tenant.
 */
export const getStatusMessage = (isNewTenant: boolean, status: string): string => {
  const key = isNewTenant ? "new_tenant" : status === "active" ? "active" : "default";
  return statusMessages[key](isNewTenant, status);
};

// ==================== Validation ====================

/**
 * Validate OAuth callback request.
 * Async because state lookup uses the Redis-backed store.
 */
export const validateOAuthCallback = async (
  code: unknown,
  state: unknown,
  error: unknown
): Promise<
  | {
      readonly valid: true;
      readonly code: string;
      readonly state: string;
      readonly storedState: StoredState;
    }
  | { readonly valid: false; readonly error: OAuthValidationError }
> => {
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

  // Validate state against Redis-backed store
  const storedState = await oauthStateStore.get(state);
  if (!storedState) {
    return {
      valid: false,
      error: { type: "invalid_state", message: "Invalid or expired state" },
    };
  }

  await oauthStateStore.delete(state);

  // Validate config
  if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
    return {
      valid: false,
      error: { type: "missing_config", message: "Slack OAuth not configured" },
    };
  }

  return { valid: true, code, state, storedState };
};

// ==================== HTML Builders ====================

/**
 * Build success HTML response.
 */
export const buildSuccessHtml = (
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
