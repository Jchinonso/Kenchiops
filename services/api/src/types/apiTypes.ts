/**
 * API Service Type Definitions
 *
 * Types specific to the API service
 */

import type { Event, Evidence, LLMAnalysisResult, HealthStatus } from "@kenchi/shared";

/**
 * CI failure analysis request payload
 */
export interface AnalyzeRequest {
  readonly failure_log: string;
  readonly repository: string;
  readonly commit?: string;
}

/**
 * CI failure analysis response
 */
export interface AnalyzeResponse {
  readonly analysis: string;
  readonly identified_cause: string | undefined;
  readonly confidence: number;
  readonly recommended_actions: LLMAnalysisResult["recommendedActions"];
  readonly full_analysis: LLMAnalysisResult;
  readonly repository: string;
}

/**
 * Webhook payload (generic)
 */
export interface WebhookPayload {
  readonly [key: string]: unknown;
}

/**
 * Analysis context created from request
 */
export interface AnalysisContext {
  readonly event: Event;
  readonly evidence: Evidence;
}

/**
 * Health check response
 */
export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: string;
  readonly timestamp: string;
  readonly uptime: number;
  readonly environment: string;
}
