/**
 * Integration OAuth Routes
 *
 * Endpoints for connecting/disconnecting CI providers (Vercel, Netlify)
 * via OAuth. Handles OAuth initiation, callback, listing, and disconnection.
 *
 * @module routes/integrationRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  config,
  findOAuthIdentitiesByUser,
  findById as findTenantById,
  VALID_INTEGRATION_PROVIDERS,
  INTEGRATION_OAUTH_AUTHORIZE_URLS,
  GITLAB_SETUP_CONFIG,
  HTTP_STATUS,
  createOAuthState,
  consumeOAuthState,
  type IntegrationProvider,
  rateLimitByCategory,
} from "@kenchi/shared";

import { createIntegrationService } from "../services/integrationService.js";
import { createGitLabConnectionService } from "../services/gitlabConnectionService.js";
import { createGitLabSetupService } from "../services/gitlabSetupService.js";
import { createGitLabProjectsAdapter } from "../adapters/gitlabProjectsAdapter.js";
import { getIntegrationAdapter } from "../adapters/integrationAdapterRegistry.js";

// ==================== Setup ====================

const router = Router();
const logger = createLogger("integration-routes");

const integrationService = createIntegrationService(getIntegrationAdapter);
const gitlabConnectionService = createGitLabConnectionService();
const gitlabProjectsAdapter = createGitLabProjectsAdapter();
const gitlabSetupService = createGitLabSetupService(gitlabProjectsAdapter);

// ==================== Helpers ====================

/** Validate and cast a route parameter to IntegrationProvider. */
const validateIntegrationProvider = (providerParam: string): IntegrationProvider => {
  if (!VALID_INTEGRATION_PROVIDERS.has(providerParam as IntegrationProvider)) {
    throw new ValidationError(`Unsupported integration provider: ${providerParam}`, {
      operation: "validateIntegrationProvider",
      metadata: { provider: providerParam },
    });
  }
  return providerParam as IntegrationProvider;
};

/** Get the OAuth client ID for an integration provider. */
const getClientId = (provider: IntegrationProvider): string => {
  const CLIENT_ID_MAP: Readonly<Record<IntegrationProvider, string | undefined>> = {
    vercel: config.VERCEL_OAUTH_CLIENT_ID,
    netlify: config.NETLIFY_OAUTH_CLIENT_ID,
  };

  const clientId = CLIENT_ID_MAP[provider];
  if (!clientId) {
    throw new ValidationError(`OAuth client ID not configured for ${provider}`, {
      operation: "getIntegrationClientId",
      metadata: { provider },
    });
  }
  return clientId;
};

/** Build the OAuth redirect URI for an integration provider callback. */
const getRedirectUri = (provider: IntegrationProvider): string =>
  `${config.OAUTH_CALLBACK_BASE_URL}/integrations/${provider}/callback`;

/**
 * Integration providers that are tied to a specific source-code provider.
 * Deployment platforms (Vercel, Netlify) work with any git provider and
 * are NOT listed here. If a source-code-specific integration is added
 * (e.g., "github_actions"), add it with its required provider.
 */
const SOURCE_PROVIDER_REQUIREMENTS: Readonly<Record<string, string>> = {
  // Example: github_actions: "github", gitlab_ci is handled by gitlabSetupService
};

/**
 * Log a warning if the integration provider is source-code-specific and
 * the tenant's primary provider differs. Does NOT block the connection —
 * deployment platforms are always allowed regardless of tenant provider.
 */
const logProviderCompatibility = async (
  provider: IntegrationProvider,
  tenantId: string,
  context: { readonly requestId?: string; readonly tenantId?: string }
): Promise<void> => {
  const requiredProvider = SOURCE_PROVIDER_REQUIREMENTS[provider];
  if (!requiredProvider) {
    // Deployment platforms (Vercel, Netlify) — compatible with any source provider
    return;
  }

  try {
    const tenant = await findTenantById(tenantId);
    if (tenant && tenant.provider !== requiredProvider) {
      logger.warn("Integration provider may be incompatible with tenant source provider", {
        integrationProvider: provider,
        requiredSourceProvider: requiredProvider,
        tenantProvider: tenant.provider,
        tenantId,
        ...context,
      });
    }
  } catch {
    // Best-effort — don't block the OAuth flow on a lookup failure
  }
};

