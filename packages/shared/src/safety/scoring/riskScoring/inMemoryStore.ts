/**
 * In-Memory Risk Rules Store
 *
 * In-memory implementation of RiskRulesStore for development/testing.
 * Use database store in production.
 *
 * @module safety/scoring/riskScoring/inMemoryStore
 */

import crypto from "crypto";
import {
  RISK_RULE_DEFAULTS,
  type RiskRulesStore,
  type CustomRiskRule,
  type RiskAssessmentRecord,
  type CreateCustomRiskRuleInput,
  type UpdateCustomRiskRuleInput,
  type CreateRiskAssessmentInput,
  type RiskRulesQueryOptions,
  type RiskAssessmentsQueryOptions,
} from "../../../database/riskRules/types.js";
import { ValidationError, NotFoundError } from "../../../core/errors.js";
import { validateCreateRuleInput, validateAssessmentInput } from "./storeValidation.js";

// ==================== Constants ====================

/** Maximum rules per tenant in in-memory store */
const MAX_RULES_PER_TENANT = 1000;

/** Maximum assessments in in-memory store */
const MAX_ASSESSMENTS = 10000;

// ==================== ID Generation ====================

/**
 * Generates a prefixed ID for rules.
 */
const generateRuleId = (): string => `rule_${crypto.randomUUID()}`;

/**
 * Generates a prefixed ID for assessments.
 */
const generateAssessmentId = (): string => `assess_${crypto.randomUUID()}`;

// ==================== In-Memory Store ====================

/**
 * In-memory implementation of RiskRulesStore.
 * For development/testing. Use database store in production.
 */
export class InMemoryRiskRulesStore implements RiskRulesStore {
  private rules: Map<string, CustomRiskRule> = new Map();
  private assessments: RiskAssessmentRecord[] = [];

  async getCustomRules(options: RiskRulesQueryOptions): Promise<readonly CustomRiskRule[]> {
    const {
      tenantId,
      actionType,
      environment,
      enabledOnly = true,
      limit = RISK_RULE_DEFAULTS.QUERY_LIMIT,
      offset = 0,
    } = options;

    const normalizedAction = actionType?.toLowerCase();

    const filtered = [
      ...Array.from(this.rules.values())
        .filter((rule) => rule.tenantId === tenantId)
        .filter((rule) => !enabledOnly || rule.enabled)
        .filter(
          (rule) =>
            !normalizedAction ||
            rule.actionTypes.some((ruleAction) => ruleAction.toLowerCase() === normalizedAction)
        )
        .filter(
          (rule) =>
            environment === undefined ||
            rule.environment === null ||
            rule.environment === environment
        ),
    ].sort((ruleA, ruleB) => {
      if (ruleA.priority !== ruleB.priority) {
        return ruleA.priority - ruleB.priority;
      }
      return ruleB.createdAt.getTime() - ruleA.createdAt.getTime();
    });

    // Apply pagination
    const clampedLimit = Math.min(Math.max(1, limit), RISK_RULE_DEFAULTS.MAX_QUERY_LIMIT);
    const clampedOffset = Math.max(0, offset);

    return Object.freeze(filtered.slice(clampedOffset, clampedOffset + clampedLimit));
  }

  async getRuleById(ruleId: string, tenantId: string): Promise<CustomRiskRule | null> {
    const rule = this.rules.get(ruleId);
    if (!rule || rule.tenantId !== tenantId) {
      return null;
    }
    return rule;
  }

