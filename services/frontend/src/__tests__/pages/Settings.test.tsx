/**
 * Unit tests for Settings page.
 *
 * Tests the redesigned settings page with ProfileHero,
 * SettingsNav, and content sections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Settings } from "@/pages/Settings";

// Mock hooks
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseTenantInfo = vi.fn();
vi.mock("@/hooks/useDashboardData", () => ({
  useTenantInfo: (...args: unknown[]) => mockUseTenantInfo(...args),
}));

const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => mockUseTheme(),
}));

const mockSetToastEnabled = vi.fn();
const mockSetBrowserEnabled = vi.fn();
vi.mock("@/hooks/useNotificationPreferences", () => ({
  useNotificationPreferences: () => ({
    toastEnabled: true,
    browserEnabled: false,
    setToastEnabled: mockSetToastEnabled,
    setBrowserEnabled: mockSetBrowserEnabled,
  }),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: vi.fn(),
}));

vi.mock("@/components/TimeDisplay", () => ({
  TimeDisplay: ({ dateTime }: { dateTime: string }) => <time>{dateTime}</time>,
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ data: null, isLoading: false }),
  useSubscriptionUsage: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useBilling", () => ({
  useBillingStatus: () => ({ data: null, isLoading: false }),
  useBillingPortal: () => ({ openPortal: vi.fn(), isLoading: false }),
}));

vi.mock("@/hooks/useDeletionImpact", () => ({
  useDeletionImpact: () => ({ impact: null, isLoading: false, error: null, fetchImpact: vi.fn() }),
}));

vi.mock("@/hooks/useActiveSection", () => ({
  useActiveSection: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const defaultAuth = {
  user: {
    id: "u1",
    displayName: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    role: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    providers: [{ provider: "github", username: "testuser" }],
    organizations: [{ isSelected: true, provider: "github" }],
    tenantType: "organization",
  },
  logout: vi.fn(),
};

const defaultTenant = {
  data: {
    id: "t1",
    orgName: "TestOrg",
    status: "active",
    githubConnected: true,
    slackConnected: false,
  },
  isLoading: false,
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth);
    mockUseTenantInfo.mockReturnValue(defaultTenant);
    mockUseTheme.mockReturnValue({
      preference: "system",
      resolved: "light",
      setTheme: mockSetTheme,
    });
  });

  it("renders user display name in profile hero", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("renders user email in profile hero", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("shows user initials when no avatar", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("TU")).toBeInTheDocument();
  });

  it("shows avatar image when provided", () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: { ...defaultAuth.user, avatarUrl: "https://example.com/avatar.png" },
    });
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    const img = screen.getByAltText("Test User");
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("shows provider badge with username", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("renders organization name and status in profile hero", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("TestOrg")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows loading skeleton for tenant", () => {
    mockUseTenantInfo.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it("renders appearance section with three theme options", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("calls setTheme when clicking a theme option", async () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("Dark"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders notification section with toggles", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("In-App Toast Notifications")).toBeInTheDocument();
    expect(screen.getByText("Browser Notifications")).toBeInTheDocument();
  });

  it("renders danger zone section", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    const dangerZoneTexts = screen.getAllByText("Danger Zone");
    expect(dangerZoneTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows role badge", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});
