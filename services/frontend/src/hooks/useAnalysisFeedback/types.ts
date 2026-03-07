// ==================== Request/Response Types ====================

export interface FeedbackSubmission {
  readonly feedbackType: "correct" | "incorrect" | "flaky" | "needs_more_context";
  readonly correction?: string;
}

export interface FeedbackResponse {
  readonly feedback: {
    readonly id: string;
    readonly feedbackType: string;
    readonly createdAt: string;
  };
  readonly wasUpdated: boolean;
  readonly lessonIngested?: boolean;
}

// ==================== Existing Feedback ====================

export interface ExistingFeedback {
  readonly id: string;
  readonly feedbackType: "correct" | "incorrect" | "flaky" | "needs_more_context";
  readonly correction: string | null;
  readonly userId: string;
  readonly createdAt: string;
}
