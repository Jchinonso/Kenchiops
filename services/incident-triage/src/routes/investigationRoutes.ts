/**
 * Investigation Routes
 *
 * REST endpoints for starting and querying diagnostic investigations.
 *
 * - POST /api/v1/investigations — Start a new investigation (returns 202)
 * - GET /api/v1/investigations — Paginated list with optional filters
 * - GET /api/v1/investigations/:id — Single investigation with full results
 *
 * Dependencies (queue) are injected from the composition root via factory.
 *
 * @module routes/investigationRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  createInvestigation,
  getInvestigationById,
  listInvestigations,
  INVESTIGATION_DEFAULTS,
  type QueueManager,
} from "@kenchi/shared";

const logger = createLogger("investigation-routes");

// ==================== Types ====================

/**
 * Dependencies required by investigation routes, provided by the composition root.
 */
interface InvestigationRouteDependencies {
  readonly queue: QueueManager;
}

// ==================== Helpers ====================

/** Clamps a value between the configured min and max query limits */
const clampLimit = (value: number): number =>
  Math.max(
    INVESTIGATION_DEFAULTS.MIN_QUERY_LIMIT,
    Math.min(value, INVESTIGATION_DEFAULTS.MAX_QUERY_LIMIT)
  );

/** Parses a query param as a non-negative integer, returning the fallback on failure */
const parseIntParam = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

/** Returns the trimmed string if non-empty, otherwise null */
const toFilterOrNull = (value: string | undefined): string | null => value?.trim() || null;

/** Extracts a string field from the body, returning the fallback if missing/empty */
const extractStringField = (
  body: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string
): string => {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
};

/** Extracts an optional string field from the body, returning null if missing/empty */
const extractOptionalString = (
  body: Readonly<Record<string, unknown>>,
  key: string
): string | null => {
  const value = body[key];
  return typeof value === "string" ? value.trim() || null : null;
};

/** Extracts a date field from the body, returning null if missing/invalid */
const extractOptionalDate = (body: Readonly<Record<string, unknown>>, key: string): Date | null => {
  const value = body[key];
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

// ==================== Route Factory ====================

/**
 * Creates investigation routes with injected dependencies.
 *
 * @param deps - Queue manager from the composition root
 * @returns Express Router with investigation routes registered
 */
export const createInvestigationRoutes = (deps: InvestigationRouteDependencies): Router => {
  const router = Router();
  const { queue } = deps;

  /**
   * Extract tenantId from authenticated user or throw (VULN-004).
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

  // ==================== Handlers ====================

  /**
   * POST /api/v1/investigations
   * Start a new investigation. Returns 202 with the queued record.
   */
  const handleStartInvestigation = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Readonly<Record<string, unknown>>;
    const { description } = body;

    if (typeof description !== "string" || description.trim().length === 0) {
      throw new ValidationError("description is required and must be a non-empty string");
    }

    const tenantId = requireTenantId(req);
    const initiatedBy = extractStringField(body, "initiatedBy", "api");
    const initiatedFrom = extractStringField(body, "initiatedFrom", "api");

    const record = await createInvestigation({
      tenantId,
      initiatedBy,
      initiatedFrom,
      description: description.trim(),
      serviceName: extractOptionalString(body, "serviceName"),
      endpoint: extractOptionalString(body, "endpoint"),
      symptom: extractOptionalString(body, "symptom"),
      environment: extractOptionalString(body, "environment"),
      timeRangeFrom: extractOptionalDate(body, "timeRangeFrom"),
      timeRangeTo: extractOptionalDate(body, "timeRangeTo"),
    });

    await queue.enqueue("investigate", {
      investigationId: record.id,
      tenantId,
      initiatedBy,
    });

    logger.info("Investigation started", {
      investigationId: record.id,
      tenantId,
    });

    res.status(HTTP_STATUS.ACCEPTED).json({
      data: { id: record.id, status: "queued" },
    });
  };

  /**
   * GET /api/v1/investigations
   * Paginated list of investigations filtered by tenant.
   */
  const handleListInvestigations = async (req: Request, res: Response): Promise<void> => {
    const tenantId = requireTenantId(req);

    const limit = clampLimit(
      parseIntParam(req.query.limit as string | undefined, INVESTIGATION_DEFAULTS.QUERY_LIMIT)
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);
    const status = toFilterOrNull(req.query.status as string | undefined);

    const result = await listInvestigations({
      tenantId,
      status,
      limit,
      offset,
    });

    logger.info("Listed investigations", {
      tenantId,
      resultCount: result.items.length,
      total: result.total,
    });

    res.status(HTTP_STATUS.OK).json({ data: result });
  };

  /**
   * GET /api/v1/investigations/:id
   * Single investigation with full results.
   */
  const handleGetInvestigation = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id?.trim()) {
      throw new ValidationError("Investigation ID is required");
    }

    const tenantId = requireTenantId(req);
    const investigation = await getInvestigationById(id);
    if (!investigation) {
      throw new NotFoundError("Investigation not found", { metadata: { id } });
    }

    // Tenant isolation: verify the record belongs to the authenticated tenant (VULN-006)
    if (investigation.tenantId !== tenantId) {
      throw new NotFoundError("Investigation not found", { metadata: { id } });
    }

    res.status(HTTP_STATUS.OK).json({ data: investigation });
  };

  // ==================== Route Registration ====================

  router.post("/api/v1/investigations", asyncHandler(handleStartInvestigation));
  router.get("/api/v1/investigations", asyncHandler(handleListInvestigations));
  router.get("/api/v1/investigations/:id", asyncHandler(handleGetInvestigation));

  return router;
};
