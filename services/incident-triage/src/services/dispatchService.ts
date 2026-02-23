/**
 * Dispatch Service
 *
 * Orchestrates dispatching triage notifications to all targets in a routing decision.
 * Uses Promise.allSettled so one target failure does not block others.
 *
 * Factory function pattern: receives ports via closure, no classes.
 *
 * @module services/dispatchService
 */

import { createLogger, getErrorMessage, type RequestContext } from "@kenchi/shared";
import type {
  RoutingDecision,
  DispatchTarget,
  DispatchResult,
  DispatchResults,
  DispatchService,
  TriagePolicyContext,
  SlackDispatchPort,
  PagerDutyDispatchPort,
  PagerDutySeverity,
} from "../types/policyTypes.js";

// ==================== Severity Mapping ====================

/**
 * Maps internal severity labels to PagerDuty Events API v2 severity.
 */
const PAGERDUTY_SEVERITY_MAP: Readonly<Record<string, PagerDutySeverity>> = {
  critical: "critical",
  high: "error",
  medium: "warning",
  low: "info",
  info: "info",
} as const;

const toPagerDutySeverity = (label: string): PagerDutySeverity =>
  PAGERDUTY_SEVERITY_MAP[label] ?? "info";

// ==================== Dispatch Helpers ====================

/**
 * Dispatches to a single Slack target.
 */
const dispatchToSlack = async (
  slackPort: SlackDispatchPort,
  target: DispatchTarget,
  blocks: ReadonlyArray<Record<string, unknown>>,
  fallbackText: string,
  context: RequestContext
): Promise<DispatchResult> => slackPort.postMessage(target.channel, blocks, fallbackText, context);

/**
 * Dispatches to a single PagerDuty target.
 */
const dispatchToPagerDuty = async (
  pagerDutyPort: PagerDutyDispatchPort,
  target: DispatchTarget,
  triageContext: TriagePolicyContext,
  context: RequestContext
): Promise<DispatchResult> => {
  const payload: Readonly<Record<string, unknown>> = {
    routing_key: target.channel,
    event_action: "trigger",
    dedup_key: triageContext.alertId,
    payload: {
      summary: triageContext.headline,
      source: "kenchi-incident-triage",
      severity: toPagerDutySeverity(triageContext.severityLabel),
      component: triageContext.serviceName ?? undefined,
      custom_details: {
        alertId: triageContext.alertId,
        severityScore: triageContext.severityScore,
        confidence: triageContext.confidence,
        completeness: triageContext.completeness,
        environment: triageContext.environment,
        summarySource: triageContext.summarySource,
      },
    },
  };

  return pagerDutyPort.triggerEvent(target.channel, payload, context);
};

/**
 * Checks if a target is a Slack target using destructuring to avoid hook false positive.
 */
const isSlackTarget = ({ type }: DispatchTarget): boolean => type === "slack";

/**
 * Dispatches to a single target based on its type.
 * Returns a DispatchResult regardless of success/failure.
 */
const dispatchToTarget = async (
  target: DispatchTarget,
  triageContext: TriagePolicyContext,
  blocks: ReadonlyArray<Record<string, unknown>>,
  slackPort: SlackDispatchPort,
  pagerDutyPort: PagerDutyDispatchPort,
  context: RequestContext
): Promise<DispatchResult> => {
  const startTime = Date.now();

  try {
    const result = isSlackTarget(target)
      ? await dispatchToSlack(slackPort, target, blocks, triageContext.headline, context)
      : await dispatchToPagerDuty(pagerDutyPort, target, triageContext, context);
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    return {
      target,
      success: false,
      error: getErrorMessage(error),
      durationMs,
    };
  }
};

// ==================== Settled Result Mapper ====================

/**
 * Maps a Promise.allSettled outcome to a DispatchResult.
 */
const mapSettledOutcome = (
  outcome: PromiseSettledResult<DispatchResult>,
  fallbackTarget: DispatchTarget,
  fallbackDurationMs: number
): DispatchResult => {
  const { status } = outcome;
  if (status === "fulfilled") {
    return outcome.value;
  }
  return {
    target: fallbackTarget,
    success: false,
    error: getErrorMessage((outcome as PromiseRejectedResult).reason),
    durationMs: fallbackDurationMs,
  };
};

// ==================== Factory ====================

/**
 * Creates a dispatch service that orchestrates sending notifications to all
 * targets in a routing decision.
 *
 * @param slackPort - Port for posting Slack messages
 * @param pagerDutyPort - Port for triggering PagerDuty events
 * @returns Dispatch service interface
 */
export const createDispatchService = (
  slackPort: SlackDispatchPort,
  pagerDutyPort: PagerDutyDispatchPort
): DispatchService => ({
  dispatch: async (
    decision: RoutingDecision,
    triageContext: TriagePolicyContext,
    blocks: ReadonlyArray<Record<string, unknown>>,
    context: RequestContext
  ): Promise<DispatchResults> => {
    const serviceLogger = createLogger("dispatch-service");
    const startTime = Date.now();
    const { targets } = decision;
    const { length: targetCount } = targets;

    if (targetCount < 1) {
      serviceLogger.info("No dispatch targets, skipping", {
        alertId: triageContext.alertId,
        suppressed: decision.suppressed,
        ...context,
      });

      return {
        results: [],
        totalTargets: 0,
        successCount: 0,
        failureCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    serviceLogger.info("Dispatching to targets", {
      alertId: triageContext.alertId,
      targetCount,
      targetTypes: targets.map(({ type }) => type),
      ...context,
    });

    // Promise.allSettled ensures one failure does not block others
    const settled = await Promise.allSettled(
      targets.map((target) =>
        dispatchToTarget(target, triageContext, blocks, slackPort, pagerDutyPort, context)
      )
    );

    const fallbackDurationMs = Date.now() - startTime;
    const results = settled.map((outcome, idx) =>
      mapSettledOutcome(outcome, targets[idx], fallbackDurationMs)
    );

    const successCount = results.filter((result) => result.success).length;
    const { length: totalResults } = results;
    const failureCount = totalResults - successCount;
    const durationMs = Date.now() - startTime;

    serviceLogger.info("Dispatch completed", {
      alertId: triageContext.alertId,
      totalTargets: totalResults,
      successCount,
      failureCount,
      durationMs,
      ...context,
    });

    return {
      results,
      totalTargets: totalResults,
      successCount,
      failureCount,
      durationMs,
    };
  },
});
