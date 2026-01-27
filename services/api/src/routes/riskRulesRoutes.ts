/**
 * Risk Rules Routes
 *
 * API endpoints for managing custom risk rules and querying risk assessments.
 * Supports tenant-isolated CRUD operations with comprehensive validation.
 *
 * @module routes/riskRulesRoutes
 */

import { Router } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  ValidationError,
  NotFoundError,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
  createCustomRiskRule,
  getCustomRiskRules,
  getCustomRiskRuleById,
  updateCustomRiskRule,
  deleteCustomRiskRule,
  queryRiskAssessments,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Validation Helpers ====================

/**
 * Extracts tenant ID from request.
 * In production, this would come from authenticated user context.
 */
const extractTenantId = (req: {
  body?: { tenantId?: string };
  query?: { tenantId?: string };
}): string => {
  const tenantId = req.body?.tenantId ?? req.query?.tenantId;
  if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
    throw new ValidationError("Tenant ID is required", {
      operation: "extractTenantId",
      metadata: { field: "tenantId" },
    });
  }
  return tenantId.trim();
};

/**
 * Parses optional boolean query parameter.
 */
const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "true" || value === true) {
    return true;
  }
  if (value === "false" || value === false) {
    return false;
  }
  return undefined;
};

/**
 * Parses optional integer query parameter.
 */
const parseOptionalInt = (value: unknown, defaultValue?: number): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parses optional date query parameter.
 */
const parseOptionalDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

// ==================== Rule Routes ====================

/**
 * GET /api/risk-rules
 *
 * Lists custom risk rules for a tenant with optional filtering.
 */
router.get(
  "/api/risk-rules",
  asyncHandler(async (req, res) => {
    const tenantId = extractTenantId(req);

    const options: RiskRulesQueryOptions = {
      tenantId,
      actionType: req.query.actionType as string | undefined,
      environment: req.query.environment as "production" | "staging" | "development" | undefined,
      enabledOnly: parseOptionalBoolean(req.query.enabledOnly) ?? true,
      limit: parseOptionalInt(req.query.limit, 100),
      offset: parseOptionalInt(req.query.offset, 0),
    };

    logger.info("Listing risk rules", {
      tenantId,
      actionType: options.actionType,
      environment: options.environment,
    });

    const rules = await getCustomRiskRules(options);

    res.status(HTTP_STATUS.OK).json({
      rules,
      count: rules.length,
      tenantId,
    });
  })
);

/**
 * GET /api/risk-rules/:ruleId
 *
 * Gets a specific risk rule by ID.
 */
router.get(
  "/api/risk-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const tenantId = extractTenantId(req);
    const { ruleId } = req.params;

    if (!ruleId || typeof ruleId !== "string") {
      throw new ValidationError("Rule ID is required", {
        operation: "getRuleById",
        metadata: { field: "ruleId" },
      });
    }

    logger.info("Getting risk rule", { ruleId, tenantId });

    const rule = await getCustomRiskRuleById(ruleId, tenantId);

    if (!rule) {
      throw new NotFoundError("Risk rule not found", {
        metadata: { ruleId, tenantId },
      });
    }

    res.status(HTTP_STATUS.OK).json({ rule });
  })
);

/**
 * POST /api/risk-rules
 *
 * Creates a new custom risk rule.
 */
router.post(
  "/api/risk-rules",
  validate({
    body: {
      tenantId: (value) => validators.required(value) && validators.string(value),
      name: (value) => validators.required(value) && validators.string(value),
      actionTypes: (value) => validators.required(value) && Array.isArray(value),
    },
  }),
  asyncHandler(async (req, res) => {
    const input: CreateCustomRiskRuleInput = {
      tenantId: req.body.tenantId,
      name: req.body.name,
      description: req.body.description,
      actionTypes: req.body.actionTypes,
      environment: req.body.environment,
      blastRadius: req.body.blastRadius,
      reversibility: req.body.reversibility,
      dataImpact: req.body.dataImpact,
      scoreModifier: req.body.scoreModifier,
      productionMultiplier: req.body.productionMultiplier,
      incidentModeMultiplier: req.body.incidentModeMultiplier,
      offHoursMultiplier: req.body.offHoursMultiplier,
      requireApprovalThreshold: req.body.requireApprovalThreshold,
      blockThreshold: req.body.blockThreshold,
      enabled: req.body.enabled,
      priority: req.body.priority,
      createdBy: req.body.createdBy,
    };

    logger.info("Creating risk rule", {
      tenantId: input.tenantId,
      name: input.name,
      actionTypesCount: input.actionTypes.length,
    });

    const rule = await createCustomRiskRule(input);

    logger.info("Created risk rule", {
      ruleId: rule.id,
      tenantId: rule.tenantId,
      name: rule.name,
    });

    res.status(HTTP_STATUS.CREATED).json({ rule });
  })
);