  async addRule(input: CreateCustomRiskRuleInput): Promise<CustomRiskRule> {
    validateCreateRuleInput(input);

    // Check tenant rule limit
    const tenantRuleCount = Array.from(this.rules.values()).filter(
      (existingRule) => existingRule.tenantId === input.tenantId
    ).length;

    if (tenantRuleCount >= MAX_RULES_PER_TENANT) {
      throw new ValidationError(`Maximum rules per tenant (${MAX_RULES_PER_TENANT}) exceeded`, {
        operation: "addRule",
        metadata: { tenantId: input.tenantId },
      });
    }

    const now = new Date();
    const rule: CustomRiskRule = Object.freeze({
      id: generateRuleId(),
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      actionTypes: Object.freeze([...input.actionTypes]),
      environment: input.environment ?? null,
      blastRadius: input.blastRadius ?? null,
      reversibility: input.reversibility ?? null,
      dataImpact: input.dataImpact ?? null,
      scoreModifier: input.scoreModifier ?? RISK_RULE_DEFAULTS.SCORE_MODIFIER,
      productionMultiplier: input.productionMultiplier ?? RISK_RULE_DEFAULTS.PRODUCTION_MULTIPLIER,
      incidentModeMultiplier:
        input.incidentModeMultiplier ?? RISK_RULE_DEFAULTS.INCIDENT_MODE_MULTIPLIER,
      offHoursMultiplier: input.offHoursMultiplier ?? RISK_RULE_DEFAULTS.OFF_HOURS_MULTIPLIER,
      requireApprovalThreshold: input.requireApprovalThreshold ?? null,
      blockThreshold: input.blockThreshold ?? null,
      enabled: input.enabled ?? RISK_RULE_DEFAULTS.ENABLED,
      priority: input.priority ?? RISK_RULE_DEFAULTS.PRIORITY,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.rules.set(rule.id, rule);
    return rule;
  }

  async updateRule(
    ruleId: string,
    tenantId: string,
    input: UpdateCustomRiskRuleInput
  ): Promise<CustomRiskRule> {
    const existing = this.rules.get(ruleId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("Custom risk rule not found", {
        metadata: { ruleId, tenantId },
      });
    }

    // Validate update input
    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError("Rule name cannot be empty", {
        operation: "updateRule",
        metadata: { field: "name" },
      });
    }

    if (input.actionTypes !== undefined && input.actionTypes.length === 0) {
      throw new ValidationError("At least one action type is required", {
        operation: "updateRule",
        metadata: { field: "actionTypes" },
      });
    }

    const updated: CustomRiskRule = Object.freeze({
      ...existing,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      actionTypes:
        input.actionTypes !== undefined
          ? Object.freeze([...input.actionTypes])
          : existing.actionTypes,
      environment: input.environment !== undefined ? input.environment : existing.environment,
      blastRadius: input.blastRadius !== undefined ? input.blastRadius : existing.blastRadius,
      reversibility:
        input.reversibility !== undefined ? input.reversibility : existing.reversibility,
      dataImpact: input.dataImpact !== undefined ? input.dataImpact : existing.dataImpact,
      scoreModifier: input.scoreModifier ?? existing.scoreModifier,
      productionMultiplier: input.productionMultiplier ?? existing.productionMultiplier,
      incidentModeMultiplier: input.incidentModeMultiplier ?? existing.incidentModeMultiplier,
      offHoursMultiplier: input.offHoursMultiplier ?? existing.offHoursMultiplier,
      requireApprovalThreshold:
        input.requireApprovalThreshold !== undefined
          ? input.requireApprovalThreshold
          : existing.requireApprovalThreshold,
      blockThreshold:
        input.blockThreshold !== undefined ? input.blockThreshold : existing.blockThreshold,
      enabled: input.enabled ?? existing.enabled,
      priority: input.priority ?? existing.priority,
      updatedAt: new Date(),
    });

    this.rules.set(ruleId, updated);
    return updated;
  }

  async deleteRule(ruleId: string, tenantId: string): Promise<boolean> {
    const existing = this.rules.get(ruleId);
    if (!existing || existing.tenantId !== tenantId) {
      return false;
    }

    this.rules.delete(ruleId);
    return true;
  }

  async recordAssessment(input: CreateRiskAssessmentInput): Promise<RiskAssessmentRecord> {
    validateAssessmentInput(input);

    const assessment: RiskAssessmentRecord = Object.freeze({
      id: generateAssessmentId(),
      tenantId: input.tenantId,
      actionProposalId: input.actionProposalId ?? null,
      actionType: input.actionType,
      blastRadius: input.blastRadius,
      reversibility: input.reversibility,
      dataImpact: input.dataImpact,
      baseScore: input.baseScore,
      contextAdjustment: input.contextAdjustment,
      finalScore: input.finalScore,
      riskLevel: input.riskLevel,
      environment: input.environment ?? null,
      incidentModeActive: input.incidentModeActive,
      isOffHours: input.isOffHours,
      matchedRuleId: input.matchedRuleId ?? null,
      matchedRuleCategory: input.matchedRuleCategory,
      summary: input.summary,
      requestId: input.requestId ?? null,
      assessedAt: new Date(),
    });

    this.assessments.push(assessment);

    // Trim old assessments if over limit
    if (this.assessments.length > MAX_ASSESSMENTS) {
      this.assessments = this.assessments.slice(-MAX_ASSESSMENTS);
    }

    return assessment;
  }

  async queryAssessments(
    options: RiskAssessmentsQueryOptions
  ): Promise<readonly RiskAssessmentRecord[]> {
    const {
      tenantId,
      actionProposalId,
      actionType,
      fromDate,
      toDate,
      limit = RISK_RULE_DEFAULTS.QUERY_LIMIT,
      offset = 0,
    } = options;

    const filtered = [
      ...this.assessments
        .filter((assessment) => assessment.tenantId === tenantId)
        .filter(
          (assessment) => !actionProposalId || assessment.actionProposalId === actionProposalId
        )
        .filter((assessment) => !actionType || assessment.actionType === actionType)
        .filter((assessment) => !fromDate || assessment.assessedAt >= fromDate)
        .filter((assessment) => !toDate || assessment.assessedAt <= toDate),
    ].sort(
      (assessmentA, assessmentB) =>
        assessmentB.assessedAt.getTime() - assessmentA.assessedAt.getTime()
    );

    // Apply pagination
    const clampedLimit = Math.min(Math.max(1, limit), RISK_RULE_DEFAULTS.MAX_QUERY_LIMIT);
    const clampedOffset = Math.max(0, offset);

    return Object.freeze(filtered.slice(clampedOffset, clampedOffset + clampedLimit));
  }

  /**
   * Clears all rules and assessments (for testing).
   */
  clear(): void {
    this.rules.clear();
    this.assessments = [];
  }

  /**
   * Gets all rules (for testing).
   */
  getAllRules(): readonly CustomRiskRule[] {
    return Object.freeze(Array.from(this.rules.values()));
  }

  /**
   * Gets all assessments (for testing).
   */
  getAllAssessments(): readonly RiskAssessmentRecord[] {
    return Object.freeze([...this.assessments]);
  }
}