/** Build the OAuth provider authorization URL. */
const buildIntegrationAuthorizeUrl = (
  provider: IntegrationProvider,
  clientId: string,
  redirectUri: string,
  state: string
): string => {
  const baseUrl = INTEGRATION_OAUTH_AUTHORIZE_URLS[provider];
  const url = new URL(baseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
};

// ==================== Route Handlers ====================

/**
 * GET /integrations
 * List all integration connections for the authenticated tenant.
 */
const handleListIntegrations = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleListIntegrations",
    });
  }

  const { tenantId } = req.user;

  if (!tenantId) {
    res.status(HTTP_STATUS.OK).json({ data: [] });
    return;
  }

  const connections = await integrationService.listConnections(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: connections });
};

/**
 * GET /integrations/:provider/connect
 * Initiate OAuth flow: generate CSRF state and redirect to provider.
 */
const handleIntegrationConnect = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleIntegrationConnect",
    });
  }

  const { tenantId } = req.user;

  if (!tenantId) {
    throw new ValidationError("User must belong to a tenant to connect integrations", {
      operation: "handleIntegrationConnect",
    });
  }

  const provider = validateIntegrationProvider(req.params.provider);

  // FLAW-04: Log if the integration provider is incompatible with the tenant's source provider
  await logProviderCompatibility(provider, tenantId, context);

  const clientId = getClientId(provider);
  const redirectUri = getRedirectUri(provider);

  // Create CSRF state with integration metadata
  const stateToken = await createOAuthState({
    provider,
    instanceUrl: null,
    redirectAfter: null,
    metadata: { flow: "integration", tenantId },
  });

  const authorizeUrl = buildIntegrationAuthorizeUrl(provider, clientId, redirectUri, stateToken);

  logger.info("Integration OAuth initiated", { provider, ...context });

  res.redirect(authorizeUrl);
};

/**
 * GET /integrations/:provider/callback
 * Handle OAuth callback: exchange code, create connection, redirect to frontend.
 */
const handleIntegrationCallback = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const frontendUrl = config.FRONTEND_URL;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=oauth_denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=missing_params`);
    return;
  }

  const codeStr = String(code);
  const stateStr = String(state);

  // Validate input lengths
  if (stateStr.length > 128 || codeStr.length > 2048) {
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=invalid_params`);
    return;
  }

  const oauthState = await consumeOAuthState(stateStr);

  if (!oauthState) {
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=invalid_state`);
    return;
  }

  // Verify this is an integration flow
  const stateMetadata = oauthState.metadata as Readonly<Record<string, unknown>>;
  const { flow } = stateMetadata;
  const { tenantId } = stateMetadata;

  if (flow !== "integration" || typeof tenantId !== "string") {
    logger.warn("Invalid integration OAuth state metadata", {
      flow,
      hasTenantId: typeof tenantId === "string",
      ...context,
    });
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=invalid_state`);
    return;
  }

  // Verify provider matches state
  const callbackProvider = req.params.provider;
  if (callbackProvider !== oauthState.provider) {
    logger.warn("Integration provider mismatch between URL and state", {
      urlProvider: callbackProvider,
      stateProvider: oauthState.provider,
      ...context,
    });
    res.redirect(`${frontendUrl}/dashboard/integrations?integration_error=provider_mismatch`);
    return;
  }

  const provider = validateIntegrationProvider(oauthState.provider);
  const redirectUri = getRedirectUri(provider);

  const startTime = Date.now();

  try {
    const result = await integrationService.connect(
      provider,
      codeStr,
      redirectUri,
      tenantId,
      context
    );

    const durationMs = Date.now() - startTime;

    logger.info("Integration OAuth callback completed", {
      provider,
      connectionId: result.connectionId,
      webhookCreated: result.webhookCreated,
      durationMs,
      ...context,
    });

    // Redirect to settings with success params
    const successUrl = new URL(`${frontendUrl}/dashboard/integrations`);
    successUrl.searchParams.set("integration", provider);
    successUrl.searchParams.set("status", "connected");

    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(successUrl.toString());
  } catch (connectError: unknown) {
    const durationMs = Date.now() - startTime;

    logger.error("Integration OAuth connect failed", {
      provider,
      error: connectError instanceof Error ? connectError.message : "Unknown error",
      durationMs,
      ...context,
    });

    // Preserve plan limit metadata in redirect so frontend can show UpgradePrompt
    if (
      connectError instanceof AuthorizationError &&
      connectError.metadata?.code === "PLAN_LIMIT_EXCEEDED"
    ) {
      const limitParams = new URLSearchParams({
        integration: provider,
        status: "limit_exceeded",
        limitKey: String(connectError.metadata.limitKey),
        currentUsage: String(connectError.metadata.currentUsage),
        limit: String(connectError.metadata.limit),
        currentPlan: String(connectError.metadata.currentPlan),
      });
      res.redirect(`${frontendUrl}/dashboard/integrations?${limitParams.toString()}`);
      return;
    }

    res.redirect(`${frontendUrl}/dashboard/integrations?integration=${provider}&status=error`);
  }
};

