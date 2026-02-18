/**
 * Slack Dispatch Adapter
 *
 * Implements SlackDispatchPort by posting Block Kit messages to a Slack
 * webhook URL via resilientPost. Contains all Slack HTTP concerns.
 *
 * @module adapters/slackDispatchAdapter
 */

import {
  resilientPost,
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  type RequestContext,
  type ResilientResponse,
} from "@kenchi/shared";
import type { SlackDispatchPort, DispatchResult, DispatchTarget } from "../types/policyTypes.js";
import { DISPATCH_TIMEOUTS } from "../constants/policyRules.js";

// ==================== Types ====================

/**
 * Slack Incoming Webhook response shape.
 */
interface SlackWebhookResponse {
  readonly ok?: boolean;
  readonly error?: string;
}

// ==================== Factory ====================

/**
 * Creates a Slack dispatch adapter.
 *
 * @param webhookUrl - Slack Incoming Webhook URL to post to
 * @returns SlackDispatchPort implementation
 */
export const createSlackDispatchAdapter = (webhookUrl: string): SlackDispatchPort => {
  const adapterLogger = createLogger("slack-dispatch-adapter");

  return {
    postMessage: async (
      channel: string,
      blocks: ReadonlyArray<Record<string, unknown>>,
      text: string,
      context: RequestContext
    ): Promise<DispatchResult> => {
      const startTime = Date.now();
      const target: DispatchTarget = {
        type: "slack",
        channel,
        metadata: {},
      };

      const body = {
        channel,
        text,
        blocks,
      };

      try {
        const response: ResilientResponse<SlackWebhookResponse> =
          await resilientPost<SlackWebhookResponse>(webhookUrl, body, {
            timeout: DISPATCH_TIMEOUTS.SLACK_POST_MS,
            maxRetries: 2,
            headers: { "Content-Type": "application/json" },
          });

        const durationMs = Date.now() - startTime;
        const { status: statusCode } = response;

        adapterLogger.info("Slack message posted", {
          provider: "slack",
          operation: "postIncidentMessage",
          durationMs,
          statusCode,
          channel,
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
        const isRetryable = errorMsg.includes("timeout") || errorMsg.includes("5");

        adapterLogger.error("Slack message failed", {
          provider: "slack",
          operation: "postIncidentMessage",
          durationMs,
          channel,
          category: isRetryable ? "retryable" : "non_retryable",
          retryable: isRetryable,
          ...context,
        });

        throw new ExternalServiceError("slack", `Slack dispatch failed: ${errorMsg}`, {
          retryable: isRetryable,
        });
      }
    },
  };
};
