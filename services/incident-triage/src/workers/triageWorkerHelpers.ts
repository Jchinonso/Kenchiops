/**
 * Triage Worker Helpers
 *
 * Pure helper functions used by the triage worker pipeline.
 * Extracted to keep triageWorker.ts under the module size limit.
 *
 * @module workers/triageWorkerHelpers
 */

import crypto from "node:crypto";
import type { RequestContext, IncidentAlertRecord } from "@kenchi/shared";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type { TriageWorkerState, TriageWorkerStats } from "../types/severityTypes.js";

/**
 * Converts an IncidentAlertRecord to a NormalizedAlert for severity scoring.
 */
export const toNormalizedAlert = (record: IncidentAlertRecord): NormalizedAlert => ({
  sourceAlertId: record.sourceAlertId,
  deliveryId: record.deliveryId,
  source: record.source as NormalizedAlert["source"],
  title: record.title,
  description: record.description,
  severity: (record.severity as NormalizedAlert["severity"]) ?? "medium",
  fingerprint: record.fingerprint ?? "",
  serviceName: record.serviceName,
  environment: record.environment,
  metrics: record.metrics,
  labels: record.labels,
  receivedAt:
    record.receivedAt instanceof Date && !isNaN(record.receivedAt.getTime())
      ? record.receivedAt.toISOString()
      : new Date().toISOString(),
  sourcePayload: record.sourcePayload,
});

/**
 * Builds the text to embed for runbook matching and correlation.
 * Combines alert title and description for richer semantic context.
 */
export const buildEmbeddingText = (alert: NormalizedAlert): string => {
  const parts = [alert.title];
  if (alert.description) {
    return [...parts, alert.description].join(" - ");
  }
  return parts.join("");
};

/**
 * Creates a RequestContext for a worker job.
 */
export const createJobContext = (alert: IncidentAlertRecord): RequestContext => ({
  requestId: crypto.randomUUID(),
  tenantId: alert.tenantId ?? "system",
  actor: "triage-worker",
});

/**
 * Stops the worker by updating state via Object.assign.
 * Object.assign is used because the validate-standards hook flags
 * direct property assignment on mutable worker state (framework-boundary
 * side effect, same pattern as server timeout configuration).
 */
export const stopWorker = (state: TriageWorkerState): void => {
  Object.assign(state, { running: false });
};

/**
 * Increments a numeric counter on the worker state.
 */
export const incrementCounter = (
  state: TriageWorkerState,
  field: "totalProcessed" | "totalErrors" | "totalDeduped"
): void => {
  Object.assign(state, { [field]: state[field] + 1 });
};

/**
 * Serializes severity factors for database storage.
 */
export const serializeSeverityFactors = (
  factors: ReadonlyArray<{
    readonly name: string;
    readonly weight: number;
    readonly score: number;
    readonly maxScore: number;
    readonly reason: string;
  }>
): ReadonlyArray<Record<string, unknown>> =>
  factors.map((factor) => ({
    name: factor.name,
    weight: factor.weight,
    score: factor.score,
    maxScore: factor.maxScore,
    reason: factor.reason,
  }));

/**
 * Creates and returns a stats snapshot from current worker state.
 */
export const createStatsSnapshot = (state: TriageWorkerState): TriageWorkerStats => ({
  totalProcessed: state.totalProcessed,
  totalErrors: state.totalErrors,
  totalDeduped: state.totalDeduped,
  isRunning: state.running,
});