/**
 * DELETE /integrations/:connectionId
 * Disconnect an integration (delete webhook + deactivate connection).
 */
const handleIntegrationDisconnect = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleIntegrationDisconnect",
    });
  }

  const { tenantId } = req.user;

  if (!tenantId) {
    throw new ValidationError("User must belong to a tenant to manage integrations", {
      operation: "handleIntegrationDisconnect",
    });
  }

  const { connectionId } = req.params;

  if (!connectionId) {
    throw new ValidationError("connectionId is required", {
      operation: "handleIntegrationDisconnect",
      metadata: { field: "connectionId" },
    });
  }

  const result = await integrationService.disconnect(connectionId, tenantId, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

// ==================== GitLab CI Connection Handlers ====================

/**
 * POST /integrations/gitlab/connect
 * Connect GitLab CI using the user's existing GitLab OAuth identity.
 */
const handleGitLabConnect = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGitLabConnect",
    });
  }

  const { userId, tenantId } = req.user;

  if (!tenantId) {
    throw new AuthorizationError("User must belong to a tenant to connect GitLab CI", {
      operation: "handleGitLabConnect",
    });
  }

  const result = await gitlabConnectionService.connectGitLab(userId, tenantId, req.context);
  res.status(HTTP_STATUS.CREATED).json({ data: result });
};

/**
 * GET /integrations/gitlab/connection
 * Check the current GitLab CI connection status for the tenant.
 */
const handleGitLabConnectionStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGitLabConnectionStatus",
    });
  }

  const { tenantId } = req.user;

  if (!tenantId) {
    throw new AuthorizationError("User must belong to a tenant to view GitLab CI status", {
      operation: "handleGitLabConnectionStatus",
    });
  }

  const status = await gitlabConnectionService.getGitLabConnectionStatus(tenantId, req.context);
  res.status(HTTP_STATUS.OK).json({ data: status });
};

/**
 * DELETE /integrations/gitlab/connection
 * Disconnect GitLab CI for the tenant.
 */
const handleGitLabDisconnect = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGitLabDisconnect",
    });
  }

  const { tenantId } = req.user;

  if (!tenantId) {
    throw new AuthorizationError("User must belong to a tenant to disconnect GitLab CI", {
      operation: "handleGitLabDisconnect",
    });
  }

  await gitlabConnectionService.disconnectGitLab(tenantId, req.context);
  res.status(HTTP_STATUS.OK).json({ data: { status: "disconnected" } });
};

// ==================== GitLab Project Setup Handlers ====================

/**
 * Validates that input is a non-empty array of positive integers,
 * capped at GITLAB_SETUP_CONFIG.MAX_PROJECT_IDS.
 */
