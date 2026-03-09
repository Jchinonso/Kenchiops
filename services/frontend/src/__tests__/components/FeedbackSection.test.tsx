/**
 * Unit tests for FeedbackSection component.
 *
 * Tests the feedback UI for CI failure analyses with thumbs up/down rating.
 * Verifies user interactions, toast notifications, correction textarea,
 * character limit enforcement, and pre-fill behavior.
 *
 * Code paths covered:
 *
 * Rendering:
 *  - Renders "Was this analysis helpful?" label
 *  - Renders "Helpful" and "Not helpful" buttons
 *  - Shows spinner when submission is in progress
 *  - Disables buttons when fetching or submitting
 *
 * Helpful (thumbs up):
 *  - Submits { feedbackType: "correct" } when clicked
 *  - Shows toast "Analysis saved to knowledge base" when lessonIngested is true
 *  - Shows toast "Feedback recorded" when lessonIngested is false
 *  - Shows toast.error "Failed to submit feedback" when result is null
 *  - Applies active styling when current feedback type is "correct"
 *  - Hides correction panel when clicked
 *
 * Not helpful (thumbs down):
 *  - Shows correction textarea on click
 *  - Toggles correction textarea on repeated clicks
 *  - Opens correction textarea when already "incorrect" but panel is hidden
 *  - Applies active styling when current feedback type is "incorrect"
 *
 * Correction textarea:
 *  - Has 1000 character max length
 *  - Shows character counter
 *  - Cancel button hides the textarea
 *  - Submit sends { feedbackType: "incorrect" } without correction when empty
 *  - Submit sends { feedbackType: "incorrect", correction } when text entered
 *  - Shows toast "Feedback recorded" on successful submission
 *  - Shows toast.error on failed submission
 *  - Hides textarea after successful submission
 *
 * Pre-fill:
 *  - Pre-fills correction from existing feedback when available
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ==================== Imports (after mocks, resolved by Vitest hoisting) ====================

import { FeedbackSection } from "@/components/FeedbackSection";
import { useMyFeedback, useSubmitFeedback } from "@/hooks/useAnalysisFeedback";
import { toast } from "sonner";

// ==================== Mock Setup ====================

vi.mock("@/hooks/useAnalysisFeedback", () => ({
  useMyFeedback: vi.fn(),
  useSubmitFeedback: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock lucide-react icons to avoid the dual React (18/19) rendering issue.
// The monorepo root has React 18, the frontend uses React 19. lucide-react
// is hoisted to root node_modules and compiled against React 18 JSX.
// Use React.createElement to avoid JSX transform ambiguity in factory.
vi.mock("lucide-react", async () => {
  const React = await import("react");
  return {
    ThumbsUp: (props: Record<string, unknown>) =>
      React.createElement("svg", { "data-testid": "thumbs-up", ...props }),
    ThumbsDown: (props: Record<string, unknown>) =>
      React.createElement("svg", { "data-testid": "thumbs-down", ...props }),
    Loader2: (props: Record<string, unknown>) =>
      React.createElement("svg", { "data-testid": "loader", ...props }),
  };
});

// Cast to mock types for test assertions
const mockUseMyFeedback = vi.mocked(useMyFeedback);
const mockUseSubmitFeedback = vi.mocked(useSubmitFeedback);
const mockToast = vi.mocked(toast);
const mockSubmitFeedback = vi.fn();

// ==================== Helpers ====================

const DEFAULT_ANALYSIS_ID = "analysis-123";

/** Finds the nearest button ancestor for a text element, throwing if not found. */
const getButtonByText = (text: string): HTMLButtonElement => {
  const el = screen.getByText(text).closest("button");
  if (!el) {
    throw new Error(`Button containing text "${text}" not found`);
  }
  return el;
};

/** Default return value for useMyFeedback when no feedback exists */
const noFeedback = () => ({
  data: null,
  isLoading: false,
  error: null,
});

/** Return value for useMyFeedback when feedback exists */
const withFeedback = (feedbackType: string, correction: string | null = null) => ({
  data: {
    id: "fb-1",
    feedbackType,
    correction,
    userId: "user-1",
    createdAt: "2025-06-15T12:00:00.000Z",
  },
  isLoading: false,
  error: null,
});

/** Default return value for useSubmitFeedback */
const submitHookReady = () => ({
  isLoading: false,
  error: null,
  submitFeedback: mockSubmitFeedback,
});

/** Return value for useSubmitFeedback when loading */
const submitHookLoading = () => ({
  isLoading: true,
  error: null,
  submitFeedback: mockSubmitFeedback,
});

// ==================== Tests ====================

