/**
 * Risk Rules Routes
 *
 * API endpoints for managing custom risk rules and querying risk assessments.
 * Supports tenant-isolated CRUD operations with comprehensive validation.
 *
 * @module routes/riskRulesRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  validate,
  validators,
  HTTP_STATUS,
  createLogger,
  SERVICE_NAMES,
  ValidationError,
  NotFoundError,
  API_PAGINATION_DEFAULTS,
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
import type { CreateRiskRuleRequestBody, UpdateRiskRuleRequestBody } from "../types/apiTypes.js";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Validation Rules ====================

/** Validation rule: required string */
const validateRequiredString = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return validators.string(fieldValue);
};

/** Validation rule: required array */
const validateRequiredArray = (fieldValue: unknown): boolean | string => {
  const requiredResult = validators.required(fieldValue);
  if (requiredResult !== true) {
    return requiredResult;
  }
  return Array.isArray(fieldValue) || "Must be an array";
};

// ==================== Utility Functions ====================

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

// ==================== Route Handlers ====================

/**
 * Handles listing custom risk rules for a tenant.
 */
const handleListRiskRules = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;

  const options: RiskRulesQueryOptions = {
    tenantId,
    actionType: req.query.actionType as string | undefined,
    environment: req.query.environment as "production" | "staging" | "development" | undefined,
    enabledOnly: parseOptionalBoolean(req.query.enabledOnly) ?? true,
    limit: parseOptionalInt(req.query.limit, API_PAGINATION_DEFAULTS.DEFAULT_LIMIT),
    offset: parseOptionalInt(req.query.offset, API_PAGINATION_DEFAULTS.DEFAULT_OFFSET),
  };

  const rules = await getCustomRiskRules(options);

  logger.info("Risk rules listed", {
    tenantId,
    actionType: options.actionType,
    environment: options.environment,
    count: rules.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    rules,
    count: rules.length,
    tenantId,
  });
};

/**
 * Handles getting a specific risk rule by ID.
 */