const validateProjectIds = (body: unknown): readonly number[] => {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required", {
      operation: "validateProjectIds",
    });
  }

  const { projectIds } = body as Readonly<Record<string, unknown>>;

  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    throw new ValidationError("projectIds must be a non-empty array of numbers", {
      operation: "validateProjectIds",
      metadata: { field: "projectIds" },
    });
  }

  if (projectIds.length > GITLAB_SETUP_CONFIG.MAX_PROJECT_IDS) {
    throw new ValidationError(
      `Cannot set up more than ${String(GITLAB_SETUP_CONFIG.MAX_PROJECT_IDS)} projects at once`,
      {
        operation: "validateProjectIds",
        metadata: { count: projectIds.length, max: GITLAB_SETUP_CONFIG.MAX_PROJECT_IDS },
      }
    );
  }

  const allValid = projectIds.every(
    (id: unknown) => typeof id === "number" && Number.isInteger(id) && id > 0
  );

  if (!allValid) {
    throw new ValidationError("All projectIds must be positive integers", {
      operation: "validateProjectIds",
      metadata: { field: "projectIds" },
    });
  }

  return projectIds as readonly number[];
};

/**
 * GET /integrations/gitlab/available-projects
 * List GitLab projects accessible to the authenticated user.
 */
const handleGitLabAvailableProjects = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGitLabAvailableProjects",
    });
  }

  const { userId } = req.user;

  // Look up user's GitLab OAuth identity
  const identities = await findOAuthIdentitiesByUser(userId);
  const gitlabIdentity = identities.find((identity) => identity.provider === "gitlab");

  if (!gitlabIdentity?.accessToken) {
    throw new ValidationError("No GitLab OAuth identity found. Please log in with GitLab first.", {
      operation: "handleGitLabAvailableProjects",
    });
  }

  const projects = await gitlabProjectsAdapter.getProjects(
    gitlabIdentity.accessToken,
    gitlabIdentity.instanceUrl,
    req.context
  );

  res.status(HTTP_STATUS.OK).json({ data: projects });
};

/**
 * POST /integrations/gitlab/setup-webhooks
 * Create webhooks on selected GitLab projects for the authenticated tenant.
 */
const handleGitLabSetupWebhooks = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGitLabSetupWebhooks",
    });
  }

  const { userId, tenantId } = req.user;

  if (!tenantId) {
    throw new AuthorizationError("User must belong to a tenant to set up GitLab webhooks", {
      operation: "handleGitLabSetupWebhooks",
    });
  }

  const projectIds = validateProjectIds(req.body);

  const result = await gitlabSetupService.setupProjects(userId, tenantId, projectIds, req.context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

// ==================== Route Definitions ====================

// GitLab CI connection routes (registered before :provider/:connectionId to avoid conflicts)
router.post(
  "/integrations/gitlab/connect",
  rateLimitByCategory("standard"),
  asyncHandler(handleGitLabConnect)
);
router.get(
  "/integrations/gitlab/connection",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGitLabConnectionStatus)
);
router.delete(
  "/integrations/gitlab/connection",
  rateLimitByCategory("standard"),
  asyncHandler(handleGitLabDisconnect)
);
router.get(
  "/integrations/gitlab/available-projects",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGitLabAvailableProjects)
);
router.post(
  "/integrations/gitlab/setup-webhooks",
  rateLimitByCategory("standard"),
  asyncHandler(handleGitLabSetupWebhooks)
);

// OAuth integration routes
router.get("/integrations", rateLimitByCategory("readonly"), asyncHandler(handleListIntegrations));
router.get(
  "/integrations/:provider/connect",
  rateLimitByCategory("standard"),
  asyncHandler(handleIntegrationConnect)
);
router.get(
  "/integrations/:provider/callback",
  rateLimitByCategory("standard"),
  asyncHandler(handleIntegrationCallback)
);
router.delete(
  "/integrations/:connectionId",
  rateLimitByCategory("standard"),
  asyncHandler(handleIntegrationDisconnect)
);

export { router as integrationRoutes };
