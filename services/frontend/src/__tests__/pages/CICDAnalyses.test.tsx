/**
 * CICDAnalyses Page Tests
 *
 * Verifies the analyses table page renders loading, error, empty,
 * and populated states with sorting and pagination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CICDAnalyses } from "@/pages/CICDAnalyses";

const mockUseAnalyses = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      tenantId: "tenant-1",
      organizations: [{ isSelected: true, provider: "github" }],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useDashboardData", () => ({
  useAnalyses: (...args: unknown[]) => mockUseAnalyses(...args),
  useAnalysisCountsByRepo: () => ({ data: null }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscriptionUsage: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/components/FeatureLocked", () => ({
  FeatureLocked: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

vi.mock("@/components/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
  parseConfidenceFilter: () => ({ min: null, max: null }),
  timeRangeToSince: () => undefined,
  loadSavedFilters: () => null,
  saveFilters: vi.fn(),
}));

vi.mock("@/lib/csvExport", () => ({
  exportAnalysesToCSV: vi.fn(),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
  }: {
    readonly children: React.ReactNode;
    readonly asChild?: boolean;
  }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/pages/AnalysisDetailPanel", () => ({
  AnalysisDetailPanel: () => <div data-testid="detail-panel" />,
}));

const createAnalysis = (overrides = {}) => ({
  id: "analysis-1",
  eventId: "event-1",
  summary: "Build failed due to type error in index.ts",
  identifiedCause: "TypeScript strict mode violation",
  diagnosisConfidence: 0.85,
  actionConfidence: null,
  confidenceSignals: null,
  recommendedActions: ["Fix the type error", "Update tsconfig"],
  fullAnalysis: { repository: "org/repo" },
  tenantId: "tenant-1",
  modelVersionId: null,
  aggregationKey: "github/org/repo/ci",
  createdAt: "2026-02-17T10:00:00Z",
  ...overrides,
});

const renderAnalyses = () =>
  render(
    <MemoryRouter>
      <CICDAnalyses />
    </MemoryRouter>
  );

describe("CICDAnalyses", () => {
  beforeEach(() => {
    mockUseAnalyses.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("should render the page title", () => {
    renderAnalyses();
    expect(screen.getByRole("heading", { level: 1, name: "CI/CD Analyses" })).toBeInTheDocument();
  });

  it("should render the page subtitle", () => {
    renderAnalyses();
    expect(screen.getByText(/AI-powered root cause analysis/i)).toBeInTheDocument();
  });

  it("should render the filter bar", () => {
    renderAnalyses();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("should render the detail panel component", () => {
    renderAnalyses();
    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should show loading accessible text", () => {
      mockUseAnalyses.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      renderAnalyses();
      expect(screen.getByText("Loading results...")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should render the error message", () => {
      mockUseAnalyses.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed to load analyses",
        refetch: vi.fn(),
      });
      renderAnalyses();
      expect(screen.getByText("Failed to load analyses")).toBeInTheDocument();
    });

    it("should render a retry button on error", () => {
      const mockRefetch = vi.fn();
      mockUseAnalyses.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed",
        refetch: mockRefetch,
      });
      renderAnalyses();
      const retryButton = screen.getByRole("button", { name: /Retry/i });
      fireEvent.click(retryButton);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no analyses exist", () => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [], total: 0, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAnalyses();
      expect(screen.getByText("No analyses yet")).toBeInTheDocument();
    });

    it("should show correct description for empty state", () => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [], total: 0, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAnalyses();
      expect(screen.getByText("No analyses recorded yet")).toBeInTheDocument();
    });
  });

  describe("with data", () => {
    const analysis1 = createAnalysis();
    const analysis2 = createAnalysis({
      id: "analysis-2",
      eventId: null,
      summary: "Docker build timeout",
      diagnosisConfidence: 0.65,
      aggregationKey: "github/org/other/build",
    });

    beforeEach(() => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [analysis1, analysis2], total: 2, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("should render the total count", () => {
      renderAnalyses();
      expect(screen.getByText("2 total analyses")).toBeInTheDocument();
    });

    it("should render singular for 1 analysis", () => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [analysis1], total: 1, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAnalyses();
      expect(screen.getByText("1 total analysis")).toBeInTheDocument();
    });

    it("should render analysis summaries in the table", () => {
      renderAnalyses();
      expect(screen.getByText(/Build failed due to type error/i)).toBeInTheDocument();
      expect(screen.getByText(/Docker build timeout/i)).toBeInTheDocument();
    });

    it("should render confidence badges", () => {
      renderAnalyses();
      expect(screen.getByText(/85%/i)).toBeInTheDocument();
      expect(screen.getByText(/65%/i)).toBeInTheDocument();
    });

    it("should render Export Page button", () => {
      renderAnalyses();
      expect(screen.getByRole("button", { name: /Export Page/i })).toBeInTheDocument();
    });

    it("should render accessible result count", () => {
      renderAnalyses();
      expect(screen.getByText("Showing 2 of 2 results")).toBeInTheDocument();
    });
  });
});
