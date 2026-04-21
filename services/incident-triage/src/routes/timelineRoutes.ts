/**
 * Timeline Routes
 *
 * Unified chronological feed combining incidents, CI events, and analyses.
 *
 * - GET /api/v1/timeline — Paginated timeline entries ordered by timestamp DESC
 *
 * @module routes/timelineRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  requireTenantId,
  rateLimitByCategory,
  listIncidents,
  getEventsByTenantFiltered,
  countEventsByTenantFiltered,
  getAnalysesByTenantFiltered,
  countAnalysesByTenantFiltered,
  type IncidentAlertRecord,
  type EventRecord,
  type AnalysisRecord,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("timeline-routes");

// ==================== Types ====================

interface TimelineEntry {
  readonly id: string;
  readonly type: "incident" | "ci_failure" | "analysis";
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly source: string;
  readonly status: string;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface TimelineResponse {
  readonly items: readonly TimelineEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Constants ====================

const TIMELINE_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_LIMIT: 200,
  MIN_LIMIT: 1,
} as const;

const TIME_RANGE_HOURS: Readonly<Record<string, number>> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

// ==================== Mappers ====================

const mapIncidentToEntry = (incident: IncidentAlertRecord): TimelineEntry => ({
  id: incident.id,
  type: "incident",
  title: incident.title,
  description: incident.description,
  severity: incident.severity,
  source: incident.source,
  status: incident.status,
  timestamp: new Date(incident.receivedAt).toISOString(),
  metadata: {
    serviceName: incident.serviceName,
    environment: incident.environment,
  },
});

const mapEventToEntry = (event: EventRecord): TimelineEntry => ({
  id: event.id,
  type: "ci_failure",
  title: `CI Event: ${event.type} from ${event.source}`,
  description: null,
  severity: event.severity ?? "info",
  source: event.source,
  status: "recorded",
  timestamp: new Date(event.timestamp).toISOString(),
  metadata: {
    eventType: event.type,
  },
});

const mapAnalysisToEntry = (analysis: AnalysisRecord): TimelineEntry => ({
  id: analysis.id,
  type: "analysis",
  title: analysis.summary,
  description: analysis.identifiedCause,
  severity: analysis.diagnosisConfidence >= 0.7 ? "info" : "warning",
  source: analysis.ciProvider ?? "unknown",
  status: "completed",
  timestamp: new Date(analysis.createdAt).toISOString(),
  metadata: {
    confidence: analysis.diagnosisConfidence,
    eventId: analysis.eventId,
    aggregationKey: analysis.aggregationKey,
  },
});

// ==================== Helpers ====================

const clampLimit = (value: number): number =>
  Math.max(TIMELINE_DEFAULTS.MIN_LIMIT, Math.min(value, TIMELINE_DEFAULTS.MAX_LIMIT));

const parseIntParam = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

const computeSinceDate = (timeRange: string | undefined): string | undefined => {
  if (!timeRange || timeRange === "all") {
    return undefined;
  }
  const hours = TIME_RANGE_HOURS[timeRange];
  if (!hours) {
    return undefined;
  }
  return new Date(Date.now() - hours * 3600000).toISOString();
};

/**
 * Sort timeline entries by timestamp descending.
 * Returns a new array (no mutation).
 */
const sortByTimestampDesc = (entries: readonly TimelineEntry[]): readonly TimelineEntry[] =>
  [...entries].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );

// ==================== Handlers ====================

/**
 * GET /api/v1/timeline
 * Unified chronological feed of incidents, CI events, and analyses.
 */
const handleGetTimeline = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);

  const limit = clampLimit(
    parseIntParam(req.query.limit as string | undefined, TIMELINE_DEFAULTS.QUERY_LIMIT)
  );
  const offset = parseIntParam(req.query.offset as string | undefined, 0);
  const timeRange = (req.query.timeRange as string | undefined) ?? "all";
  const sourceFilter = (req.query.source as string | undefined)?.trim() || null;
  const since = computeSinceDate(timeRange);

  // Fetch from all three data sources in parallel.
  // Each source fetches `limit` items at offset 0 so we have enough to merge and paginate.
  const [incidentResult, events, eventCount, analyses, analysisCount] = await Promise.all([
    listIncidents({
      tenantId,
      source: sourceFilter,
      limit,
      offset: 0,
      status: null,
      severity: null,
    }),
    getEventsByTenantFiltered({
      tenantId,
      limit,
      offset: 0,
      repository: null,
      severity: null,
      since,
      source: sourceFilter ?? undefined,
    }),
    countEventsByTenantFiltered({
      tenantId,
      type: "",
      repository: null,
      severity: null,
      since,
      source: sourceFilter ?? undefined,
    }),
    getAnalysesByTenantFiltered({
      tenantId,
      repository: null,
      minConfidence: null,
      maxConfidence: null,
      limit,
      offset: 0,
      since,
      source: sourceFilter ?? undefined,
    }),
    countAnalysesByTenantFiltered({
      tenantId,
      repository: null,
      minConfidence: null,
      maxConfidence: null,
      since,
      source: sourceFilter ?? undefined,
    }),
  ]);

  // Map each source to timeline entries
  const incidentEntries = incidentResult.items.map(mapIncidentToEntry);
  const eventEntries = events.map(mapEventToEntry);
  const analysisEntries = analyses.map(mapAnalysisToEntry);

  // Merge, sort, and paginate
  const allEntries = sortByTimestampDesc([...incidentEntries, ...eventEntries, ...analysisEntries]);

  const paginatedItems = allEntries.slice(offset, offset + limit);
  const total = incidentResult.total + eventCount + analysisCount;

  const response: TimelineResponse = {
    items: paginatedItems,
    total,
    limit,
    offset,
  };

  logger.info("Timeline fetched", {
    tenantId,
    timeRange,
    resultCount: paginatedItems.length,
    total,
  });

  res.status(HTTP_STATUS.OK).json({ data: response });
};

// ==================== Route Registration ====================

router.get("/api/v1/timeline", rateLimitByCategory("readonly"), asyncHandler(handleGetTimeline));

export { router as timelineRoutes };
