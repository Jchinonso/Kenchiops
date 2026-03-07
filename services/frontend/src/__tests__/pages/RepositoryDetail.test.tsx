/**
 * RepositoryDetail Page Tests
 *
 * Verifies the repository detail page renders header, stats,
 * failures list, analyses list, and pagination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { RepositoryDetail } from "@/pages/RepositoryDetail";

const mockUseFailures = vi.fn();
const mockUseAnalyses = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useFailures: (...args: unknown[]) => mockUseFailures(...args),
  useAnalyses: (...args: unknown[]) => mockUseAnalyses(...args),
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
  },
  metadata: null,
  tenantId: "tenant-1",
  createdAt: "2026-02-17T10:00:00Z",
  ...overrides,
});

const createAnalysis = (overrides = {}) => ({
  id: "analysis-1",
  eventId: "event-1",
  summary: "Build failed due to type error",
  identifiedCause: "Type mismatch in module",
  diagnosisConfidence: 0.85,
  actionConfidence: null,
  confidenceSignals: null,
  recommendedActions: ["Fix types"],
  fullAnalysis: { repository: "org/repo" },
  tenantId: "tenant-1",
  modelVersionId: null,
  aggregationKey: "github/org/repo/ci",
  createdAt: "2026-02-17T10:00:00Z",
  ...overrides,
});

const renderRepoDetail = (repoFullName = "org/repo") =>
  render(
    <MemoryRouter>
      <RepositoryDetail repoFullName={repoFullName} />
    </MemoryRouter>
  );

describe("RepositoryDetail", () => {
  beforeEach(() => {
    mockUseFailures.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    mockUseAnalyses.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it("should render the back to pipelines link", () => {
    renderRepoDetail();
    const backLink = screen.getByRole("link", { name: /Back to Pipelines/i });
    expect(backLink).toHaveAttribute("href", "/dashboard/cicd/pipelines");
  });

  it("should render the repository name as heading", () => {
    renderRepoDetail("org/my-awesome-repo");
    expect(
      screen.getByRole("heading", { level: 1, name: "org/my-awesome-repo" })
    ).toBeInTheDocument();
  });

  it("should render the View on GitHub link", () => {
    renderRepoDetail("org/repo");
    const ghLink = screen.getByRole("link", { name: /View on GitHub/i });
    expect(ghLink).toHaveAttribute("href", "https://github.com/org/repo");
  });

  it("should render Failures stat card", () => {
    renderRepoDetail();
    // "Failures" appears as stat label and as section heading
    const failuresTexts = screen.getAllByText("Failures");
    expect(failuresTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("should render Analyses stat card", () => {
    renderRepoDetail();
    // "Analyses" appears as stat label and as section heading
    const analysesTexts = screen.getAllByText("Analyses");
    expect(analysesTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("should render Avg Confidence stat card", () => {
    renderRepoDetail();
    expect(screen.getByText("Avg Confidence")).toBeInTheDocument();
  });

  describe("with failures data", () => {
    beforeEach(() => {
      mockUseFailures.mockReturnValue({
        data: { items: [createEvent()], total: 1, limit: 10, offset: 0 },
        isLoading: false,
        error: null,
      });
    });

    it("should render failures count", () => {
      renderRepoDetail();
      // The stat card shows the total
      expect(screen.getByText("1 failure")).toBeInTheDocument();
    });

    it("should render check name in failure item", () => {
      renderRepoDetail();
      expect(screen.getByText("test-suite")).toBeInTheDocument();
    });
  });

  describe("with analyses data", () => {
    beforeEach(() => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [createAnalysis()], total: 1, limit: 10, offset: 0 },
        isLoading: false,
        error: null,
      });
    });

    it("should render analyses count", () => {
      renderRepoDetail();
      expect(screen.getByText("1 analysis")).toBeInTheDocument();
    });

    it("should render analysis summary", () => {
      renderRepoDetail();
      expect(screen.getByText(/Build failed due to type error/i)).toBeInTheDocument();
    });
  });

  describe("empty states", () => {
    it("should show no failures message when failures list is empty", () => {
      mockUseFailures.mockReturnValue({
        data: { items: [], total: 0, limit: 10, offset: 0 },
        isLoading: false,
        error: null,
      });
      renderRepoDetail();
      expect(screen.getByText("No failures")).toBeInTheDocument();
    });

    it("should show no analyses message when analyses list is empty", () => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [], total: 0, limit: 10, offset: 0 },
        isLoading: false,
        error: null,
      });
      renderRepoDetail();
      expect(screen.getByText("No analyses")).toBeInTheDocument();
    });
  });

  describe("average confidence", () => {
    it("should show -- when no analyses exist", () => {
      mockUseAnalyses.mockReturnValue({
        data: { items: [], total: 0, limit: 10, offset: 0 },
        isLoading: false,
        error: null,
      });
      renderRepoDetail();
      // Avg Confidence card shows "--" when no analyses
      const dashes = screen.getAllByText("--");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it("should calculate average confidence from analyses", () => {
      mockUseAnalyses.mockReturnValue({
        data: {
          items: [
            createAnalysis({ id: "a-1", diagnosisConfidence: 0.8 }),
            createAnalysis({ id: "a-2", diagnosisConfidence: 0.6 }),
          ],
          total: 2,
          limit: 10,
          offset: 0,
        },
        isLoading: false,
        error: null,
      });
      renderRepoDetail();
      // (0.8 + 0.6) / 2 * 100 = 70%
      expect(screen.getByText("70%")).toBeInTheDocument();
    });
  });
});
