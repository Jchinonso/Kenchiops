/**
 * Unit tests for DashboardOverview page.
 *
 * Tests:
 * - Renders welcome message with first name
 * - Shows loading skeletons when stats are loading
 * - Renders quick stat cards (Failures, Analyses, Confidence, Repositories)
 * - Shows error state with retry button for stats
 * - Shows empty activity state when no data
 * - Shows recent failures when available
 * - Shows recent analyses when available
 * - Shows onboarding checklist when showOnboarding is true
 * - Export dashboard button appears when stats are loaded
 * - New user welcome state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DashboardOverview } from "@/pages/DashboardOverview";

// Mock hooks
const mockUseDashboardStats = vi.fn();
const mockUseAnalyses = vi.fn();
const mockUseFailures = vi.fn();
const mockUseTenantInfo = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useDashboardStats: (...args: unknown[]) => mockUseDashboardStats(...args),
  useAnalyses: (...args: unknown[]) => mockUseAnalyses(...args),
  useFailures: (...args: unknown[]) => mockUseFailures(...args),
  useTenantInfo: (...args: unknown[]) => mockUseTenantInfo(...args),
}));

// Mock chart components
vi.mock("@/components/ConfidenceChart", () => ({
  ConfidenceChart: () => <div data-testid="confidence-chart">Chart</div>,
}));
vi.mock("@/components/ConfidenceTrendChart", () => ({
  ConfidenceTrendChart: () => <div data-testid="trend-chart">Trend</div>,
}));
vi.mock("@/components/TimeDisplay", () => ({
  TimeDisplay: ({ dateTime }: { dateTime: string }) => <time>{dateTime}</time>,
}));

const defaultStats = {
  data: { totalFailures: 5, totalAnalyses: 3, connectedRepos: 2 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

const defaultAnalyses = {
  data: { items: [], total: 0 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

const defaultFailures = {
  data: { items: [], total: 0 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

const defaultTenant = {
  data: { githubConnected: true, slackConnected: false },
  isLoading: false,
};

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("DashboardOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardStats.mockReturnValue(defaultStats);
    mockUseAnalyses.mockReturnValue(defaultAnalyses);
    mockUseFailures.mockReturnValue(defaultFailures);
    mockUseTenantInfo.mockReturnValue(defaultTenant);
  });

  it("renders welcome message with first name", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Welcome back, Alice!")).toBeInTheDocument();
  });

  it("renders subtitle text", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Here's your CI/CD pipeline health at a glance.")).toBeInTheDocument();
  });

  it("renders quick stat cards", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Failures")).toBeInTheDocument();
    expect(screen.getByText("Analyses")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("Repositories")).toBeInTheDocument();
  });

  it("shows stat values from data", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("5")).toBeInTheDocument(); // totalFailures
    expect(screen.getByText("3")).toBeInTheDocument(); // totalAnalyses
    expect(screen.getByText("2")).toBeInTheDocument(); // connectedRepos
  });

  it("shows loading skeletons when stats are loading", () => {
    mockUseDashboardStats.mockReturnValue({ ...defaultStats, isLoading: true, data: null });
    const { container } = render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("shows error state with retry button", () => {
    mockUseDashboardStats.mockReturnValue({
      ...defaultStats,
      data: null,
      error: "Failed to load stats",
    });
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Failed to load stats")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows 'No recent activity' when no failures or analyses", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("No recent activity")).toBeInTheDocument();
  });

  it("shows recent failures when available", () => {
    mockUseFailures.mockReturnValue({
      ...defaultFailures,
      data: {
        items: [
          {
            id: "e1",
            timestamp: "2026-02-17T00:00:00Z",
            severity: "high",
            payload: { repository: "org/repo", checkName: "build" },
          },
        ],
        total: 1,
      },
    });
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Recent Failures")).toBeInTheDocument();
    expect(screen.getByText("View all failures →")).toBeInTheDocument();
  });

  it("shows recent analyses when available", () => {
    mockUseAnalyses.mockReturnValue({
      ...defaultAnalyses,
      data: {
        items: [
          {
            id: "a1",
            createdAt: "2026-02-17T00:00:00Z",
            diagnosisConfidence: 0.85,
            summary: "Build failed due to import error",
            aggregationKey: "repo:org/repo",
            fullAnalysis: null,
          },
        ],
        total: 1,
      },
    });
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Recent Analyses")).toBeInTheDocument();
    expect(screen.getByText("View all analyses →")).toBeInTheDocument();
  });

  it("shows onboarding checklist when showOnboarding is true", () => {
    // Ensure completedCount < 2 so the full card is shown (not the compact banner)
    mockUseTenantInfo.mockReturnValue({
      data: { githubConnected: false, slackConnected: false },
      isLoading: false,
    });
    mockUseDashboardStats.mockReturnValue({
      ...defaultStats,
      data: { totalFailures: 0, totalAnalyses: 0, connectedRepos: 0 },
    });
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={true} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Get Set Up")).toBeInTheDocument();
    expect(screen.getByText(/Install Kenchi GitHub App/)).toBeInTheDocument();
  });

  it("shows Export Dashboard button when stats are loaded", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Export Dashboard")).toBeInTheDocument();
  });

  it("renders confidence charts", () => {
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByTestId("confidence-chart")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });

  it("shows new user welcome state", () => {
    mockUseDashboardStats.mockReturnValue({
      ...defaultStats,
      data: { totalFailures: 0, totalAnalyses: 0, connectedRepos: 0 },
    });
    render(
      <Wrapper>
        <DashboardOverview firstName="Alice" showOnboarding={false} dismissOnboarding={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText("Welcome to Kenchi")).toBeInTheDocument();
    expect(screen.getByText("Connect GitHub")).toBeInTheDocument();
  });
});
