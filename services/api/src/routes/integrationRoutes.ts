/**
 * Integration OAuth Routes
 *
 * Endpoints for connecting/disconnecting CI providers (Vercel, Netlify)
 * via OAuth. Handles OAuth initiation, callback, listing, and disconnection.
 *
 * @module routes/integrationRoutes
 */

import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  ValidationError,
  AuthenticationError,
  config,
  VALID_INTEGRATION_PROVIDERS,
  INTEGRATION_OAUTH_AUTHORIZE_URLS,
  HTTP_STATUS,
  createOAuthState,
  consumeOAuthState,
  type IntegrationProvider,
  type RequestContext,
} from "@kenchi/shared";

import { createIntegrationService } from "../services/integrationService.js";
import { getIntegrationAdapter } from "../adapters/integrationAdapterRegistry.js";

// ==================== Setup ====================

const router = Router();
const logger = createLogger("integration-routes");

const integrationService = createIntegrationService(getIntegrationAdapter);

// ==================== Helpers ====================

/** Extract the RequestContext from an Express request. */
const getRequestContext = (req: Request): RequestContext => {
  const reqWithContext = req as Request & { readonly context?: RequestContext };
  return (
    reqWithContext.context ?? {
      requestId: crypto.randomUUID(),
      tenantId: "anonymous",
    }
  );
};

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
  const context = getRequestContext(req);

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
  const context = getRequestContext(req);

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
  const context = getRequestContext(req);
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

    res.redirect(`${frontendUrl}/dashboard/integrations?integration=${provider}&status=error`);
  }
};

/**
 * DELETE /integrations/:connectionId
 * Disconnect an integration (delete webhook + deactivate connection).
 */
const handleIntegrationDisconnect = async (req: Request, res: Response): Promise<void> => {
  const context = getRequestContext(req);

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

// ==================== Route Definitions ====================

router.get("/integrations", asyncHandler(handleListIntegrations));
router.get("/integrations/:provider/connect", asyncHandler(handleIntegrationConnect));
router.get("/integrations/:provider/callback", asyncHandler(handleIntegrationCallback));
router.delete("/integrations/:connectionId", asyncHandler(handleIntegrationDisconnect));

export { router as integrationRoutes };
