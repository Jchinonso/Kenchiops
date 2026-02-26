/**
 * API Key Routes
 *
 * Endpoints for creating, listing, and revoking API keys.
 * Requires admin or owner role for all operations.
 *
 * @module routes/apiKeyRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  requireTenantId,
  requirePermission,
  requireFeature,
  ValidationError,
  NotFoundError,
  HTTP_STATUS,
  getErrorMessage,
  rateLimitByCategory,
  createApiKey,
  findApiKeysByTenant,
  revokeApiKey,
  logAuditEvent,
  AUDIT_ACTIONS,
  type CreateApiKeyInput,
  type ApiKeyScope,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("api-key-routes");

// ==================== DTO Mappers ====================

const mapApiKeyToResponse = (apiKey: {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly role: string;
  readonly status: string;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}): Record<string, unknown> => ({
  id: apiKey.id,
  name: apiKey.name,
  keyPrefix: apiKey.keyPrefix,
  scopes: apiKey.scopes,
  role: apiKey.role,
  status: apiKey.status,
  lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
  expiresAt: apiKey.expiresAt?.toISOString() ?? null,
  createdAt: apiKey.createdAt.toISOString(),
});

// ==================== Route Handlers ====================

/**
 * POST /api/v1/api-keys
 * Create a new API key. Returns the plaintext key once.
 */
const handleCreateApiKey = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = requireTenantId(req);
  const { context } = req;
  const userId = req.user?.userId;
  const { name, scopes, role, expiresInDays } = req.body as {
    readonly name?: string;
    readonly scopes?: readonly string[];
    readonly role?: string;
    readonly expiresInDays?: number;
  };

  if (!userId) {
    throw new ValidationError("Authentication required", {
      operation: "handleCreateApiKey",
      metadata: { field: "userId" },
    });
  }

  const input: CreateApiKeyInput = {
    tenantId,
    userId,
    name: name ?? "",
    scopes: (scopes ?? []) as readonly ApiKeyScope[],
    role,
    expiresInDays,
  };

  const result = await createApiKey(input);

  logger.info("API key created via route", {
    ...context,
    apiKeyId: result.apiKey.id,
    durationMs: Date.now() - startTime,
  });

  // Best-effort audit log
  try {
    await logAuditEvent(
      tenantId,
      AUDIT_ACTIONS.MEMBER_ADDED,
      { apiKeyId: result.apiKey.id, name: result.apiKey.name, scopes: result.apiKey.scopes },
      userId
    );
  } catch (auditError: unknown) {
    logger.warn("Failed to log API key creation audit event", {
      ...context,
      error: getErrorMessage(auditError),
      durationMs: Date.now() - startTime,
    });
  }

  res.status(HTTP_STATUS.CREATED).json({
    data: {
      ...mapApiKeyToResponse(result.apiKey),
      plaintext: result.plaintext,
    },
  });
};

/**
 * GET /api/v1/api-keys
 * List all API keys for the current tenant.
 */
const handleListApiKeys = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const keys = await findApiKeysByTenant(tenantId);

  res.status(HTTP_STATUS.OK).json({
    data: keys.map(mapApiKeyToResponse),
  });
};

/**
 * DELETE /api/v1/api-keys/:apiKeyId
 * Revoke an API key.
 */
const handleRevokeApiKey = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const tenantId = requireTenantId(req);
  const { context } = req;
  const { apiKeyId } = req.params;

  if (!apiKeyId) {
    throw new ValidationError("apiKeyId parameter is required", {
      operation: "handleRevokeApiKey",
      metadata: { field: "apiKeyId" },
    });
  }

  const revoked = await revokeApiKey(apiKeyId, tenantId);

  if (!revoked) {
    throw new NotFoundError("API key not found", {
      metadata: { apiKeyId },
    });
  }

  logger.info("API key revoked via route", {
    ...context,
    apiKeyId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    data: { apiKeyId, status: "revoked" },
  });
};

// ==================== Route Definitions ====================

router.post(
  "/api/v1/api-keys",
  rateLimitByCategory("standard"),
  requirePermission("integrations.manage"),
  requireFeature("apiAccess"),
  asyncHandler(handleCreateApiKey)
);

router.get(
  "/api/v1/api-keys",
  rateLimitByCategory("readonly"),
  requirePermission("integrations.manage"),
  requireFeature("apiAccess"),
  asyncHandler(handleListApiKeys)
);

router.delete(
  "/api/v1/api-keys/:apiKeyId",
  rateLimitByCategory("standard"),
  requirePermission("integrations.manage"),
  requireFeature("apiAccess"),
  asyncHandler(handleRevokeApiKey)
);

export { router as apiKeyRoutes };
