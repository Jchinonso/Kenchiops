// ==================== Domain Types ====================

export interface InvestigationEvidenceItem {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly summary: string;
  readonly relevance: number;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface TimelineEvent {
  readonly timestamp: string;
  readonly type: string;
  readonly description: string;
  readonly sourceId: string;
}

export interface InvestigationCorrelation {
  readonly patterns: readonly string[];
  readonly timelineEvents: readonly TimelineEvent[];
  readonly relatedServices: readonly string[];
  readonly commonFactors: readonly string[];
}

export interface SuggestedInvestigationAction {
  readonly action: string;
  readonly reasoning: string;
  readonly priority: "immediate" | "short_term" | "long_term";
}

export interface InvestigationDiagnosis {
  readonly summary: string;
  readonly rootCauseHypothesis: string;
  readonly confidence: number;
  readonly suggestedActions: readonly SuggestedInvestigationAction[];
  readonly evidenceCited: readonly string[];
  readonly diagnosisSource: "ai" | "fallback";
}

export interface InvestigationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly initiatedBy: string;
  readonly initiatedFrom: string;
  readonly status: string;
  readonly description: string;
  readonly serviceName: string | null;
  readonly endpoint: string | null;
  readonly symptom: string | null;
  readonly environment: string | null;
  readonly timeRangeFrom: string | null;
  readonly timeRangeTo: string | null;
  readonly evidence: readonly InvestigationEvidenceItem[];
  readonly correlation: InvestigationCorrelation | null;
  readonly diagnosis: InvestigationDiagnosis | null;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

export interface PaginatedInvestigations {
  readonly items: readonly InvestigationRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// ==================== Input/Output Types ====================

export interface StartInvestigationInput {
  readonly description: string;
  readonly serviceName?: string;
  readonly symptom?: string;
  readonly environment?: string;
  readonly endpoint?: string;
}

export interface StartInvestigationResult {
  readonly id: string;
  readonly status: string;
}
