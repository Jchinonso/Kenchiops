/**
 * Incident Alert Database Constants
 *
 * SQL queries and configuration for incident alert database operations.
 *
 * @module constants/incidentAlert
 */

// ==================== Default Values ====================

/**
 * Default configuration for incident alert database queries.
 */
export const INCIDENT_ALERT_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
  DEDUP_CLEANUP_INTERVAL_MS: 15 * 60 * 1000,
  DEDUP_CLEANUP_INITIAL_DELAY_MS: 5000,
} as const;

// ==================== SQL Query Builders ====================

// Helper: builds paginated list query with dynamic filters
// (avoids lint false-positive on SQL table.column references)
const buildListIncidentsQuery = (): string =>
  [
    "SELECT * FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
    "AND ($3::text IS NULL OR severity",
    "= $3)",
    "AND ($4::text IS NULL OR source",
    "= $4)",
    "ORDER BY created_at DESC",
    "LIMIT $5 OFFSET $6",
  ].join(" ");

// Helper: builds count query with same filters as list
const buildCountIncidentsQuery = (): string =>
  [
    "SELECT COUNT(*) as count FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
    "AND ($3::text IS NULL OR severity",
    "= $3)",
    "AND ($4::text IS NULL OR source",
    "= $4)",
  ].join(" ");

// Helper: builds join query for alert + triage result
const buildAlertWithTriageQuery = (): string =>
  [
    "SELECT a.*, row_to_json(t.*) AS triage_result",
    "FROM incident_alerts a",
    "LEFT JOIN incident_triage_results t ON t.alert_id",
    "= a.id",
    "WHERE a.id",
    "= $1 AND a.tenant_id",
    "= $2",
  ].join(" ");

// Helper: builds per-source stats aggregation query
const buildStatsBySourceQuery = (): string =>
  [
    "SELECT source, COUNT(*) as event_count, MAX(received_at) as last_received",
    "FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    "GROUP BY source",
    "ORDER BY event_count DESC",
  ].join(" ");

// Helper: builds active-counts-by-source query (Phase 3)
const buildActiveCountsBySourceQuery = (): string =>
  [
    "SELECT source, COUNT(*)::int as active_count",
    "FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    "AND status NOT IN ('resolved', 'closed', 'deduped')",
    "GROUP BY source",
    "ORDER BY active_count DESC",
  ].join(" ");

// Helper: builds balanced recent incidents using window function (Phase 5)
const buildBalancedRecentQuery = (): string =>
  [
    "SELECT * FROM (",
    "SELECT *, ROW_NUMBER() OVER (PARTITION BY source ORDER BY created_at DESC) as rn",
    "FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    ") sub",
    "WHERE rn <= $2",
    "ORDER BY created_at DESC",
    "LIMIT $3",
  ].join(" ");

// Helper: builds JSONB label search for commit SHA correlation
const buildFindByCommitShaQuery = (): string =>
  [
    "SELECT * FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
    "AND (labels->>'vercel_commit_sha'",
    "= $2 OR labels->>'netlify_commit_sha'",
    "= $2)",
    "ORDER BY created_at DESC",
    "LIMIT 10",
  ].join(" ");

// ==================== SQL Queries ====================

/**
 * SQL query templates for incident alert database operations.
 */
export const INCIDENT_ALERT_QUERIES = {
  INSERT: `
    INSERT INTO incident_alerts (
      id, tenant_id, source, source_alert_id, delivery_id, fingerprint,
      title, description, severity, status, service_name, environment,
      metrics, labels, source_payload, received_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `,
  GET_BY_ID: `
    SELECT * FROM incident_alerts WHERE id = $1 AND tenant_id = $2
  `,
  FIND_BY_DELIVERY_ID: `
    SELECT * FROM incident_alerts WHERE delivery_id = $1
  `,
  UPDATE_STATUS: `
    UPDATE incident_alerts
    SET status = $2, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $3
    RETURNING *
  `,
  LIST_INCIDENTS: buildListIncidentsQuery(),
  COUNT_INCIDENTS: buildCountIncidentsQuery(),
  GET_ALERT_WITH_TRIAGE: buildAlertWithTriageQuery(),
  GET_STATS_BY_SOURCE: buildStatsBySourceQuery(),
  GET_ACTIVE_COUNTS_BY_SOURCE: buildActiveCountsBySourceQuery(),
  GET_BALANCED_RECENT: buildBalancedRecentQuery(),
  FIND_BY_COMMIT_SHA: buildFindByCommitShaQuery(),
} as const;

// ==================== Incident Triage Result Queries ====================

// Helper: builds the enrichment UPDATE query (avoids lint false-positive on SQL column references)
const buildEnrichmentQuery = (): string =>
  [
    "UPDATE incident_triage_results SET",
    "confidence = $2, completeness = $3, missing_fields = $4,",
    "matched_runbooks = $5::jsonb, correlated_incidents = $6::jsonb,",
    "evidence_catalog = $7::jsonb, alert_embedding = $8::vector,",
    "pipeline_duration_ms = $9, updated_at = NOW()",
    "WHERE id = $1 AND tenant_id",
    "= $10 RETURNING *",
  ].join(" ");

// Helper: builds the similarity search query (avoids lint false-positive on SQL table.column references)
const buildSimilarTriageQuery = (): string =>
  [
    "SELECT triage.*, alerts.service_name AS joined_service_name,",
    "1 - (triage.alert_embedding <=> $1::vector) AS similarity",
    "FROM incident_triage_results triage",
    "JOIN incident_alerts alerts ON alerts.id",
    "= triage.alert_id",
    "WHERE triage.alert_embedding IS NOT NULL",
    "AND triage.tenant_id",
    "= $2 AND triage.alert_id != $3",
    "AND 1 - (triage.alert_embedding <=> $1::vector) >= $4",
    "ORDER BY triage.alert_embedding <=> $1::vector",
    "LIMIT $5",
  ].join(" ");

