/**
 * TanStack Query Key Factory
 *
 * Hierarchical key factory for all data-fetching domains.
 * Keys follow the pattern: [domain, entity?, action?, filters?]
 *
 * Invalidation strategy:
 *   - queryKeys.dashboard.all          -> invalidates everything under "dashboard"
 *   - queryKeys.dashboard.analyses.all -> invalidates all analysis queries
 *   - queryKeys.dashboard.stats(src)   -> invalidates one specific stats query
 */

// ==================== Filter Types ====================

interface AnalysesFilters {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly minConfidence?: string;
  readonly maxConfidence?: string;
  readonly since?: string;
  readonly source?: string;
}

interface FailuresFilters {
  readonly limit: number;
  readonly offset: number;
  readonly repository?: string;
  readonly severity?: string;
  readonly since?: string;
  readonly source?: string;
}

interface IncidentsFilters {
  readonly tenantId: string;
  readonly limit: number;
  readonly offset: number;
  readonly severity?: string;
  readonly status?: string;
  readonly source?: string;
}

interface InvestigationsFilters {
  readonly limit: number;
  readonly offset: number;
  readonly status?: string;
}

interface WebhookActivityFilters {
  readonly limit: number;
  readonly offset: number;
  readonly source?: string;
  readonly status?: string;
}

interface KnowledgeBaseFilters {
  readonly docType?: string;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Key Factory ====================

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    tenant: () => ["dashboard", "tenant"] as const,
    stats: (source?: string) => ["dashboard", "stats", { source }] as const,
    repositories: () => ["dashboard", "repositories"] as const,
    analyses: {
      all: () => ["dashboard", "analyses"] as const,
      list: (filters: AnalysesFilters) => ["dashboard", "analyses", "list", filters] as const,
      detail: (id: string) => ["dashboard", "analyses", "detail", id] as const,
      feedback: (id: string) => ["dashboard", "analyses", "feedback", id] as const,
      byEvents: (eventIds: readonly string[]) =>
        ["dashboard", "analyses", "byEvents", eventIds] as const,
      countsByRepo: () => ["dashboard", "analyses", "countsByRepo"] as const,
    },
    failures: {
      all: () => ["dashboard", "failures"] as const,
      list: (filters: FailuresFilters) => ["dashboard", "failures", "list", filters] as const,
    },
    confidence: {
      all: () => ["dashboard", "confidence"] as const,
      distribution: () => ["dashboard", "confidence", "distribution"] as const,
      trend: (bucket: string, since?: string) =>
        ["dashboard", "confidence", "trend", { bucket, since }] as const,
    },
    webhookActivity: (filters: WebhookActivityFilters) =>
      ["dashboard", "webhookActivity", filters] as const,
    correlation: (commitSha: string) => ["dashboard", "correlation", commitSha] as const,
    gitlabProjects: () => ["dashboard", "gitlabProjects"] as const,
  },
  incidents: {
    all: ["incidents"] as const,
    list: (filters: IncidentsFilters) => ["incidents", "list", filters] as const,
    detail: (id: string) => ["incidents", "detail", id] as const,
    triageStats: () => ["incidents", "triageStats"] as const,
    integrationHealth: () => ["incidents", "integrationHealth"] as const,
    activeBySource: () => ["incidents", "activeBySource"] as const,
    balancedRecent: (perSource: number, maxTotal: number) =>
      ["incidents", "balancedRecent", { perSource, maxTotal }] as const,
    severityBySource: () => ["incidents", "severityBySource"] as const,
  },
  investigations: {
    all: ["investigations"] as const,
    list: (filters: InvestigationsFilters) => ["investigations", "list", filters] as const,
    detail: (id: string) => ["investigations", "detail", id] as const,
  },
  billing: {
    all: ["billing"] as const,
    status: () => ["billing", "status"] as const,
  },
  subscription: {
    all: ["subscription"] as const,
    info: () => ["subscription", "info"] as const,
    usage: () => ["subscription", "usage"] as const,
    plans: () => ["subscription", "plans"] as const,
  },
  team: {
    all: ["team"] as const,
    members: () => ["team", "members"] as const,
    invitations: () => ["team", "invitations"] as const,
  },
  account: {
    deletionImpact: () => ["account", "deletionImpact"] as const,
  },
  knowledgeBase: {
    all: ["knowledgeBase"] as const,
    stats: () => ["knowledgeBase", "stats"] as const,
    documents: (filters: KnowledgeBaseFilters) => ["knowledgeBase", "documents", filters] as const,
  },
  integrations: {
    all: ["integrations"] as const,
    gitlab: {
      all: () => ["integrations", "gitlab"] as const,
      availableProjects: () => ["integrations", "gitlab", "availableProjects"] as const,
      connection: () => ["integrations", "gitlab", "connection"] as const,
    },
  },
  chat: {
    all: ["chat"] as const,
    conversations: () => ["chat", "conversations"] as const,
  },
} as const;
