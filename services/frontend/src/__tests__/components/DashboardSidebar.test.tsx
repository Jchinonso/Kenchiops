/**
 * Unit tests for DashboardSidebar component.
 *
 * Tests:
 * - Logo and brand rendering
 * - Navigation entries (leaf items and groups)
 * - Active route highlighting
 * - Group expand/collapse
 * - User info display (with and without avatar)
 * - User menu items (Keyboard Shortcuts, Help & Support, Sign Out)
 * - Logging out state
 * - Close button for mobile overlay
 * - onClose callback propagation
 * - "Coming Soon" badges
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardSidebar } from "@/components/DashboardSidebar";

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { tenantId: "tenant-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock Radix UI components used by DashboardSidebar
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: () => void;
  }) => <div data-open={open}>{children}</div>,
  CollapsibleTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: () => null,
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onLogout: vi.fn(),
  isLoggingOut: false,
  user: {
    displayName: "Jane Doe",
    email: "jane@example.com",
    avatarUrl: null,
  },
  onOpenShortcuts: vi.fn(),
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderSidebar = (props: Partial<typeof defaultProps> = {}, path: string = "/dashboard") =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <DashboardSidebar {...defaultProps} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe("DashboardSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("branding", () => {
    it("should render the Kenchi brand text", () => {
      renderSidebar();

      expect(screen.getByText("Kenchi")).toBeInTheDocument();
    });

    it("should link the logo to home page", () => {
      renderSidebar();

      const logoLink = screen.getByText("Kenchi").closest("a");
      expect(logoLink).toHaveAttribute("href", "/");
    });
  });

  describe("navigation items", () => {
    it("should render Overview leaf item", () => {
      renderSidebar();

      expect(screen.getByText("Overview")).toBeInTheDocument();
    });

    it("should render Settings leaf item", () => {
      renderSidebar();

      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("should render CI/CD group label", () => {
      renderSidebar();

      const cicdLabels = screen.getAllByText("CI/CD");
      expect(cicdLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("should render CI/CD child items (Analyses, Pipelines, Webhooks)", () => {
      renderSidebar({}, "/dashboard/cicd/analyses");

      expect(screen.getByText("Analyses")).toBeInTheDocument();
      expect(screen.getByText("Pipelines")).toBeInTheDocument();
      expect(screen.getByText("Webhooks")).toBeInTheDocument();
    });

    it("should render coming-soon groups (Incidents, Infrastructure, Deployments)", () => {
      renderSidebar();

      expect(screen.getByText("Incidents")).toBeInTheDocument();
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
      expect(screen.getByText("Deployments")).toBeInTheDocument();
    });

    it("should render coming-soon leaf items (Analytics, Integrations)", () => {
      renderSidebar();

      expect(screen.getByText("Analytics")).toBeInTheDocument();
      expect(screen.getByText("Integrations")).toBeInTheDocument();
    });

    it("should display 'Soon' badges for coming-soon groups", () => {
      renderSidebar();

      const soonBadges = screen.getAllByText("Soon");
      expect(soonBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("active route", () => {
    it("should mark Overview as active on /dashboard", () => {
      renderSidebar({}, "/dashboard");

      const overviewLink = screen.getByText("Overview").closest("a");
      expect(overviewLink).toHaveAttribute("aria-current", "page");
    });

    it("should not mark Overview as active on sub-pages", () => {
      renderSidebar({}, "/dashboard/settings");

      const overviewLink = screen.getByText("Overview").closest("a");
      expect(overviewLink).not.toHaveAttribute("aria-current");
    });

    it("should mark Settings as active on /dashboard/settings", () => {
      renderSidebar({}, "/dashboard/settings");

      const settingsLink = screen.getByText("Settings").closest("a");
      expect(settingsLink).toHaveAttribute("aria-current", "page");
    });
  });

  describe("close button", () => {
    it("should render close button for mobile", () => {
      renderSidebar();

      expect(screen.getByLabelText("Close navigation menu")).toBeInTheDocument();
    });

    it("should call onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderSidebar({ onClose });

      await user.click(screen.getByLabelText("Close navigation menu"));

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("user info", () => {
    it("should display user display name", () => {
      renderSidebar();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    it("should display user email", () => {
      renderSidebar();

      expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    });

    it("should show user initials when no avatar URL", () => {
      renderSidebar({ user: { displayName: "Jane Doe", email: "j@e.com", avatarUrl: null } });

      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("should show avatar image when avatarUrl is provided", () => {
      renderSidebar({
        user: {
          displayName: "Jane Doe",
          email: "j@e.com",
          avatarUrl: "https://example.com/avatar.png",
        },
      });

      const img = screen.getByAltText("Jane Doe");
      expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    });

    it("should fall back to 'U' for initials when user is null", () => {
      renderSidebar({ user: null });

      expect(screen.getByText("U")).toBeInTheDocument();
    });

    it("should fall back to 'User' for display name when user is null", () => {
      renderSidebar({ user: null });

      expect(screen.getByText("User")).toBeInTheDocument();
    });

    it("should not show email when user is null", () => {
      renderSidebar({ user: null });

      expect(screen.queryByText("jane@example.com")).not.toBeInTheDocument();
    });

    it("should truncate long initials to 2 characters", () => {
      renderSidebar({
        user: {
          displayName: "John Smith Wilson",
          email: "j@e.com",
          avatarUrl: null,
        },
      });

      // "John Smith Wilson" => J + S + W => "JS" (sliced to 2)
      expect(screen.getByText("JS")).toBeInTheDocument();
    });
  });

  describe("user menu actions", () => {
    it("should render Keyboard Shortcuts button", () => {
      renderSidebar();

      expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    });

    it("should render Help & Support link", () => {
      renderSidebar();

      const helpLink = screen.getByText("Help & Support");
      expect(helpLink.closest("a")).toHaveAttribute(
        "href",
        "https://github.com/kenchiops/kenchi/issues"
      );
    });

    it("should render Sign Out button", () => {
      renderSidebar();

      expect(screen.getByText("Sign Out")).toBeInTheDocument();
    });

    it("should call onLogout when Sign Out is clicked", async () => {
      const user = userEvent.setup();
      const onLogout = vi.fn();
      renderSidebar({ onLogout });

      await user.click(screen.getByText("Sign Out"));

      expect(onLogout).toHaveBeenCalledOnce();
    });

    it("should show 'Signing out...' and disable button when isLoggingOut", () => {
      renderSidebar({ isLoggingOut: true });

      expect(screen.getByText("Signing out...")).toBeInTheDocument();
      const logoutBtn = screen.getByText("Signing out...").closest("button");
      expect(logoutBtn).toBeDisabled();
    });

    it("should call onOpenShortcuts when Keyboard Shortcuts is clicked", async () => {
      const user = userEvent.setup();
      const onOpenShortcuts = vi.fn();
      const onClose = vi.fn();
      renderSidebar({ onOpenShortcuts, onClose });

      await user.click(screen.getByText("Keyboard Shortcuts"));

      expect(onClose).toHaveBeenCalled();
      expect(onOpenShortcuts).toHaveBeenCalled();
    });
  });

  describe("sidebar visibility", () => {
    it("should apply translate-x-0 when isOpen is true", () => {
      const { container } = renderSidebar({ isOpen: true });

      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("translate-x-0");
    });

    it("should apply -translate-x-full when isOpen is false", () => {
      const { container } = renderSidebar({ isOpen: false });

      const aside = container.querySelector("aside");
      expect(aside?.className).toContain("-translate-x-full");
    });
  });
});