const handleGetRiskRuleById = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;
  const { ruleId } = req.params;

  if (!ruleId || typeof ruleId !== "string") {
    throw new ValidationError("Rule ID is required", {
      operation: "getRuleById",
      metadata: { field: "ruleId" },
    });
  }

  const rule = await getCustomRiskRuleById(ruleId, tenantId);

  if (!rule) {
    throw new NotFoundError("Risk rule not found", {
      metadata: { ruleId, tenantId },
    });
  }

  logger.info("Risk rule retrieved", {
    ruleId,
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({ rule });
};

/**
 * Handles creating a new custom risk rule.
 */
const handleCreateRiskRule = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = req.body as CreateRiskRuleRequestBody;

  const input: CreateCustomRiskRuleInput = {
    tenantId: req.context.tenantId,
    name: body.name,
    description: body.description,
    actionTypes: body.actionTypes,
    environment: body.environment,
    blastRadius: body.blastRadius,
    reversibility: body.reversibility,
    dataImpact: body.dataImpact,
    scoreModifier: body.scoreModifier,
    productionMultiplier: body.productionMultiplier,
    incidentModeMultiplier: body.incidentModeMultiplier,
    offHoursMultiplier: body.offHoursMultiplier,
    requireApprovalThreshold: body.requireApprovalThreshold,
    blockThreshold: body.blockThreshold,
    enabled: body.enabled,
    priority: body.priority,
    createdBy: body.createdBy,
  };

  const rule = await createCustomRiskRule(input);

  logger.info("Risk rule created", {
    ruleId: rule.id,
    tenantId: rule.tenantId,
    name: rule.name,
    actionTypesCount: input.actionTypes.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.CREATED).json({ rule });
};

/**
 * Handles updating an existing risk rule.
 */
const handleUpdateRiskRule = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;
  const { ruleId } = req.params;
  const body = req.body as UpdateRiskRuleRequestBody;

  if (!ruleId || typeof ruleId !== "string") {
    throw new ValidationError("Rule ID is required", {
      operation: "updateRule",
      metadata: { field: "ruleId" },
    });
  }

  const input: UpdateCustomRiskRuleInput = {
    name: body.name,
    description: body.description,
    actionTypes: body.actionTypes,
    environment: body.environment,
    blastRadius: body.blastRadius,
    reversibility: body.reversibility,
    dataImpact: body.dataImpact,
    scoreModifier: body.scoreModifier,
    productionMultiplier: body.productionMultiplier,
    incidentModeMultiplier: body.incidentModeMultiplier,
    offHoursMultiplier: body.offHoursMultiplier,
    requireApprovalThreshold: body.requireApprovalThreshold,
    blockThreshold: body.blockThreshold,
    enabled: body.enabled,
    priority: body.priority,
  };

  const rule = await updateCustomRiskRule(ruleId, tenantId, input);

  logger.info("Risk rule updated", {
    ruleId: rule.id,
    tenantId: rule.tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({ rule });
};

/**
 * Handles deleting a risk rule.
 */
const handleDeleteRiskRule = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;
  const { ruleId } = req.params;

  if (!ruleId || typeof ruleId !== "string") {
    throw new ValidationError("Rule ID is required", {
      operation: "deleteRule",
      metadata: { field: "ruleId" },
    });
  }

  const deleted = await deleteCustomRiskRule(ruleId, tenantId);

  if (!deleted) {
    throw new NotFoundError("Risk rule not found", {
      metadata: { ruleId, tenantId },
    });
  }

  logger.info("Risk rule deleted", {
    ruleId,
    tenantId,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * Handles querying risk assessment audit trail.
 */
const handleQueryRiskAssessments = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { tenantId } = req.context;

  const options: RiskAssessmentsQueryOptions = {
    tenantId,
    actionProposalId: req.query.actionProposalId as string | undefined,
    actionType: req.query.actionType as string | undefined,
    fromDate: parseOptionalDate(req.query.fromDate),
    toDate: parseOptionalDate(req.query.toDate),
    limit: parseOptionalInt(req.query.limit, API_PAGINATION_DEFAULTS.DEFAULT_LIMIT),
    offset: parseOptionalInt(req.query.offset, API_PAGINATION_DEFAULTS.DEFAULT_OFFSET),
  };

  const assessments = await queryRiskAssessments(options);

  logger.info("Risk assessments queried", {
    tenantId,
    actionType: options.actionType,
    fromDate: options.fromDate,
    toDate: options.toDate,
    count: assessments.length,
    durationMs: Date.now() - startTime,
  });

  res.status(HTTP_STATUS.OK).json({
    assessments,
    count: assessments.length,
    tenantId,
  });
};

// ==================== Route Definitions ====================

/** GET /api/risk-rules - List custom risk rules for a tenant */
router.get("/api/risk-rules", asyncHandler(handleListRiskRules));

/** GET /api/risk-rules/:ruleId - Get a specific risk rule by ID */
router.get("/api/risk-rules/:ruleId", asyncHandler(handleGetRiskRuleById));

/** POST /api/risk-rules - Create a new custom risk rule */
router.post(
  "/api/risk-rules",
  validate({
    body: {
      name: validateRequiredString,
      actionTypes: validateRequiredArray,
    },
  }),
  asyncHandler(handleCreateRiskRule)
);

/** PATCH /api/risk-rules/:ruleId - Update an existing risk rule */
router.patch("/api/risk-rules/:ruleId", asyncHandler(handleUpdateRiskRule));

/** DELETE /api/risk-rules/:ruleId - Delete a risk rule */
router.delete("/api/risk-rules/:ruleId", asyncHandler(handleDeleteRiskRule));

/** GET /api/risk-assessments - Query risk assessment audit trail */
router.get("/api/risk-assessments", asyncHandler(handleQueryRiskAssessments));

export { router as riskRulesRoutes };
