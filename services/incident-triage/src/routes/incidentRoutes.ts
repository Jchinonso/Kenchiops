/**
 * Incident Routes
 *
 * REST endpoints for querying and managing incident alerts.
 *
 * - GET /api/v1/incidents — Paginated list with optional filters
 * - GET /api/v1/incidents/:id — Single alert with full triage result
 * - GET /api/v1/incidents/stats/active-by-source — Active alert counts by source
 * - GET /api/v1/incidents/recent/balanced — Balanced recent incidents across sources
 * - POST /api/v1/incidents/:id/acknowledge — Mark alert as acknowledged
 * - POST /api/v1/incidents/:id/resolve — Mark alert as resolved
 *
 * @module routes/incidentRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  listIncidents,
  getAlertWithTriageResult,
  updateAlertStatus,
  getStatsBySource,
  getActiveCountsBySource,
  getBalancedRecentIncidents,
  INCIDENT_ALERT_DEFAULTS,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("incident-routes");

// ==================== Helpers ====================

/**
 * Extract tenantId from authenticated user or throw.
 * Uses JWT-derived identity instead of untrusted query params (VULN-005).
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

/** Clamps a value between min and max */
const clampLimit = (value: number): number =>
  Math.max(
    INCIDENT_ALERT_DEFAULTS.MIN_QUERY_LIMIT,
    Math.min(value, INCIDENT_ALERT_DEFAULTS.MAX_QUERY_LIMIT)
  );

/** Parses a query param as a non-negative integer, returning the fallback on failure */
const parseIntParam = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

/** Returns the string if non-empty, otherwise null */
const toFilterOrNull = (value: string | undefined): string | null => value?.trim() || null;

// ==================== Handlers ====================

/**
 * GET /api/v1/incidents
 * Paginated list of incidents filtered by tenant.
 */
const handleListIncidents = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const limit = clampLimit(
    parseIntParam(req.query.limit as string | undefined, INCIDENT_ALERT_DEFAULTS.QUERY_LIMIT)
  );
  const offset = parseIntParam(req.query.offset as string | undefined, 0);

  const result = await listIncidents({
    tenantId,
    status: toFilterOrNull(req.query.status as string | undefined),
    severity: toFilterOrNull(req.query.severity as string | undefined),
    source: toFilterOrNull(req.query.source as string | undefined),
    limit,
    offset,
  });

  logger.info("Listed incidents", {
    tenantId,
    resultCount: result.items.length,
    total: result.total,
  });

  res.status(HTTP_STATUS.OK).json({ data: result });
};

/**
 * GET /api/v1/incidents/:id
 * Single alert with full triage result.
 */
const handleGetIncident = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Incident ID is required");
  }

  const tenantId = requireTenantId(req);
  const result = await getAlertWithTriageResult(id, tenantId);
  if (!result) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  res.status(HTTP_STATUS.OK).json({ data: result });
};

/**
 * POST /api/v1/incidents/:id/acknowledge
 * Mark an alert as acknowledged.
 */
const handleAcknowledgeIncident = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Incident ID is required");
  }

  const tenantId = requireTenantId(req);

  const existing = await getAlertWithTriageResult(id, tenantId);
  if (!existing) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  const updated = await updateAlertStatus(id, "acknowledged");
  if (!updated) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  logger.info("Incident acknowledged", { alertId: id, tenantId });

  res.status(HTTP_STATUS.OK).json({ data: updated });
};

/**
 * POST /api/v1/incidents/:id/resolve
 * Mark an alert as resolved.
 */
const handleResolveIncident = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Incident ID is required");
  }

  const tenantId = requireTenantId(req);

  const existing = await getAlertWithTriageResult(id, tenantId);
  if (!existing) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  const updated = await updateAlertStatus(id, "resolved");
  if (!updated) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  logger.info("Incident resolved", { alertId: id, tenantId });

  res.status(HTTP_STATUS.OK).json({ data: updated });
};

/**
 * GET /api/v1/incidents/stats/by-source
 * Per-source aggregation stats for integration health indicators.
 */
const handleStatsBySource = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const stats = await getStatsBySource(tenantId);

  logger.info("Retrieved stats by source", {
    tenantId,
    sourceCount: stats.length,
  });

  res.status(HTTP_STATUS.OK).json({ data: stats });
};

/**
 * GET /api/v1/incidents/stats/active-by-source
 * Active (non-resolved/closed/deduped) alert counts grouped by source.
 */
const handleActiveCountsBySource = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const counts = await getActiveCountsBySource(tenantId);

  logger.info("Retrieved active counts by source", {
    tenantId,
    sourceCount: counts.length,
  });

  res.status(HTTP_STATUS.OK).json({ data: counts });
};

/** Default per-source limit for balanced recent incidents */
const DEFAULT_PER_SOURCE = 2;
/** Default total limit for balanced recent incidents */
const DEFAULT_MAX_TOTAL = 6;

/**
 * GET /api/v1/incidents/recent/balanced
 * Returns top N incidents per source for a balanced dashboard feed.
 */
const handleBalancedRecent = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const perSource = parseIntParam(req.query.perSource as string | undefined, DEFAULT_PER_SOURCE);
  const maxTotal = parseIntParam(req.query.maxTotal as string | undefined, DEFAULT_MAX_TOTAL);

  const items = await getBalancedRecentIncidents(tenantId, perSource, maxTotal);

  logger.info("Retrieved balanced recent incidents", {
    tenantId,
    perSource,
    maxTotal,
    resultCount: items.length,
  });

  res.status(HTTP_STATUS.OK).json({ data: items });
};

// ==================== Route Registration ====================
// Static paths registered before :id to avoid matching as param

router.get("/api/v1/incidents/stats/by-source", asyncHandler(handleStatsBySource));
router.get("/api/v1/incidents/stats/active-by-source", asyncHandler(handleActiveCountsBySource));
router.get("/api/v1/incidents/recent/balanced", asyncHandler(handleBalancedRecent));
router.get("/api/v1/incidents", asyncHandler(handleListIncidents));
router.get("/api/v1/incidents/:id", asyncHandler(handleGetIncident));
router.post("/api/v1/incidents/:id/acknowledge", asyncHandler(handleAcknowledgeIncident));
router.post("/api/v1/incidents/:id/resolve", asyncHandler(handleResolveIncident));

export { router as incidentRoutes };
