/**
 * Dashboard Routes
 *
 * API endpoints for the CI/CD dashboard.
 * All endpoints require authentication and a linked tenant.
 *
 * @module routes/dashboardRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  AuthorizationError,
  ValidationError,
  HTTP_STATUS,
  PARSE_INT_RADIX,
  DASHBOARD_PAGINATION,
  ANALYSIS_DEFAULTS,
} from "@kenchi/shared";
import { createGitHubInstallationAdapter } from "../adapters/githubInstallationAdapter.js";
import { createGitLabProjectsAdapter } from "../adapters/gitlabProjectsAdapter.js";
import { createDashboardService } from "../services/dashboardService.js";

const router = Router();

// ==================== Service Wiring ====================

const githubAdapter = createGitHubInstallationAdapter();
const gitlabProjectsAdapter = createGitLabProjectsAdapter();
const dashboardService = createDashboardService(githubAdapter, gitlabProjectsAdapter);

// ==================== Helpers ====================

/**
 * Extract tenantId from authenticated user or throw.
 *
 * @throws AuthorizationError if no tenant is linked
 */
const requireTenantId = (req: Request): string => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    throw new AuthorizationError(
      "No organization linked. Connect a GitHub or GitLab account to get started.",
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
  const { context } = req;
  const result = await dashboardService.getTenantInfo(tenantId, req.user?.userId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetDashboardStats = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const result = await dashboardService.getDashboardStats(tenantId, req.user?.userId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetRepositories = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
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
  const { context } = req;
  const { limit, offset } = parsePaginationParams(req);
  const {
    repository: repoParam,
    minConfidence: confParam,
    maxConfidence: maxConfParam,
    since: sinceParam,
    until: untilParam,
  } = req.query;

  const repository = parseStringParam(repoParam);
  const minConfidence = parseNumericParam(confParam);
  const maxConfidence = parseNumericParam(maxConfParam);
  const since = parseStringParam(sinceParam);
  const until = parseStringParam(untilParam);
  const hasFilters =
    repository !== null ||
    minConfidence !== null ||
    maxConfidence !== null ||
    since !== null ||
    until !== null;

  const result = hasFilters
    ? await dashboardService.getAnalysesFiltered(
        tenantId,
        repository,
        minConfidence,
        maxConfidence,
        since,
        until,
        limit,
        offset,
        context
      )
    : await dashboardService.getAnalyses(tenantId, limit, offset, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetFailures = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const { limit, offset } = parsePaginationParams(req);
  const {
    repository: repoParam,
    severity: sevParam,
    since: sinceParam,
    until: untilParam,
  } = req.query;

  const repository = parseStringParam(repoParam);
  const severity = parseStringParam(sevParam);
  const since = parseStringParam(sinceParam);
  const until = parseStringParam(untilParam);
  const hasFilters = repository !== null || severity !== null || since !== null || until !== null;

  const result = hasFilters
    ? await dashboardService.getFailuresFiltered(
        tenantId,
        repository,
        severity,
        since,
        until,
        limit,
        offset,
        context
      )
    : await dashboardService.getFailures(tenantId, limit, offset, context);

  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetAnalysisDetail = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
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
  const { context } = req;
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

const handleGetConfidenceDistribution = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const result = await dashboardService.getConfidenceDistributionStats(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetWebhookActivity = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const { limit, offset } = parsePaginationParams(req);
  const source = parseStringParam(req.query.source);
  const status = parseStringParam(req.query.status);

  const result = await dashboardService.getWebhookActivity(
    tenantId,
    source,
    status,
    limit,
    offset,
    context
  );

  res.status(HTTP_STATUS.OK).json({ data: result });
};

const VALID_TREND_BUCKETS = new Set(["day", "week"]);

const handleGetConfidenceTrend = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  const bucketParam = parseStringParam(req.query.bucket);
  const bucket: "day" | "week" =
    bucketParam !== null && VALID_TREND_BUCKETS.has(bucketParam)
      ? (bucketParam as "day" | "week")
      : "day";

  const sinceParam = parseStringParam(req.query.since);
  const since =
    sinceParam ??
    new Date(Date.now() - ANALYSIS_DEFAULTS.DEFAULT_TREND_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const result = await dashboardService.getConfidenceTrendData(tenantId, bucket, since, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetAnalysisCountsByRepo = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const result = await dashboardService.getAnalysisCountsByRepo(tenantId, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

const handleGetGitLabProjects = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AuthorizationError("Authentication required", {
      operation: "getGitLabProjects",
    });
  }

  const { context } = req;
  const projects = await dashboardService.getGitLabProjects(userId, context);
  res.status(HTTP_STATUS.OK).json({ data: projects });
};

const handleGetCorrelations = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const { commitSha } = req.params;

  if (!commitSha || commitSha.length < DASHBOARD_PAGINATION.MIN_COMMIT_SHA_LENGTH) {
    throw new ValidationError("Valid commit SHA required (minimum 7 characters)");
  }

  const result = await dashboardService.getCorrelations(tenantId, commitSha, context);
  res.status(HTTP_STATUS.OK).json({ data: result });
};

// ==================== Route Definitions ====================

router.get("/api/v1/dashboard/tenant", asyncHandler(handleGetTenantInfo));
router.get("/api/v1/dashboard/stats", asyncHandler(handleGetDashboardStats));
router.get(
  "/api/v1/dashboard/stats/confidence-distribution",
  asyncHandler(handleGetConfidenceDistribution)
);
router.get("/api/v1/dashboard/stats/confidence-trend", asyncHandler(handleGetConfidenceTrend));
router.get("/api/v1/dashboard/stats/analyses-by-repo", asyncHandler(handleGetAnalysisCountsByRepo));
router.get("/api/v1/dashboard/repositories", asyncHandler(handleGetRepositories));
router.get("/api/v1/dashboard/gitlab/projects", asyncHandler(handleGetGitLabProjects));
router.post("/api/v1/dashboard/analyses/by-events", asyncHandler(handleGetAnalysisStatusByEvents));
router.get("/api/v1/dashboard/correlations/:commitSha", asyncHandler(handleGetCorrelations));
router.get("/api/v1/dashboard/analyses/:id", asyncHandler(handleGetAnalysisDetail));
router.get("/api/v1/dashboard/analyses", asyncHandler(handleGetAnalyses));
router.get("/api/v1/dashboard/failures", asyncHandler(handleGetFailures));
router.get("/api/v1/dashboard/webhook-activity", asyncHandler(handleGetWebhookActivity));

export { router as dashboardRoutes };