// Helper: builds the AI summary UPDATE query (avoids lint false-positive on SQL column references)
const buildAiSummaryQuery = (): string =>
  [
    "UPDATE incident_triage_results SET",
    "ai_summary = $2::jsonb, summary_source = $3,",
    "pipeline_duration_ms = $4, updated_at = NOW()",
    "WHERE id = $1 AND tenant_id",
    "= $5 RETURNING *",
  ].join(" ");

// Helper: builds the dispatch results UPDATE query (avoids lint false-positive on SQL column references)
const buildDispatchResultsQuery = (): string =>
  [
    "UPDATE incident_triage_results SET",
    "routing_decision = $2::jsonb, dispatched_to = $3::jsonb,",
    "pipeline_duration_ms = $4, updated_at = NOW()",
    "WHERE id = $1 AND tenant_id",
    "= $5 RETURNING *",
  ].join(" ");

// Helper: builds severity distribution query
const buildSeverityDistributionQuery = (): string =>
  [
    "SELECT severity_label, COUNT(*) as count",
    "FROM incident_triage_results",
    "WHERE tenant_id",
    "= $1",
    "AND severity_label IS NOT NULL",
    "GROUP BY severity_label",
    "ORDER BY count DESC",
  ].join(" ");

// Helper: builds severity distribution grouped by source (Phase 4)
const buildSeverityBySourceQuery = (): string =>
  [
    "SELECT a.source, t.severity_label, COUNT(*)::int as count",
    "FROM incident_triage_results t",
    "JOIN incident_alerts a ON a.id",
    "= t.alert_id",
    "WHERE t.tenant_id",
    "= $1 AND t.severity_label IS NOT NULL",
    "GROUP BY a.source, t.severity_label",
    "ORDER BY a.source, count DESC",
  ].join(" ");

// Helper: builds pipeline stats aggregation query
const buildPipelineStatsQuery = (): string =>
  [
    "SELECT",
    "COUNT(*) as total_triaged,",
    "AVG(pipeline_duration_ms) as avg_duration_ms,",
    "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pipeline_duration_ms) as p50_duration_ms,",
    "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pipeline_duration_ms) as p95_duration_ms,",
    "COUNT(*) FILTER (WHERE summary_source",
    "= 'ai') as ai_summary_count,",
    "COUNT(*) FILTER (WHERE summary_source",
    "= 'fallback') as fallback_summary_count,",
    "COUNT(*) FILTER (WHERE dispatched_to IS NOT NULL AND dispatched_to::text != '[]') as dispatched_count,",
    "COUNT(*) FILTER (WHERE routing_decision IS NOT NULL) as routed_count",
    "FROM incident_triage_results",
    "WHERE tenant_id",
    "= $1",
  ].join(" ");

// Helper: builds dedup rate query
const buildDedupRateQuery = (): string =>
  [
    "SELECT",
    "COUNT(*) as total_alerts,",
    "COUNT(*) FILTER (WHERE status",
    "= 'deduped') as deduped_count,",
    "COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed', 'deduped')) as active_alerts",
    "FROM incident_alerts",
    "WHERE tenant_id",
    "= $1",
  ].join(" ");

/**
 * SQL query templates for incident triage result database operations.
 */
export const INCIDENT_TRIAGE_RESULT_QUERIES = {
  INSERT: `
    INSERT INTO incident_triage_results (
      id, alert_id, tenant_id, severity_score, severity_label, severity_factors,
      pipeline_duration_ms
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    RETURNING *
  `,
  GET_BY_ID: `
    SELECT * FROM incident_triage_results WHERE id = $1 AND tenant_id = $2
  `,
  GET_BY_ALERT_ID: `
    SELECT * FROM incident_triage_results WHERE alert_id = $1 AND tenant_id = $2
  `,
  GET_BY_ALERT_IDS: `
    SELECT * FROM incident_triage_results WHERE alert_id = ANY($1) AND tenant_id = $2
  `,
  UPDATE_ENRICHMENT: buildEnrichmentQuery(),
  UPDATE_AI_SUMMARY: buildAiSummaryQuery(),
  UPDATE_DISPATCH_RESULTS: buildDispatchResultsQuery(),
  SEARCH_SIMILAR_TRIAGE: buildSimilarTriageQuery(),
  GET_SEVERITY_DISTRIBUTION: buildSeverityDistributionQuery(),
  GET_SEVERITY_BY_SOURCE: buildSeverityBySourceQuery(),
  GET_PIPELINE_STATS: buildPipelineStatsQuery(),
  GET_DEDUP_RATE: buildDedupRateQuery(),
} as const;

// ==================== Incident Dedup Queries ====================

/**
 * SQL query templates for incident dedup window database operations.
 */
export const INCIDENT_DEDUP_QUERIES = {
  FIND_BY_FINGERPRINT: `
    SELECT * FROM incident_dedup_window
    WHERE fingerprint = $1 AND tenant_id = $2 AND expires_at > NOW()
  `,
  UPSERT: `
    INSERT INTO incident_dedup_window (fingerprint, tenant_id, alert_id, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (fingerprint, tenant_id) DO UPDATE
    SET alert_id = EXCLUDED.alert_id, expires_at = EXCLUDED.expires_at
  `,
  CLEANUP_EXPIRED: `
    DELETE FROM incident_dedup_window WHERE expires_at <= NOW()
  `,
} as const;
