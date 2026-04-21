/**
 * Postmortem Routes
 *
 * REST endpoints for managing AI-generated postmortem documents.
 *
 * - GET /api/v1/postmortems — Paginated list of postmortems
 * - GET /api/v1/postmortems/:id — Single postmortem by ID
 * - POST /api/v1/postmortems/generate — Generate a draft from an alert
 * - POST /api/v1/postmortems — Create a new postmortem
 * - PUT /api/v1/postmortems/:id — Update a postmortem
 * - POST /api/v1/postmortems/:id/publish — Publish a postmortem
 *
 * @module routes/postmortemRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  ValidationError,
  NotFoundError,
  requireTenantId,
  rateLimitByCategory,
  listPostmortems,
  getPostmortemById,
  createPostmortem,
  updatePostmortem,
  publishPostmortem,
  getAlertWithTriageResult,
  POSTMORTEM_DEFAULTS,
  type PostmortemContent,
  type PostmortemStatus,
} from "@kenchi/shared";
import { generatePostmortemDraft } from "../services/postmortemGenerator.js";

const router = Router();
const logger = createLogger("postmortem-routes");

// ==================== Helpers ====================

const clampLimit = (value: number): number =>
  Math.max(
    POSTMORTEM_DEFAULTS.MIN_QUERY_LIMIT,
    Math.min(value, POSTMORTEM_DEFAULTS.MAX_QUERY_LIMIT)
  );

const parseIntParam = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

const toFilterOrNull = (value: string | undefined): string | null => value?.trim() || null;

// ==================== Handlers ====================

/**
 * GET /api/v1/postmortems
 * Paginated list of postmortems filtered by tenant.
 */
const handleListPostmortems = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const limit = clampLimit(
    parseIntParam(req.query.limit as string | undefined, POSTMORTEM_DEFAULTS.QUERY_LIMIT)
  );
  const offset = parseIntParam(req.query.offset as string | undefined, 0);

  const result = await listPostmortems({
    tenantId,
    status: toFilterOrNull(req.query.status as string | undefined),
    limit,
    offset,
  });

  logger.info("Listed postmortems", {
    tenantId,
    resultCount: result.items.length,
    total: result.total,
  });

  res.status(HTTP_STATUS.OK).json({ data: result });
};

/**
 * GET /api/v1/postmortems/:id
 * Single postmortem by ID.
 */
const handleGetPostmortem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Postmortem ID is required");
  }

  const tenantId = requireTenantId(req);
  const result = await getPostmortemById(id, tenantId);
  if (!result) {
    throw new NotFoundError("Postmortem not found", { metadata: { id } });
  }

  res.status(HTTP_STATUS.OK).json({ data: result });
};

/**
 * POST /api/v1/postmortems/generate
 * Generate a postmortem draft from an alert ID.
 */
const handleGeneratePostmortem = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const alertId = (req.body as { readonly alertId?: string })?.alertId;

  if (!alertId?.trim()) {
    throw new ValidationError("alertId is required in request body");
  }

  const alertResult = await getAlertWithTriageResult(alertId, tenantId);
  if (!alertResult) {
    throw new NotFoundError("Alert not found", { metadata: { alertId } });
  }

  const triageData = alertResult.triageResult
    ? {
        aiSummary:
          ((alertResult.triageResult as Readonly<Record<string, unknown>>).aiSummary as Readonly<
            Record<string, unknown>
          > | null) ?? null,
        severityLabel:
          ((alertResult.triageResult as Readonly<Record<string, unknown>>).severityLabel as
            | string
            | null) ?? null,
        evidenceCatalog:
          ((alertResult.triageResult as Readonly<Record<string, unknown>>)
            .evidenceCatalog as Readonly<Record<string, unknown>>) ?? {},
        pipelineDurationMs:
          ((alertResult.triageResult as Readonly<Record<string, unknown>>).pipelineDurationMs as
            | number
            | null) ?? null,
        createdAt: (alertResult.triageResult as Readonly<Record<string, unknown>>).createdAt,
      }
    : null;

  const draft = generatePostmortemDraft({
    alert: alertResult.alert,
    triageResult: triageData,
  });

  const saved = await createPostmortem({
    tenantId,
    alertId,
    title: draft.title,
    content: draft.content,
    status: "draft",
  });

  logger.info("Postmortem generated from alert", {
    postmortemId: saved.id,
    alertId,
    tenantId,
  });

  res.status(HTTP_STATUS.CREATED).json({ data: saved });
};

/**
 * POST /api/v1/postmortems
 * Create a new postmortem (manual).
 */
const handleCreatePostmortem = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const body = req.body as {
    readonly title?: string;
    readonly alertId?: string;
    readonly content?: PostmortemContent;
    readonly status?: PostmortemStatus;
  };

  if (!body.title?.trim()) {
    throw new ValidationError("title is required");
  }

  const saved = await createPostmortem({
    tenantId,
    alertId: body.alertId ?? null,
    title: body.title,
    content: body.content ?? {
      summary: "",
      timeline: "",
      rootCause: "",
      impact: "",
      actionItems: [],
      lessonsLearned: "",
      additionalNotes: "",
    },
    status: body.status ?? "draft",
  });

  logger.info("Postmortem created", {
    postmortemId: saved.id,
    tenantId,
  });

  res.status(HTTP_STATUS.CREATED).json({ data: saved });
};

/**
 * PUT /api/v1/postmortems/:id
 * Update a postmortem.
 */
const handleUpdatePostmortem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Postmortem ID is required");
  }

  const tenantId = requireTenantId(req);
  const body = req.body as {
    readonly title?: string;
    readonly content?: PostmortemContent;
    readonly status?: PostmortemStatus;
  };

  const updated = await updatePostmortem(id, tenantId, {
    title: body.title,
    content: body.content,
    status: body.status,
  });

  if (!updated) {
    throw new NotFoundError("Postmortem not found", { metadata: { id } });
  }

  logger.info("Postmortem updated", {
    postmortemId: updated.id,
    tenantId,
  });

  res.status(HTTP_STATUS.OK).json({ data: updated });
};

/**
 * POST /api/v1/postmortems/:id/publish
 * Publish a postmortem.
 */
const handlePublishPostmortem = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id?.trim()) {
    throw new ValidationError("Postmortem ID is required");
  }

  const tenantId = requireTenantId(req);

  const published = await publishPostmortem(id, tenantId);
  if (!published) {
    throw new NotFoundError("Postmortem not found", { metadata: { id } });
  }

  logger.info("Postmortem published", {
    postmortemId: published.id,
    tenantId,
  });

  res.status(HTTP_STATUS.OK).json({ data: published });
};

// ==================== Route Registration ====================
// Static paths registered before :id to avoid matching as param

router.post(
  "/api/v1/postmortems/generate",
  rateLimitByCategory("standard"),
  asyncHandler(handleGeneratePostmortem)
);
router.get(
  "/api/v1/postmortems",
  rateLimitByCategory("readonly"),
  asyncHandler(handleListPostmortems)
);
router.get(
  "/api/v1/postmortems/:id",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetPostmortem)
);
router.post(
  "/api/v1/postmortems",
  rateLimitByCategory("standard"),
  asyncHandler(handleCreatePostmortem)
);
router.put(
  "/api/v1/postmortems/:id",
  rateLimitByCategory("standard"),
  asyncHandler(handleUpdatePostmortem)
);
router.post(
  "/api/v1/postmortems/:id/publish",
  rateLimitByCategory("standard"),
  asyncHandler(handlePublishPostmortem)
);

export { router as postmortemRoutes };
