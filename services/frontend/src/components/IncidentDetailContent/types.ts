export interface AISummary {
  readonly headline?: string;
  readonly rootCauseSummary?: string;
  readonly impactAssessment?: string;
  readonly suggestedActions?: ReadonlyArray<{
    readonly action: string;
    readonly priority?: string;
  }>;
}

export interface SeverityAssessment {
  readonly score?: number;
  readonly label?: string;
  readonly factors?: ReadonlyArray<{
    readonly name: string;
    readonly value: string;
    readonly weight?: number;
  }>;
}

export interface RoutingDecision {
  readonly matchedRules?: ReadonlyArray<{ readonly ruleName: string; readonly action?: string }>;
  readonly targets?: readonly string[];
  readonly suppressed?: boolean;
  readonly suppressionReason?: string;
}

export interface CorrelatedIncident {
  readonly id: string;
  readonly title: string;
  readonly similarity?: number;
}

export interface MatchedRunbook {
  readonly name: string;
  readonly url?: string;
  readonly relevance?: number;
}

export interface ConfidenceLevel {
  readonly label: string;
  readonly barColor: string;
  readonly badgeClass: string;
}