/**
 * PATCH /api/risk-rules/:ruleId
 *
 * Updates an existing risk rule.
 */
router.patch(
  "/api/risk-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const tenantId = extractTenantId(req);
    const { ruleId } = req.params;

    if (!ruleId || typeof ruleId !== "string") {
      throw new ValidationError("Rule ID is required", {
        operation: "updateRule",
        metadata: { field: "ruleId" },
      });
    }

    const input: UpdateCustomRiskRuleInput = {
      name: req.body.name,
      description: req.body.description,
      actionTypes: req.body.actionTypes,
      environment: req.body.environment,
      blastRadius: req.body.blastRadius,
      reversibility: req.body.reversibility,
      dataImpact: req.body.dataImpact,
      scoreModifier: req.body.scoreModifier,
      productionMultiplier: req.body.productionMultiplier,
      incidentModeMultiplier: req.body.incidentModeMultiplier,
      offHoursMultiplier: req.body.offHoursMultiplier,
      requireApprovalThreshold: req.body.requireApprovalThreshold,
      blockThreshold: req.body.blockThreshold,
      enabled: req.body.enabled,
      priority: req.body.priority,
    };

    logger.info("Updating risk rule", { ruleId, tenantId });

    const rule = await updateCustomRiskRule(ruleId, tenantId, input);

    logger.info("Updated risk rule", {
      ruleId: rule.id,
      tenantId: rule.tenantId,
    });

    res.status(HTTP_STATUS.OK).json({ rule });
  })
);

/**
 * DELETE /api/risk-rules/:ruleId
 *
 * Deletes a risk rule.
 */
router.delete(
  "/api/risk-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const tenantId = extractTenantId(req);
    const { ruleId } = req.params;

    if (!ruleId || typeof ruleId !== "string") {
      throw new ValidationError("Rule ID is required", {
        operation: "deleteRule",
        metadata: { field: "ruleId" },
      });
    }

    logger.info("Deleting risk rule", { ruleId, tenantId });

    const deleted = await deleteCustomRiskRule(ruleId, tenantId);

    if (!deleted) {
      throw new NotFoundError("Risk rule not found", {
        metadata: { ruleId, tenantId },
      });
    }

    logger.info("Deleted risk rule", { ruleId, tenantId });

    res.status(HTTP_STATUS.NO_CONTENT).send();
  })
);

// ==================== Assessment Routes ====================

/**
 * GET /api/risk-assessments
 *
 * Queries risk assessment audit trail.
 */
router.get(
  "/api/risk-assessments",
  asyncHandler(async (req, res) => {
    const tenantId = extractTenantId(req);

    const options: RiskAssessmentsQueryOptions = {
      tenantId,
      actionProposalId: req.query.actionProposalId as string | undefined,
      actionType: req.query.actionType as string | undefined,
      fromDate: parseOptionalDate(req.query.fromDate),
      toDate: parseOptionalDate(req.query.toDate),
      limit: parseOptionalInt(req.query.limit, 100),
      offset: parseOptionalInt(req.query.offset, 0),
    };

    logger.info("Querying risk assessments", {
      tenantId,
      actionType: options.actionType,
      fromDate: options.fromDate,
      toDate: options.toDate,
    });

    const assessments = await queryRiskAssessments(options);

    res.status(HTTP_STATUS.OK).json({
      assessments,
      count: assessments.length,
      tenantId,
    });
  })
);

export { router as riskRulesRoutes };
