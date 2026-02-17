/**
 * AnalysisDetailPanel Page Tests
 *
 * Verifies the slide-over panel renders loading, error,
 * and success states with copy-link functionality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AnalysisDetailPanel } from "@/pages/AnalysisDetailPanel";

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

// Mock Radix Sheet to render children without portal
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const mockOnClose = vi.fn();

const renderPanel = (analysisId: string | null = "analysis-123", open = true) =>
  render(
    <MemoryRouter>
      <AnalysisDetailPanel analysisId={analysisId} open={open} onClose={mockOnClose} />
    </MemoryRouter>
  );

describe("AnalysisDetailPanel", () => {
  beforeEach(() => {
    mockOnClose.mockClear();
    mockUseAnalysisDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it("should not render when open is false", () => {
    renderPanel("analysis-123", false);
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("should render the sheet title", () => {
    renderPanel();
    expect(screen.getByRole("heading", { level: 2, name: "Analysis Detail" })).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should render skeleton when loading", () => {
      mockUseAnalysisDetail.mockReturnValue({ data: null, isLoading: true, error: null });
      renderPanel();
      expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
    });

    it("should show loading description", () => {
      mockUseAnalysisDetail.mockReturnValue({ data: null, isLoading: true, error: null });
      renderPanel();
      expect(screen.getByText("Loading analysis details...")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should render error description", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Not found",
      });
      renderPanel();
      expect(screen.getByText("Failed to load analysis")).toBeInTheDocument();
    });

    it("should render the error message text", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Not found",
      });
      renderPanel();
      expect(screen.getByText("Not found")).toBeInTheDocument();
    });
  });

  describe("success state", () => {
    const mockAnalysis = {
      id: "analysis-123",
      summary: "Build failed due to type error",
      identifiedCause: "Type mismatch",
      diagnosisConfidence: 0.85,
      actionConfidence: null,
      confidenceSignals: null,
      recommendedActions: ["Fix types"],
      fullAnalysis: { repository: "org/repo" },
      tenantId: "tenant-1",
      modelVersionId: null,
      aggregationKey: "github/org/repo/workflow",
      eventId: null,
      createdAt: "2026-02-17T10:00:00Z",
    };

    it("should render the detail content", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderPanel();
      expect(screen.getByTestId("detail-content")).toBeInTheDocument();
    });

    it("should render the copy link button", () => {
      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderPanel();
      expect(screen.getByRole("button", { name: /Copy link/i })).toBeInTheDocument();
    });

    it("should copy link to clipboard when copy button is clicked", async () => {
      const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
      Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        writable: true,
        configurable: true,
      });

      mockUseAnalysisDetail.mockReturnValue({
        data: mockAnalysis,
        isLoading: false,
        error: null,
      });
      renderPanel();
      fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/dashboard/cicd/analyses/analysis-123")
      );
    });
  });

  it("should not render copy link button when analysisId is null", () => {
    renderPanel(null);
    expect(screen.queryByRole("button", { name: /Copy link/i })).not.toBeInTheDocument();
  });
});