describe("FeedbackSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyFeedback.mockReturnValue(noFeedback());
    mockUseSubmitFeedback.mockReturnValue(submitHookReady());
    mockSubmitFeedback.mockResolvedValue({
      feedback: { id: "fb-new", feedbackType: "correct", createdAt: "2025-06-15T12:00:00Z" },
      wasUpdated: false,
      lessonIngested: false,
    });
  });

  // ==================== Rendering ====================

  describe("rendering", () => {
    it("should render the 'Was this analysis helpful?' label", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      expect(screen.getByText("Was this analysis helpful?")).toBeInTheDocument();
    });

    it("should render the Helpful button", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      expect(screen.getByText("Helpful")).toBeInTheDocument();
    });

    it("should render the Not helpful button", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      expect(screen.getByText("Not helpful")).toBeInTheDocument();
    });

    it("should not show correction textarea initially", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      expect(
        screen.queryByPlaceholderText("What was incorrect about this analysis?")
      ).not.toBeInTheDocument();
    });

    it("should pass analysisId to useMyFeedback hook", () => {
      render(<FeedbackSection analysisId="my-analysis-42" />);

      expect(mockUseMyFeedback).toHaveBeenCalledWith("my-analysis-42");
    });

    it("should pass analysisId to useSubmitFeedback hook", () => {
      render(<FeedbackSection analysisId="my-analysis-42" />);

      expect(mockUseSubmitFeedback).toHaveBeenCalledWith("my-analysis-42");
    });
  });

  // ==================== Disabled State ====================

  describe("disabled state", () => {
    it("should disable both buttons when feedback is being fetched", () => {
      mockUseMyFeedback.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      const notHelpfulButton = getButtonByText("Not helpful");

      expect(helpfulButton).toBeDisabled();
      expect(notHelpfulButton).toBeDisabled();
    });

    it("should disable both buttons when feedback is being submitted", () => {
      mockUseSubmitFeedback.mockReturnValue(submitHookLoading());

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      const notHelpfulButton = getButtonByText("Not helpful");

      expect(helpfulButton).toBeDisabled();
      expect(notHelpfulButton).toBeDisabled();
    });
  });

  // ==================== Helpful Button ====================

  describe("helpful button", () => {
    it("should submit feedback with feedbackType 'correct' when clicked", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      await userEvent.click(helpfulButton);

      expect(mockSubmitFeedback).toHaveBeenCalledWith({ feedbackType: "correct" });
    });

    it("should show toast 'Analysis saved to knowledge base' when lessonIngested is true", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "correct", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
        lessonIngested: true,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Helpful"));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Analysis saved to knowledge base");
      });
    });

    it("should show toast 'Feedback recorded' when lessonIngested is false", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "correct", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
        lessonIngested: false,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Helpful"));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Feedback recorded");
      });
    });

    it("should show toast.error when submission returns null", async () => {
      mockSubmitFeedback.mockResolvedValue(null);

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Helpful"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to submit feedback");
      });
    });

    it("should close correction panel when helpful is clicked", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      // Open correction panel first
      await userEvent.click(getButtonByText("Not helpful"));
      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();

      // Click helpful to close it
      await userEvent.click(getButtonByText("Helpful"));

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("What was incorrect about this analysis?")
        ).not.toBeInTheDocument();
      });
    });

    it("should apply active styling when current feedback type is 'correct'", () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("correct"));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      expect(helpfulButton.className).toContain("text-green-700");
    });
  });

  // ==================== Not Helpful Button ====================

  describe("not helpful button", () => {
    it("should show correction textarea when clicked", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();
    });

    it("should toggle correction textarea on repeated clicks", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const button = getButtonByText("Not helpful");

      // Open
      await userEvent.click(button);
      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();

      // Close
      await userEvent.click(button);
      expect(
        screen.queryByPlaceholderText("What was incorrect about this analysis?")
      ).not.toBeInTheDocument();
    });

    it("should open correction textarea when already 'incorrect' but panel is hidden", async () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("incorrect"));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      // Panel is hidden, but feedback type is already "incorrect"
      expect(
        screen.queryByPlaceholderText("What was incorrect about this analysis?")
      ).not.toBeInTheDocument();

      await userEvent.click(getButtonByText("Not helpful"));

      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();
    });

    it("should apply active styling when current feedback type is 'incorrect'", () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("incorrect"));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const notHelpfulButton = getButtonByText("Not helpful");
      expect(notHelpfulButton.className).toContain("text-red-700");
    });
  });

  // ==================== Correction Textarea ====================

  describe("correction textarea", () => {
    it("should have a maxLength attribute of 1000", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText("What was incorrect about this analysis?");
      expect(textarea).toHaveAttribute("maxLength", "1000");
    });

    it("should show character counter starting at 0/1000", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      expect(screen.getByText("0/1000")).toBeInTheDocument();
    });

    it("should update character counter as user types", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText("What was incorrect about this analysis?");
      fireEvent.change(textarea, { target: { value: "Hello world" } });

      expect(screen.getByText("11/1000")).toBeInTheDocument();
    });

    it("should show Cancel and Submit buttons", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });

    it("should hide correction textarea when Cancel is clicked", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Cancel"));

      expect(
        screen.queryByPlaceholderText("What was incorrect about this analysis?")
      ).not.toBeInTheDocument();
    });

    it("should submit feedback without correction when textarea is empty", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "incorrect", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(mockSubmitFeedback).toHaveBeenCalledWith({
          feedbackType: "incorrect",
        });
      });
    });

    it("should submit feedback with trimmed correction when text is entered", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "incorrect", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText("What was incorrect about this analysis?");
      fireEvent.change(textarea, { target: { value: "  The root cause was different  " } });

      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(mockSubmitFeedback).toHaveBeenCalledWith({
          feedbackType: "incorrect",
          correction: "The root cause was different",
        });
      });
    });

    it("should show toast 'Feedback recorded' on successful correction submission", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "incorrect", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Feedback recorded");
      });
    });

    it("should show toast.error on failed correction submission", async () => {
      mockSubmitFeedback.mockResolvedValue(null);

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith("Failed to submit feedback");
      });
    });

    it("should hide textarea after successful correction submission", async () => {
      mockSubmitFeedback.mockResolvedValue({
        feedback: { id: "fb-1", feedbackType: "incorrect", createdAt: "2025-06-15T12:00:00Z" },
        wasUpdated: false,
      });

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("What was incorrect about this analysis?")
        ).not.toBeInTheDocument();
      });
    });

    it("should keep textarea visible after failed correction submission", async () => {
      mockSubmitFeedback.mockResolvedValue(null);

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));
      await userEvent.click(screen.getByText("Submit"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });

      expect(
        screen.getByPlaceholderText("What was incorrect about this analysis?")
      ).toBeInTheDocument();
    });

    it("should have 3 rows on the textarea", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText("What was incorrect about this analysis?");
      expect(textarea).toHaveAttribute("rows", "3");
    });
  });

  // ==================== Pre-fill Correction ====================

  describe("pre-fill correction", () => {
    it("should pre-fill correction from existing feedback when available", async () => {
      mockUseMyFeedback.mockReturnValue(
        withFeedback("incorrect", "The analysis missed the real root cause")
      );

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      // Open the correction panel
      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText(
        "What was incorrect about this analysis?"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("The analysis missed the real root cause");
    });

    it("should show pre-filled character count", async () => {
      const correctionText = "Wrong root cause";
      mockUseMyFeedback.mockReturnValue(withFeedback("incorrect", correctionText));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      expect(screen.getByText(`${correctionText.length}/1000`)).toBeInTheDocument();
    });

    it("should not pre-fill when existing feedback has no correction", async () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("incorrect", null));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText(
        "What was incorrect about this analysis?"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    });
  });

  // ==================== Active Styling ====================

  describe("active styling", () => {
    // The inactive buttons contain hover:bg-green-50 / hover:bg-red-50
    // but only the active button has bg-green-50 / bg-red-50 without the
    // hover: prefix. Use that as the discriminator.
    it("should not apply active styling to Helpful when no feedback exists", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      // Active state uses bg-green-50 without hover: prefix
      expect(helpfulButton.className).toContain("bg-zinc-50");
      expect(helpfulButton.className).not.toMatch(/(?<![a-z-:])bg-green-50(?!\S)/);
    });

    it("should not apply active styling to Not helpful when no feedback exists", () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const notHelpfulButton = getButtonByText("Not helpful");
      expect(notHelpfulButton.className).toContain("bg-zinc-50");
      expect(notHelpfulButton.className).not.toMatch(/(?<![a-z-:])bg-red-50(?!\S)/);
    });

    it("should not apply active Not helpful styling when feedback type is 'correct'", () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("correct"));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const notHelpfulButton = getButtonByText("Not helpful");
      expect(notHelpfulButton.className).toContain("bg-zinc-50");
    });

    it("should not apply active Helpful styling when feedback type is 'incorrect'", () => {
      mockUseMyFeedback.mockReturnValue(withFeedback("incorrect"));

      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      const helpfulButton = getButtonByText("Helpful");
      expect(helpfulButton.className).toContain("bg-zinc-50");
    });
  });

  // ==================== Content Truncation via Slice ====================

  describe("content truncation via onChange slice", () => {
    it("should truncate input at 1000 characters in the onChange handler", async () => {
      render(<FeedbackSection analysisId={DEFAULT_ANALYSIS_ID} />);

      await userEvent.click(getButtonByText("Not helpful"));

      const textarea = screen.getByPlaceholderText("What was incorrect about this analysis?");

      // Fire a change event with 1100 characters -- the onChange handler
      // slices at 1000 via event.target.value.slice(0, 1000)
      const longText = "X".repeat(1100);
      fireEvent.change(textarea, { target: { value: longText } });

      const displayedTextarea = textarea as HTMLTextAreaElement;
      expect(displayedTextarea.value).toBe("X".repeat(1000));
    });
  });
});
