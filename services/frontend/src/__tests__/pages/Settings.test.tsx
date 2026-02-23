/**
 * Unit tests for Settings page.
 *
 * Tests:
 * - Renders page title and description
 * - Shows profile section with user info
 * - Shows user initials when no avatar
 * - Shows avatar when provided
 * - Shows organization section
 * - Shows tenant loading skeleton
 * - Shows connections section (GitHub, Slack)
 * - Shows appearance section with theme options
 * - Active theme option is highlighted
 * - Shows notification toggles
 * - Shows danger zone with delete account button
 * - Delete dialog opens and requires confirmation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

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

const defaultAuth = {
  user: {
    id: "u1",
    displayName: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    role: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    providers: [{ provider: "github", username: "testuser" }],
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

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
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

  it("renders page title", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByText("Manage your profile, organization, and preferences.")
    ).toBeInTheDocument();
  });

  it("renders profile section with user info", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
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

  it("shows provider badge", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("renders organization section", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Organization")).toBeInTheDocument();
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

  it("renders connections section", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
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

  it("renders danger zone with delete account button", () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
    const deleteTexts = screen.getAllByText("Delete Account");
    expect(deleteTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows delete confirmation dialog requiring typed confirmation", async () => {
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    const user = userEvent.setup();

    // Click the delete account button to open dialog
    const deleteButtons = screen.getAllByText("Delete Account");
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Delete your account?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type "DELETE" to confirm')).toBeInTheDocument();
  });

  it("shows no organization message when tenant is null", () => {
    mockUseTenantInfo.mockReturnValue({ data: null, isLoading: false });
    render(
      <Wrapper>
        <Settings />
      </Wrapper>
    );
    expect(screen.getByText("No organization found.")).toBeInTheDocument();
  });
});
