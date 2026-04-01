/**
 * Monitoring Port Adapter
 *
 * Orchestrates all configured monitoring adapters in parallel.
 * The investigation service calls a single `gatherMetrics()` method;
 * this port fans out to Datadog, Grafana, and Vercel adapters internally.
 *
 * @module investigation/monitoringPort
 */

import { createLogger } from "../core/logger.js";
import { mapWithConcurrency } from "../core/concurrency.js";
import type { RequestContext } from "../core/types.js";
import type { InvestigationEvidenceItem } from "./types.js";
import type { MonitoringPort, MonitoringAdapter, MonitoringQuery } from "./monitoringTypes.js";
import { MONITORING_DEFAULTS } from "./monitoringConstants.js";

// ==================== Factory ====================

/**
 * Creates a monitoring port that fans out to all configured adapters.
 *
 * @param adapters - All available monitoring adapters (configured or not)
 * @returns MonitoringPort that gathers evidence from all active adapters
 */
export const createMonitoringPort = (adapters: readonly MonitoringAdapter[]): MonitoringPort => ({
  gatherMetrics: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const portLogger = createLogger("monitoring-port");
    const startTime = Date.now();

    // Filter to only adapters with valid configuration
    const activeAdapters = adapters.filter((adapter) => adapter.isConfigured());

    if (activeAdapters.length === 0) {
      portLogger.info("No monitoring adapters configured, skipping", { ...context });
      return [];
    }

    portLogger.info("Gathering monitoring evidence", {
      activeAdapterCount: activeAdapters.length,
      adapterNames: activeAdapters.map((adapter) => adapter.name),
      ...context,
    });

    // Fan out to all active adapters with bounded concurrency
    // Each adapter handles its own errors internally and returns [] on failure
    const results = await mapWithConcurrency(
      activeAdapters,
      (adapter) => adapter.fetchEvidence(query, context),
      MONITORING_DEFAULTS.ADAPTER_CONCURRENCY
    );

    const allEvidence = results.flat();
    const durationMs = Date.now() - startTime;

    portLogger.info("Monitoring evidence gathered", {
      durationMs,
      activeAdapterCount: activeAdapters.length,
      totalEvidence: allEvidence.length,
      ...context,
    });

    return allEvidence;
  },
});
