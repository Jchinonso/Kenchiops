import type { AnalysisFeedbackType } from "@kenchi/shared";

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
