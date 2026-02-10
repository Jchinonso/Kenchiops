/**
 * Risk Rules Store
 *
 * Pluggable store management for custom risk rules and assessments.
 * Follows the AuditStore pattern from safety/audit/audit.ts.
 *
 * @module safety/scoring/riskScoring/store
 */

import type {
  RiskRulesStore,
  CustomRiskRule,
  RiskAssessmentRecord,
} from "../../../database/riskRules/types.js";
import { InMemoryRiskRulesStore } from "./inMemoryStore.js";

// ==================== State Management ====================

/**
 * Active risk rules store instance.
 */
let riskRulesStore: RiskRulesStore = new InMemoryRiskRulesStore();

/**
 * Sets the risk rules store implementation.
 * Use for production backends (database, etc.)
 *
 * @param store - Store implementation
 */
export const setRiskRulesStore = (store: RiskRulesStore): void => {
  riskRulesStore = store;
};

/**
 * Gets the current risk rules store.
 *
 * @returns Current store instance
 */
export const getRiskRulesStore = (): RiskRulesStore => riskRulesStore;

/**
 * Resets to in-memory store (for testing).
 */
export const resetRiskRulesStore = (): void => {
  riskRulesStore = new InMemoryRiskRulesStore();
};

/**
 * Creates an in-memory risk rules store instance.
 *
 * @returns New in-memory store with testing methods
 */
export const createInMemoryRiskRulesStore = (): RiskRulesStore & {
  clear(): void;
  getAllRules(): readonly CustomRiskRule[];
  getAllAssessments(): readonly RiskAssessmentRecord[];
} => new InMemoryRiskRulesStore();

// Re-export types for consumers
export type {
  RiskRulesStore,
  CustomRiskRule,
  RiskAssessmentRecord,
  CreateCustomRiskRuleInput,
  UpdateCustomRiskRuleInput,
  CreateRiskAssessmentInput,
  RiskRulesQueryOptions,
  RiskAssessmentsQueryOptions,
  RiskEnvironment,
} from "../../../database/riskRules/types.js";

// Re-export the in-memory store class
export { InMemoryRiskRulesStore } from "./inMemoryStore.js";
