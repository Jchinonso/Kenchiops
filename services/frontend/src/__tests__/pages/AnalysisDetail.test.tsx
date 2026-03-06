/**
 * AnalysisDetail Page Tests
 *
 * Verifies the analysis detail page renders loading, error,
 * and success states with back navigation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AnalysisDetail } from "@/pages/AnalysisDetail";

const mockUseAnalysisDetail = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useAnalysisDetail: (...args: unknown[]) => mockUseAnalysisDetail(...args),
}));

vi.mock("@/components/AnalysisDetailContent", () => ({
  DetailSkeleton: () => <div data-testid="detail-skeleton">Loading skeleton</div>,
  DetailContent: ({ analysis }: { analysis: { summary: string } }) => (
    <div data-testid="detail-content">{analysis.summary}</div>
  ),
}));

const renderAnalysisDetail = (analysisId = "analysis-123") =>
  render(
    <MemoryRouter>
      <AnalysisDetail analysisId={analysisId} />
    </MemoryRouter>
  );

describe("AnalysisDetail", () => {
  beforeEach(() => {
    mockUseAnalysisDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it("should render the back to analyses link", () => {
    renderAnalysisDetail();
    const backLink = screen.getByRole("link", { name: /Back to Analyses/i });
    expect(backLink).toHaveAttribute("href", "/dashboard/cicd/analyses");
  });

  describe("loading state", () => {
    it("should render loading title", () => {
      mockUseAnalysisDetail.mockReturnValue({ data: null, isLoading: true, error: null });
      renderAnalysisDetail();
      expect(
        screen.getByRole("heading", { level: 1, name: "Loading analysis..." })
      ).toBeInTheDocument();
    });

    it("should render the detail skeleton", () => {
      mockUseAnalysisDetail.mockReturnValue({ data: null, isLoading: true, error: null });
      renderAnalysisDetail();
      expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should render error title", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Analysis not found",
      });
      renderAnalysisDetail();
      expect(
        screen.getByRole("heading", { level: 1, name: "Analysis Not Found" })
      ).toBeInTheDocument();
    });

    it("should render the error message", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Analysis not found",
      });
      renderAnalysisDetail();
      expect(screen.getByText("Analysis not found")).toBeInTheDocument();
    });

    it("should render return to analyses link", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Analysis not found",
      });
      renderAnalysisDetail();
      const returnLink = screen.getByRole("link", { name: "Return to Analyses" });
      expect(returnLink).toHaveAttribute("href", "/dashboard/cicd/analyses");
    });
  });

  describe("success state", () => {
    const mockAnalysis = {
      id: "analysis-123",
      summary: "Dependency conflict in package-lock.json",
      identifiedCause: "Conflicting npm versions",
      diagnosisConfidence: 0.92,
      actionConfidence: null,
      confidenceSignals: null,
      recommendedActions: ["Update npm", "Clear cache"],
      fullAnalysis: { repository: "org/repo" },
      tenantId: "tenant-1",
      modelVersionId: null,
      aggregationKey: "github/org/repo/workflow",
      eventId: null,
      createdAt: "2026-02-17T10:00:00Z",
    };

    it("should render the analysis title with repo name", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderAnalysisDetail();
      expect(screen.getByRole("heading", { level: 1, name: /Analysis for/i })).toBeInTheDocument();
    });

    it("should render the detail content", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderAnalysisDetail();
      expect(screen.getByTestId("detail-content")).toBeInTheDocument();
    });

    it("should pass the analysis ID to the hook", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderAnalysisDetail("custom-id-456");
      expect(mockUseAnalysisDetail).toHaveBeenCalledWith("custom-id-456");
    });
  });
});
