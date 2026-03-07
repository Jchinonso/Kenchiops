// ==================== Domain Types ====================

export interface TenantInfo {
  readonly id: string;
  readonly orgName: string;
  readonly githubConnected: boolean;
  readonly gitlabConnected: boolean;
  readonly slackConnected: boolean;
  readonly status: string;
  readonly hasData: boolean;
}

export interface DashboardStats {
  readonly totalAnalyses: number;
  readonly totalFailures: number;
  readonly connectedRepos: number;
  readonly gitlabProjectCount: number;
}

export interface InstallationRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly isPrivate: boolean;
  readonly defaultBranch: string;
}

export interface EventRecord {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly severity: string | null;
  readonly timestamp: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly tenantId: string | null;
  readonly createdAt: string;
}

export interface AnalysisRecord {
  readonly id: string;
  readonly eventId: string | null;
  readonly summary: string;
  readonly identifiedCause: string | null;
  readonly diagnosisConfidence: number;
  readonly actionConfidence: number | null;
  readonly confidenceSignals: Readonly<Record<string, unknown>> | null;
  readonly recommendedActions: readonly string[] | null;
  readonly fullAnalysis: Readonly<Record<string, unknown>>;
  readonly tenantId: string | null;
  readonly modelVersionId: string | null;
  readonly aggregationKey: string | null;
  readonly ciProvider: string | null;
  readonly headSha: string | null;
  readonly createdAt: string;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Option Types ====================

export interface BuildAnalysesUrlOptions {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly minConfidence?: string;
  readonly maxConfidence?: string;
  readonly since?: string;
  readonly source?: string;
}

export interface BuildFailuresUrlOptions {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

export interface UseAnalysesOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly repository?: string;
  readonly minConfidence?: string;
  readonly maxConfidence?: string;
  readonly since?: string;
  readonly source?: string;
}

export interface UseFailuresOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

export interface UseWebhookActivityOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly source?: string;
  readonly status?: string;
}

// ==================== Stat Types ====================

export interface ConfidenceBucket {
  readonly level: string;
  readonly count: number;
}

export interface AnalysisCountByRepo {
  readonly repository: string;
  readonly analysisCount: number;
}

export interface AnalysisStatusEntry {
  readonly analysisId: string;
  readonly confidence: number;
}

export type AnalysisStatusMap = Readonly<Record<string, AnalysisStatusEntry | null>>;

export interface ConfidenceTrendPoint {
  readonly date: string;
  readonly avgConfidence: number;
  readonly count: number;
}

// ==================== Webhook & Integration Types ====================

export interface WebhookActivityRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly source: string;
  readonly status: string;
  readonly processingTimeMs: number | null;
  readonly errorMessage: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CorrelationSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface CorrelationResult {
  readonly commitSha: string;
  readonly analyses: readonly CorrelationSummary[];
  readonly incidents: readonly CorrelationSummary[];
}

export interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly fullPath: string;
  readonly webUrl: string;
  readonly defaultBranch: string | null;
  readonly visibility: string;
  readonly lastActivity: string;
}
