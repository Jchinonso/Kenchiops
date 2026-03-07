// ==================== Notification Types ====================

export interface DashboardNotification {
  readonly id: string;
  readonly type: "failure" | "analysis_complete" | "new_incident" | "incident_triaged";
  readonly title: string;
  readonly description: string;
  readonly timestamp: string;
  readonly read: boolean;
  readonly analysisId?: string;
  readonly repository?: string;
  readonly severity?: string;
  readonly source?: string;
}

export interface UseDashboardSSEResult {
  readonly notifications: readonly DashboardNotification[];
  readonly markAllRead: () => void;
  readonly markAsRead: (id: string) => void;
  readonly dismissNotification: (id: string) => void;
}

// ==================== SSE Payload Types ====================

export interface NewFailurePayload {
  readonly type: string;
  readonly repository?: string;
  readonly checkName?: string;
  readonly commitSha?: string;
}

export interface AnalysisCompletePayload {
  readonly type: string;
  readonly repository?: string;
  readonly analysisId?: string;
  readonly confidence?: number;
}

export interface NewIncidentPayload {
  readonly type: string;
  readonly source?: string;
  readonly title?: string;
  readonly severity?: string;
  readonly serviceName?: string;
}

export interface IncidentTriagedPayload {
  readonly type: string;
  readonly alertId?: string;
  readonly severity?: string;
  readonly title?: string;
  readonly aiSummary?: string;
}

export interface InvestigationStatusChangedPayload {
  readonly type: string;
  readonly investigationId?: string;
  readonly status?: string;
}
