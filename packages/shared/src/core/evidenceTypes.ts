/**
 * Evidence types for event analysis.
 * Defines structures for logs, metrics, git history, and system state.
 */

export interface LogEntry {
  /** Optional stable ID for cross-run traceability (e.g., hash of timestamp+source+message) */
  id?: string;
  source?: string;
  timestamp?: string;
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

export interface TimeSeriesMetric {
  metricName: string;
  values: Array<{
    timestamp: string;
    value: number;
  }>;
  unit?: string;
}

export interface MetricsSummary {
  errorRate?: number;
  requestRate?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  latencyP50?: number;
  latencyP95?: number;
  latencyP99?: number;
  [key: string]: unknown;
}

export interface Metrics {
  timeRange?: {
    start: string;
    end: string;
  };
  timeSeries?: TimeSeriesMetric[];
  summary?: MetricsSummary;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged?: string[];
  additions?: number;
  deletions?: number;
  url?: string;
}

export interface SystemState {
  deploymentStatus?: {
    currentVersion?: string;
    previousVersion?: string;
    deployedAt?: string;
    deployedBy?: string;
  };
  serviceHealth?: Record<string, "healthy" | "degraded" | "down" | "unknown">;
  dependencies?: Array<{
    name: string;
    status: "up" | "down" | "degraded";
    responseTime?: number;
  }>;
}

export interface KnowledgeDocument {
  id: string;
  type: "runbook" | "past_incident" | "documentation" | "best_practice" | "playbook";
  title: string;
  excerpt?: string;
  similarity: number;
  url?: string;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
  };
}

export interface RelatedEvent {
  eventId: string;
  type: string;
  timestamp: string;
  correlation: "before" | "after" | "concurrent";
}

export interface Evidence {
  eventId: string;
  logs?: LogEntry[];
  metrics?: Metrics;
  gitHistory?: GitCommit[];
  systemState?: SystemState;
  relatedDocs?: KnowledgeDocument[];
  relatedEvents?: RelatedEvent[];
  collectedAt: string;
  collectionDuration?: number;
}
