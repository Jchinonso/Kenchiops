/**
 * PagerDuty Dispatch Adapter
 *
 * Implements PagerDutyDispatchPort by sending events to the PagerDuty
 * Events API v2 via resilientPost. Contains all PagerDuty HTTP concerns.
 *
 * @module adapters/pagerDutyDispatchAdapter
 */

import {
  resilientPost,
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  withCircuitBreaker,
  buildTenantCircuitKey,
  type RequestContext,
  type ResilientResponse,
} from "@kenchi/shared";
import type {
  PagerDutyDispatchPort,
  DispatchResult,
  DispatchTarget,
} from "../types/policyTypes.js";
import { DISPATCH_TIMEOUTS, PAGERDUTY_EVENTS_API_URL } from "../constants/policyRules.js";

// ==================== Types ====================

/**
 * PagerDuty Events API v2 response shape.
 */
interface PagerDutyEventResponse {
  readonly status?: string;
  readonly message?: string;
  readonly dedup_key?: string;
}

// ==================== Factory ====================

/**
 * Creates a PagerDuty dispatch adapter.
 *
 * @returns PagerDutyDispatchPort implementation
 */
export const createPagerDutyDispatchAdapter = (): PagerDutyDispatchPort => {
  const adapterLogger = createLogger("pagerduty-dispatch-adapter");

  return {
    triggerEvent: async (
      routingKey: string,
      payload: Readonly<Record<string, unknown>>,
      context: RequestContext
    ): Promise<DispatchResult> => {
      const startTime = Date.now();
      const target: DispatchTarget = {
        type: "pagerduty",
        channel: routingKey,
        metadata: {},
      };

      try {
        const circuitKey = buildTenantCircuitKey("pagerduty", context.tenantId);
        const response: ResilientResponse<PagerDutyEventResponse> = await withCircuitBreaker(
          circuitKey,
          async () =>
            resilientPost<PagerDutyEventResponse>(PAGERDUTY_EVENTS_API_URL, payload, {
              timeout: DISPATCH_TIMEOUTS.PAGERDUTY_EVENT_MS,
              maxRetries: 2,
              headers: { "Content-Type": "application/json" },
            })
        );

        const durationMs = Date.now() - startTime;
        const { status: statusCode } = response;

        adapterLogger.info("PagerDuty event triggered", {
          provider: "pagerduty",
          operation: "triggerIncidentEvent",
          durationMs,
          statusCode,
          routingKey,
          ...context,
        });

        return {
          target,
          success: true,
          statusCode,
          durationMs,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = getErrorMessage(error);
        const statusCode = (error as { status?: number }).status;
        const isRetryable =
          errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

        adapterLogger.error("PagerDuty event failed", {
          provider: "pagerduty",
          operation: "triggerIncidentEvent",
          durationMs,
          statusCode,
          routingKey,
          category: isRetryable ? "retryable" : "non_retryable",
          retryable: isRetryable,
          ...context,
        });

        throw new ExternalServiceError("pagerduty", `PagerDuty dispatch failed: ${errorMsg}`, {
          retryable: isRetryable,
        });
      }
    },
  };
};
