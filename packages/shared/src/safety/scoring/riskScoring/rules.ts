/**
 * Risk assessment rules by action type category.
 *
 * @module safety/scoring/riskScoring/rules
 */

import type { BlastRadius, Reversibility, DataImpact } from "../../types.js";
import type { CategorizedRule, RuleMatchResult } from "./types.js";
import { DEFAULT_ACTION_RISK } from "../../../constants/safety.js";

// ==================== Risk Rules ====================

/**
 * Risk assessment rules by action type category.
 * Order: most specific/highest risk first for clarity.
 */
const RISK_RULES: readonly CategorizedRule[] = [
  // Infrastructure actions - critical risk
  {
    category: "infrastructure",
    actionTypes: new Set([
      "modify_infrastructure",
      "update_dns",
      "modify_network",
      "delete_resource",
    ]),
    blastRadius: "infrastructure",
    reversibility: "manual_only",
    dataImpact: "destructive",
  },
  // Database actions - very high risk
  {
    category: "database",
    actionTypes: new Set(["run_migration", "modify_database", "truncate_table"]),
    blastRadius: "multiple_services",
    reversibility: "manual_only",
    dataImpact: "destructive",
  },
  // Deployment actions - high risk
  {
    category: "deployment",
    actionTypes: new Set(["deploy", "rollback_deployment", "scale_service"]),
    blastRadius: "multiple_services",
    reversibility: "minutes",
    dataImpact: "write",
  },
  // Configuration changes - moderate to high risk
  {
    category: "configuration",
    actionTypes: new Set([
      "add_environment_variable",
      "update_config",
      "modify_secrets",
      "update_permissions",
    ]),
    blastRadius: "single_service",
    reversibility: "minutes",
    dataImpact: "write",
  },
  // Service restart/reload - moderate risk
  {
    category: "service_restart",
    actionTypes: new Set(["restart_service", "reload_config", "clear_cache"]),
    blastRadius: "single_service",
    reversibility: "minutes",
    dataImpact: "none",
  },
  // Read-only investigation actions
  {
    category: "investigation",
    actionTypes: new Set(["view_logs", "check_status", "run_diagnostics", "fetch_metrics"]),
    blastRadius: "single_service",
    reversibility: "instant",
    dataImpact: "read_only",
  },
  // Notification actions - very low risk
  {
    category: "notification",
    actionTypes: new Set(["notify_team", "send_alert", "create_ticket", "post_message"]),
    blastRadius: "single_service",
    reversibility: "instant",
    dataImpact: "none",
  },
];

// ==================== Rule Matching ====================

/**
 * Finds the matching risk rule for an action type.
 * Normalizes to lowercase for consistent matching.
 *
 * @param actionType - The action type to look up
 * @returns Rule match result with category
 */
export const findRiskRule = (actionType: string): RuleMatchResult => {
  const normalized = actionType.toLowerCase();

  for (const rule of RISK_RULES) {
    if (rule.actionTypes.has(normalized)) {
      return {
        blastRadius: rule.blastRadius,
        reversibility: rule.reversibility,
        dataImpact: rule.dataImpact,
        category: rule.category,
      };
    }
  }

  // Default rule
  return {
    blastRadius: DEFAULT_ACTION_RISK.blastRadius as BlastRadius,
    reversibility: DEFAULT_ACTION_RISK.reversibility as Reversibility,
    dataImpact: DEFAULT_ACTION_RISK.dataImpact as DataImpact,
    category: "default",
  };
};
