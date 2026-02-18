/**
 * Policy Engine & Dispatch Types
 *
 * Type definitions for deterministic routing rules, dispatch targets,
 * dispatch results, and the policy engine service interface.
 *
 * @module types/policyTypes
 */

import type { RequestContext } from "@kenchi/shared";
import type { AlertSeverity } from "./incidentTypes.js";

// ==================== Policy Condition ====================

/**
 * Condition that must match for a policy rule to apply.
 * All specified fields must match (AND logic).
 * Null/undefined fields are wildcards (match anything).
 */
export interface PolicyCondition {
  readonly severity?: readonly AlertSeverity[];
  readonly environment?: readonly string[];
  readonly environmentExclude?: readonly string[];
  readonly serviceMatch?: readonly string[];
}

// ==================== Dispatch Target ====================

/**
 * Destination for a dispatch operation.
 */
export type DispatchTargetType = "slack" | "pagerduty";

/**
 * A single dispatch target with its configuration.
 */
export interface DispatchTarget {
  readonly type: DispatchTargetType;
  readonly channel: string;
  readonly metadata: Readonly<Record<string, string>>;
}

// ==================== Policy Rule ====================

/**
 * A single routing rule in the policy engine.
 * Rules are evaluated in priority order (lowest number = highest priority).
 */
export interface PolicyRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly condition: PolicyCondition;
  readonly targets: readonly DispatchTarget[];
  readonly enabled: boolean;
}

// ==================== Suppression Reason ====================

/**
 * Reason an alert was suppressed (not dispatched).
 */
export interface SuppressionReason {
  readonly ruleId: string;
  readonly reason: string;
}

// ==================== Routing Decision ====================

/**
 * The output of the policy engine: which targets to dispatch to and why.
 */
export interface RoutingDecision {
  readonly targets: readonly DispatchTarget[];
  readonly matchedRules: readonly MatchedRule[];
  readonly suppressed: boolean;
  readonly suppressionReasons: readonly SuppressionReason[];
  readonly evaluatedAt: string;
}

/**
 * A rule that matched during policy evaluation, with the reason it matched.
 */
export interface MatchedRule {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly reason: string;
}

// ==================== Dispatch Result ====================

/**
 * Result of dispatching to a single target.
 */
export interface DispatchResult {
  readonly target: DispatchTarget;
  readonly success: boolean;
  readonly statusCode?: number;
  readonly error?: string;
  readonly durationMs: number;
}

/**
 * Aggregated results from dispatching to all targets.
 */
export interface DispatchResults {
  readonly results: readonly DispatchResult[];
  readonly totalTargets: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly durationMs: number;
}

// ==================== Triage Context for Policy ====================

/**
 * The subset of triage data needed by the policy engine.
 * Keeps the policy engine decoupled from the full triage result shape.
 */
export interface TriagePolicyContext {
  readonly alertId: string;
  readonly tenantId: string;
  readonly severityLabel: AlertSeverity;
  readonly severityScore: number;
  readonly environment: string | null;
  readonly serviceName: string | null;
  readonly confidence: number;
  readonly completeness: number;
  readonly headline: string;
  readonly summarySource: "ai" | "fallback";
}

// ==================== Port Interfaces ====================

/**
 * Port for posting Slack messages.
 */
export interface SlackDispatchPort {
  readonly postMessage: (
    channel: string,
    blocks: readonly Record<string, unknown>[],
    text: string,
    context: RequestContext
  ) => Promise<DispatchResult>;
}

/**
 * Port for triggering PagerDuty events.
 */
export interface PagerDutyDispatchPort {
  readonly triggerEvent: (
    routingKey: string,
    payload: Readonly<Record<string, unknown>>,
    context: RequestContext
  ) => Promise<DispatchResult>;
}

// ==================== Dispatch Service Interface ====================

/**
 * Public interface for the dispatch orchestrator.
 */
export interface DispatchService {
  readonly dispatch: (
    decision: RoutingDecision,
    triageContext: TriagePolicyContext,
    blocks: readonly Record<string, unknown>[],
    context: RequestContext
  ) => Promise<DispatchResults>;
}

// ==================== Slack Formatter Types ====================

/**
 * Input to the Slack Block Kit formatter.
 */
export interface SlackFormatterInput {
  readonly alertId: string;
  readonly headline: string;
  readonly rootCauseSummary: string;
  readonly impactAssessment: string;
  readonly severityLabel: AlertSeverity;
  readonly severityScore: number;
  readonly confidence: number;
  readonly completeness: number;
  readonly summarySource: "ai" | "fallback";
  readonly environment: string | null;
  readonly serviceName: string | null;
  readonly matchedRules: readonly MatchedRule[];
}

// ==================== PagerDuty Events API v2 Types ====================

/**
 * PagerDuty Events API v2 severity mapping.
 */
export type PagerDutySeverity = "critical" | "error" | "warning" | "info";

/**
 * PagerDuty Events API v2 trigger payload shape.
 */
export interface PagerDutyEventPayload {
  readonly routing_key: string;
  readonly event_action: "trigger";
  readonly payload: {
    readonly summary: string;
    readonly source: string;
    readonly severity: PagerDutySeverity;
    readonly component?: string;
    readonly group?: string;
    readonly custom_details: Readonly<Record<string, unknown>>;
  };
  readonly dedup_key?: string;
  readonly links?: readonly { readonly href: string; readonly text: string }[];
}
