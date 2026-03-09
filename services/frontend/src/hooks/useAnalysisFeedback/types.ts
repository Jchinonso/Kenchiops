// Mirrors AnalysisFeedbackType from @kenchi/shared (frontend builds standalone in Docker)
type AnalysisFeedbackType = "correct" | "incorrect" | "flaky" | "needs_more_context";

// ==================== Request/Response Types ====================

export interface FeedbackSubmission {
  readonly feedbackType: AnalysisFeedbackType;
  readonly correction?: string;
}

export interface FeedbackResponse {
  readonly feedback: {
    readonly id: string;
    readonly feedbackType: AnalysisFeedbackType;
    readonly createdAt: string;
  };
  readonly wasUpdated: boolean;
  readonly lessonIngested?: boolean;
}

// ==================== Existing Feedback ====================

export interface ExistingFeedback {
  readonly id: string;
  readonly feedbackType: AnalysisFeedbackType;
  readonly correction: string | null;
  readonly userId: string;
  readonly createdAt: string;
}
