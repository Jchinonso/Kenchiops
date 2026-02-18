/**
 * Incident Routes
 *
 * REST endpoints for querying and managing incident alerts.
 *
 * - GET /api/v1/incidents — Paginated list with optional filters
 * - GET /api/v1/incidents/:id — Single alert with full triage result
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
  listIncidents,
  getAlertWithTriageResult,
  updateAlertStatus,
  INCIDENT_ALERT_DEFAULTS,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("incident-routes");

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
  const tenantId = (req.query.tenantId as string | undefined)?.trim();
  if (!tenantId) {
    throw new ValidationError("tenantId query parameter is required");
  }

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

  const result = await getAlertWithTriageResult(id);
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

  const updated = await updateAlertStatus(id, "acknowledged");
  if (!updated) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  logger.info("Incident acknowledged", { alertId: id });

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

  const updated = await updateAlertStatus(id, "resolved");
  if (!updated) {
    throw new NotFoundError("Incident not found", { metadata: { id } });
  }

  logger.info("Incident resolved", { alertId: id });

  res.status(HTTP_STATUS.OK).json({ data: updated });
};

// ==================== Route Registration ====================

router.get("/api/v1/incidents", asyncHandler(handleListIncidents));
router.get("/api/v1/incidents/:id", asyncHandler(handleGetIncident));
router.post("/api/v1/incidents/:id/acknowledge", asyncHandler(handleAcknowledgeIncident));
router.post("/api/v1/incidents/:id/resolve", asyncHandler(handleResolveIncident));

export { router as incidentRoutes };
