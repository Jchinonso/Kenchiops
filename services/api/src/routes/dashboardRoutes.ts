/**
 * Dashboard Routes
 *
 * API endpoints for the CI/CD dashboard.
 * All endpoints require authentication and a linked tenant.
 *
 * @module routes/dashboardRoutes
 */

import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  AuthorizationError,
  HTTP_STATUS,
  PARSE_INT_RADIX,
  DASHBOARD_PAGINATION,
  type RequestContext,
} from "@kenchi/shared";
import { createGitHubInstallationAdapter } from "../adapters/githubInstallationAdapter.js";
import { createDashboardService } from "../services/dashboardService.js";

const router = Router();

// ==================== Service Wiring ====================

const githubAdapter = createGitHubInstallationAdapter();
const dashboardService = createDashboardService(githubAdapter);

// ==================== Helpers ====================

/**
 * Extract the RequestContext from an Express request.
 * Context is set by upstream middleware; if missing, creates a
 * minimal context from the request to ensure propagation.
 */
const getRequestContext = (req: Request): RequestContext => {
  const reqWithContext = req as Request & { readonly context?: RequestContext };
  return (
    reqWithContext.context ?? {
      requestId: crypto.randomUUID(),
      tenantId: "anonymous",
    }
  );
};

/**
 * Extract tenantId from authenticated user or throw.
 *
 * @throws AuthorizationError if no tenant is linked
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Install the Kenchi GitHub App to get started.",
      { operation: "requireTenantId" }
    );
  }

  return tenantId;
};

/**
 * Parse and clamp pagination parameters from query string.
 */
const parsePaginationParams = (
  req: Request
): { readonly limit: number; readonly offset: number } => {
  const rawLimit = parseInt(
    String(req.query.limit ?? DASHBOARD_PAGINATION.DEFAULT_LIMIT),
    PARSE_INT_RADIX
  );
  const rawOffset = parseInt(String(req.query.offset ?? 0), PARSE_INT_RADIX);
  const limit = Math.min(
    Math.max(Number.isNaN(rawLimit) ? DASHBOARD_PAGINATION.DEFAULT_LIMIT : rawLimit, 1),
    DASHBOARD_PAGINATION.MAX_LIMIT
  );
  const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);
  return { limit, offset };
};

// ==================== Route Handlers ====================

const handleGetTenantInfo = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const result = await dashboardService.getTenantInfo(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetDashboardStats = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const result = await dashboardService.getDashboardStats(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetRepositories = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const result = await dashboardService.getRepositories(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const parseStringParam = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const parseNumericParam = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const handleGetAnalyses = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const { limit, offset } = parsePaginationParams(req);
  const { repository: repoParam, minConfidence: confParam } = req.query;

  const repository = parseStringParam(repoParam);
  const minConfidence = parseNumericParam(confParam);
  const hasFilters = repository !== null || minConfidence !== null;

  const result = hasFilters
    ? await dashboardService.getAnalysesFiltered(
        tenantId,
        repository,
        minConfidence,
        limit,
        offset,
        context
      )
    : await dashboardService.getAnalyses(tenantId, limit, offset, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetFailures = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const { limit, offset } = parsePaginationParams(req);
  const { repository: repoParam, severity: sevParam } = req.query;

  const repository = parseStringParam(repoParam);
  const severity = parseStringParam(sevParam);
  const hasFilters = repository !== null || severity !== null;

  const result = hasFilters
    ? await dashboardService.getFailuresFiltered(
        tenantId,
        repository,
        severity,
        limit,
        offset,
        context
      )
    : await dashboardService.getFailures(tenantId, limit, offset, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetAnalysisDetail = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const { id } = req.params;

  if (!id) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: { code: "INVALID_ID", message: "Analysis ID required" },
    });
    return;
  }

  const result = await dashboardService.getAnalysisDetail(tenantId, id, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetAnalysisStatusByEvents = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const context = getRequestContext(req);
  const { eventIds } = req.body as { readonly eventIds?: readonly string[] };
  const { length: idCount } = Array.isArray(eventIds) ? eventIds : [];

  if (!Array.isArray(eventIds) || idCount === 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: { code: "INVALID_INPUT", message: "eventIds array is required" },
    });
    return;
  }

  const cappedIds: readonly string[] = eventIds.slice(0, DASHBOARD_PAGINATION.MAX_BATCH_SIZE);

  const result = await dashboardService.getAnalysisStatusByEvents(tenantId, cappedIds, context);

  const data: Readonly<
    Record<string, { readonly analysisId: string; readonly confidence: number } | null>
  > = Object.fromEntries(cappedIds.map((id) => [id, result.get(id) ?? null]));

  res.status(HTTP_STATUS.OK).json({ data });
};

// ==================== Route Definitions ====================

router.get("/api/v1/dashboard/tenant", asyncHandler(handleGetTenantInfo));
router.get("/api/v1/dashboard/stats", asyncHandler(handleGetDashboardStats));
router.get("/api/v1/dashboard/repositories", asyncHandler(handleGetRepositories));
router.post("/api/v1/dashboard/analyses/by-events", asyncHandler(handleGetAnalysisStatusByEvents));
router.get("/api/v1/dashboard/analyses/:id", asyncHandler(handleGetAnalysisDetail));
router.get("/api/v1/dashboard/analyses", asyncHandler(handleGetAnalyses));
router.get("/api/v1/dashboard/failures", asyncHandler(handleGetFailures));

export { router as dashboardRoutes };
