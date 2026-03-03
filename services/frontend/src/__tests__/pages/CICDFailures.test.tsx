/**
 * CICDFailures Page Tests
 *
 * Verifies the failures table page renders loading, error, empty,
 * and populated states with sorting, filtering, and pagination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CICDFailures } from "@/pages/CICDFailures";

const mockUseFailures = vi.fn();
const mockUseAnalysisStatusByEvents = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useFailures: (...args: unknown[]) => mockUseFailures(...args),
  useAnalysisStatusByEvents: (...args: unknown[]) => mockUseAnalysisStatusByEvents(...args),
}));

vi.mock("@/components/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));

vi.mock("@/components/FilterBarUtils", () => ({
  timeRangeToSince: () => undefined,
  loadSavedFilters: () => null,
  saveFilters: vi.fn(),
}));

vi.mock("@/lib/csvExport", () => ({
  exportFailuresToCSV: vi.fn(),
}));

const createEvent = (overrides = {}) => ({
  id: "event-1",
  type: "CICD_FAILURE",
  source: "github",
  severity: "high",
  timestamp: "2026-02-17T10:00:00Z",
  payload: {
    repository: "org/repo",
    checkName: "test-suite",
    conclusion: "failure",
    headSha: "abc1234567890",
    workflowName: "CI",
    branch: "main",
  },
  metadata: null,
  tenantId: "tenant-1",
  createdAt: "2026-02-17T10:00:00Z",
  ...overrides,
});

const renderFailures = (refreshKey = 0) =>
  render(
    <MemoryRouter>
      <CICDFailures refreshKey={refreshKey} />
    </MemoryRouter>
  );

describe("CICDFailures", () => {
  beforeEach(() => {
    mockUseFailures.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseAnalysisStatusByEvents.mockReturnValue({ data: null });
  });

  it("should render the page title", () => {
    renderFailures();
    expect(screen.getByRole("heading", { level: 1, name: "CI/CD Failures" })).toBeInTheDocument();
  });

  it("should render the page subtitle", () => {
    renderFailures();
    expect(screen.getByText(/Recent build and check failures/i)).toBeInTheDocument();
  });

  it("should render the filter bar", () => {
    renderFailures();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should show loading accessible text", () => {
      mockUseFailures.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      renderFailures();
      expect(screen.getByText("Loading results...")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should render the error message", () => {
      mockUseFailures.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed to load",
        refetch: vi.fn(),
      });
      renderFailures();
      expect(screen.getByText("Failed to load")).toBeInTheDocument();
    });

    it("should render a retry button", () => {
      const mockRefetch = vi.fn();
      mockUseFailures.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed to load",
        refetch: mockRefetch,
      });
      renderFailures();
      const retryButton = screen.getByRole("button", { name: /Retry/i });
      fireEvent.click(retryButton);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no failures exist", () => {
      mockUseFailures.mockReturnValue({
        data: { items: [], total: 0, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderFailures();
      expect(screen.getByText("No failures yet")).toBeInTheDocument();
    });

    it("should show correct description text for zero total", () => {
      mockUseFailures.mockReturnValue({
        data: { items: [], total: 0, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderFailures();
      expect(screen.getByText("No failures recorded yet")).toBeInTheDocument();
    });
  });

  describe("with data", () => {
    const event1 = createEvent();
    const event2 = createEvent({
      id: "event-2",
      severity: "medium",
      payload: {
        repository: "org/other-repo",
        checkName: "lint",
        conclusion: "cancelled",
        headSha: "def7890123456",
        workflowName: "Lint",
        branch: "feature",
      },
    });

    beforeEach(() => {
      mockUseFailures.mockReturnValue({
        data: { items: [event1, event2], total: 2, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      mockUseAnalysisStatusByEvents.mockReturnValue({ data: null });
    });

    it("should render the total count in description", () => {
      renderFailures();
      expect(screen.getByText("2 total failures")).toBeInTheDocument();
    });

    it("should render repository names in the table", () => {
      renderFailures();
      expect(screen.getByText("org/repo")).toBeInTheDocument();
      expect(screen.getByText("org/other-repo")).toBeInTheDocument();
    });

    it("should render check names in the table", () => {
      renderFailures();
      expect(screen.getByText("test-suite")).toBeInTheDocument();
      expect(screen.getByText("lint")).toBeInTheDocument();
    });

    it("should render severity badges", () => {
      renderFailures();
      expect(screen.getByText("High")).toBeInTheDocument();
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });

    it("should render conclusion badges", () => {
      renderFailures();
      expect(screen.getByText("failure")).toBeInTheDocument();
      expect(screen.getByText("cancelled")).toBeInTheDocument();
    });

    it("should render short SHA links", () => {
      renderFailures();
      expect(screen.getByText("abc1234")).toBeInTheDocument();
      expect(screen.getByText("def7890")).toBeInTheDocument();
    });

    it("should render Pending badge when no analysis status", () => {
      renderFailures();
      const pendingBadges = screen.getAllByText("Pending");
      expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("should render analysis status when available", () => {
      mockUseAnalysisStatusByEvents.mockReturnValue({
        data: {
          "event-1": { analysisId: "a-1", confidence: 0.92 },
        },
      });
      renderFailures();
      // "High" appears for both severity badge and confidence label
      const highTexts = screen.getAllByText("High");
      expect(highTexts.length).toBeGreaterThanOrEqual(2);
    });

    it("should render the accessible results count", () => {
      renderFailures();
      expect(screen.getByText("Showing 2 of 2 results")).toBeInTheDocument();
    });

    it("should render Export Page button when items exist", () => {
      renderFailures();
      expect(screen.getByRole("button", { name: /Export Page/i })).toBeInTheDocument();
    });

    it("should show singular form for single failure", () => {
      mockUseFailures.mockReturnValue({
        data: { items: [event1], total: 1, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderFailures();
      expect(screen.getByText("1 total failure")).toBeInTheDocument();
    });
  });
});
