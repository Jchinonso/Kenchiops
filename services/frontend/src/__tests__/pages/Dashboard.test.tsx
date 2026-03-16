/**
 * Unit tests for Dashboard page.
 *
 * Tests:
 * - Shows loading spinner when auth is loading
 * - Redirects to /login when not authenticated
 * - Renders sidebar, header, and content when authenticated
 * - Shows breadcrumb in header
 * - Shows notification bell
 * - Shows theme toggle button
 * - Mobile menu button is present
 * - Renders ComingSoon for unknown routes
 * - Renders DashboardOverview at /dashboard
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Dashboard from "@/pages/Dashboard";

// Mock all dependencies
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseDashboardSSE = vi.fn();
vi.mock("@/hooks/useDashboardSSE", () => ({
  useDashboardSSE: () => mockUseDashboardSSE(),
}));

const mockUseTheme = vi.fn();
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => mockUseTheme(),
}));

vi.mock("@/lib/formatters", () => ({
  formatRelativeTime: () => "just now",
}));

vi.mock("@/hooks/useDashboardData", () => ({
  useTenantInfo: () => ({
    data: { githubConnected: true, slackConnected: false },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ data: null, isLoading: false }),
  useSubscriptionUsage: () => ({ data: null, isLoading: false }),
}));

// Mock child components to avoid deep rendering
vi.mock("@/components/DashboardSidebar", () => ({
  DashboardSidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("@/components/DashboardBreadcrumb", () => ({
  DashboardBreadcrumb: () => <div data-testid="breadcrumb">Breadcrumb</div>,
}));

vi.mock("@/components/DashboardFooter", () => ({
  DashboardFooter: () => <div data-testid="footer">Footer</div>,
}));

vi.mock("@/components/KeyboardShortcutsDialog", () => ({
  KeyboardShortcutsDialog: () => null,
}));

vi.mock("@/components/CommandPalette", () => ({
  CommandPalette: () => null,
}));

vi.mock("@/components/ComingSoon", () => ({
  ComingSoon: ({ title }: { title: string }) => <div data-testid="coming-soon">{title}</div>,
}));

vi.mock("@/components/TenantGuard", () => ({
  TenantGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PageErrorBoundary", () => ({
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

vi.mock("@/pages/DashboardOverview", () => ({
  DashboardOverview: () => <div data-testid="overview">Dashboard Overview</div>,
}));

vi.mock("@/pages/CICDFailures", () => ({
  CICDFailures: () => <div data-testid="failures">CI/CD Failures</div>,
}));

vi.mock("@/pages/CICDAnalyses", () => ({
  CICDAnalyses: () => <div data-testid="analyses">CI/CD Analyses</div>,
}));

vi.mock("@/pages/CICDPipelines", () => ({
  CICDPipelines: () => <div data-testid="pipelines">CI/CD Pipelines</div>,
}));

vi.mock("@/pages/WebhookActivity", () => ({
  WebhookActivity: () => <div data-testid="webhooks">Webhook Activity</div>,
}));

vi.mock("@/pages/RepositoryDetail", () => ({
  RepositoryDetail: () => <div data-testid="repo-detail">Repo Detail</div>,
}));

vi.mock("@/pages/AnalysisDetail", () => ({
  AnalysisDetail: () => <div data-testid="analysis-detail">Analysis Detail</div>,
}));

vi.mock("@/pages/Onboarding", () => ({
  Onboarding: () => <div data-testid="onboarding">Onboarding</div>,
}));

vi.mock("@/pages/PlanSelection", () => ({
  PlanSelection: () => <div data-testid="plan-selection">Plan Selection</div>,
}));

vi.mock("@/pages/Integrations", () => ({
  Integrations: () => <div data-testid="integrations">Integrations</div>,
}));

vi.mock("@/pages/GitLabSetup", () => ({
  GitLabSetup: () => <div data-testid="gitlab-setup">GitLab Setup</div>,
}));

vi.mock("@/pages/TeamManagement", () => ({
  TeamManagement: () => <div data-testid="team-management">Team Management</div>,
}));

vi.mock("@/pages/KnowledgeBase", () => ({
  KnowledgeBase: () => <div data-testid="knowledge-base">Knowledge Base</div>,
}));

vi.mock("@/pages/ActiveIncidents", () => ({
  ActiveIncidents: () => <div data-testid="active-incidents">Active Incidents</div>,
}));

vi.mock("@/pages/IncidentDetailPanel", () => ({
  IncidentDetailPanel: () => null,
}));

vi.mock("@/pages/Investigations", () => ({
  Investigations: () => <div data-testid="investigations">Investigations</div>,
}));

vi.mock("@/pages/InvestigationDetail", () => ({
  InvestigationDetail: () => <div data-testid="investigation-detail">Investigation Detail</div>,
}));

vi.mock("@/pages/NewInvestigation", () => ({
  NewInvestigation: () => <div data-testid="new-investigation">New Investigation</div>,
}));

vi.mock("@/pages/Settings", () => ({
  Settings: () => <div data-testid="settings">Settings</div>,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

const authenticatedAuth = {
  user: {
    id: "u1",
    displayName: "Test User",
    email: "test@example.com",
    avatarUrl: null,
  },
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(),
};

const defaultSSE = {
  notifications: [],
  markAllRead: vi.fn(),
  markAsRead: vi.fn(),
  dismissNotification: vi.fn(),
};

const defaultTheme = {
  preference: "system" as const,
  resolved: "light" as const,
  setTheme: vi.fn(),
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(authenticatedAuth);
    mockUseDashboardSSE.mockReturnValue(defaultSSE);
    mockUseTheme.mockReturnValue(defaultTheme);
    localStorage.clear();
  });

  it("shows loading state when auth is loading", () => {
    mockUseAuth.mockReturnValue({ ...authenticatedAuth, isLoading: true, isAuthenticated: false });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("page-loader")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockUseAuth.mockReturnValue({
      ...authenticatedAuth,
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    // Navigate redirect doesn't render dashboard content
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it("renders sidebar when authenticated", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("renders breadcrumb in header", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("breadcrumb")).toBeInTheDocument();
  });

  it("renders notification bell button", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("shows unread badge on notification bell", () => {
    mockUseDashboardSSE.mockReturnValue({
      ...defaultSSE,
      notifications: [
        {
          id: "1",
          type: "failure",
          title: "T",
          description: "D",
          timestamp: "2026-01-01",
          read: false,
        },
        {
          id: "2",
          type: "failure",
          title: "T2",
          description: "D2",
          timestamp: "2026-01-01",
          read: false,
        },
      ],
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByLabelText("Notifications (2 unread)")).toBeInTheDocument();
  });

  it("renders theme toggle button", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
  });

  it("renders mobile menu button", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByLabelText("Open navigation menu")).toBeInTheDocument();
  });

  it("renders DashboardOverview at /dashboard", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("overview")).toBeInTheDocument();
  });

  it("renders CICDAnalyses at /dashboard/cicd/failures (redirect)", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard/cicd/failures"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    // /dashboard/cicd/failures now renders CICDAnalyses
    expect(screen.getByTestId("analyses")).toBeInTheDocument();
  });

  it("renders Settings at /dashboard/settings", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard/settings"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("settings")).toBeInTheDocument();
  });

  it("renders ActiveIncidents for incident routes", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard/incidents"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("active-incidents")).toBeInTheDocument();
  });

  it("renders footer", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("has skip-to-content link for accessibility", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
  });
});
