/**
 * Unit tests for Navbar component.
 *
 * Tests:
 * - Logo and brand rendering with link to home
 * - Desktop navigation links (Product, Resources, Customers, Pricing)
 * - Dropdown menus (Product, Resources) with hover behavior
 * - Theme toggle button cycles through light/dark/system
 * - Auth states: authenticated (dashboard link, avatar), unauthenticated (login, demo)
 * - Loading state hides login button
 * - Mobile menu toggle (open/close)
 * - Mobile menu content mirrors desktop
 * - Scroll-based CTA ("Start Free Trial") visibility
 * - Accessibility: aria-label, aria-expanded, aria-haspopup
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import Navbar from "@/components/Navbar";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useTheme
const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => mockUseTheme(),
}));

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    mockUseTheme.mockReturnValue({
      preference: "dark",
      resolved: "dark",
      setTheme: mockSetTheme,
    });
  });

  describe("branding", () => {
    it("should render the Kenchi logo text", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.getByText("Kenchi")).toBeInTheDocument();
    });

    it("should link the logo to the home page", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const logoLink = screen.getByText("Kenchi").closest("a");
      expect(logoLink).toHaveAttribute("href", "/");
    });
  });

  describe("navigation links", () => {
    it("should render desktop nav links (Customers, Pricing)", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.getByText("Customers")).toBeInTheDocument();
      expect(screen.getByText("Pricing")).toBeInTheDocument();
    });

    it("should render dropdown trigger buttons (Product, Resources)", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const productButtons = screen.getAllByText("Product");
      expect(productButtons.length).toBeGreaterThanOrEqual(1);

      const resourceButtons = screen.getAllByText("Resources");
      expect(resourceButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("theme toggle", () => {
    it("should render the theme toggle button with correct aria-label for dark mode", () => {
      mockUseTheme.mockReturnValue({
        preference: "dark",
        resolved: "dark",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: Dark/i);
      expect(themeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("should display light theme label when preference is light", () => {
      mockUseTheme.mockReturnValue({
        preference: "light",
        resolved: "light",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: Light/i);
      expect(themeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("should display system theme label when preference is system", () => {
      mockUseTheme.mockReturnValue({
        preference: "system",
        resolved: "light",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: System/i);
      expect(themeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("should cycle theme from dark to system on click", async () => {
      const user = userEvent.setup();
      mockUseTheme.mockReturnValue({
        preference: "dark",
        resolved: "dark",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: Dark/i);
      await user.click(themeButtons[0]);

      // dark -> system (index 1 -> index 2 in THEME_CYCLE)
      expect(mockSetTheme).toHaveBeenCalledWith("system");
    });

    it("should cycle theme from system to light on click", async () => {
      const user = userEvent.setup();
      mockUseTheme.mockReturnValue({
        preference: "system",
        resolved: "light",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: System/i);
      await user.click(themeButtons[0]);

      // system -> light (index 2 -> index 0 wrapping)
      expect(mockSetTheme).toHaveBeenCalledWith("light");
    });

    it("should cycle theme from light to dark on click", async () => {
      const user = userEvent.setup();
      mockUseTheme.mockReturnValue({
        preference: "light",
        resolved: "light",
        setTheme: mockSetTheme,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const themeButtons = screen.getAllByLabelText(/Theme: Light/i);
      await user.click(themeButtons[0]);

      // light -> dark
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });
  });

  describe("unauthenticated state", () => {
    it("should show LOGIN link when not authenticated and not loading", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.getByText("LOGIN")).toBeInTheDocument();
    });

    it("should show BOOK A DEMO link", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const demoLinks = screen.getAllByText("BOOK A DEMO");
      expect(demoLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("should not show DASHBOARD link when not authenticated", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
    });

    it("should hide LOGIN button when isLoading is true", () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
      });

      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
    });
  });

  describe("authenticated state", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { displayName: "Jane Doe" },
        isAuthenticated: true,
        isLoading: false,
      });
    });

    it("should show DASHBOARD link when authenticated", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const dashboardLinks = screen.getAllByText("DASHBOARD");
      expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("should show user display name", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const nameElements = screen.getAllByText("Jane Doe");
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
    });

    it("should show user initial in avatar", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const initials = screen.getAllByText("J");
      expect(initials.length).toBeGreaterThanOrEqual(1);
    });

    it("should not show LOGIN link when authenticated", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
    });

    it("should not show BOOK A DEMO when authenticated", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.queryByText("BOOK A DEMO")).not.toBeInTheDocument();
    });

    it("should fall back to 'U' initial when displayName is undefined", () => {
      mockUseAuth.mockReturnValue({
        user: { displayName: undefined },
        isAuthenticated: true,
        isLoading: false,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const initials = screen.getAllByText("U");
      expect(initials.length).toBeGreaterThanOrEqual(1);
    });

    it("should fall back to 'User' for display name when undefined", () => {
      mockUseAuth.mockReturnValue({
        user: { displayName: undefined },
        isAuthenticated: true,
        isLoading: false,
      });

      render(<Navbar />, { wrapper: Wrapper });

      const userTexts = screen.getAllByText("User");
      expect(userTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("mobile menu", () => {
    it("should have a mobile menu toggle button", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const toggleBtn = screen.getByLabelText("Open menu");
      expect(toggleBtn).toBeInTheDocument();
    });

    it("should open the mobile menu when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(<Navbar />, { wrapper: Wrapper });

      await user.click(screen.getByLabelText("Open menu"));

      expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
    });

    it("should show mobile nav links when menu is open", async () => {
      const user = userEvent.setup();
      render(<Navbar />, { wrapper: Wrapper });

      await user.click(screen.getByLabelText("Open menu"));

      // Mobile menu shows dropdown items
      const cicdLinks = screen.getAllByText("CI/CD Analysis");
      expect(cicdLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("should show mobile theme toggle when menu is open", async () => {
      const user = userEvent.setup();
      render(<Navbar />, { wrapper: Wrapper });

      await user.click(screen.getByLabelText("Open menu"));

      expect(screen.getByText(/Theme:/)).toBeInTheDocument();
    });

    it("should close mobile menu when a link is clicked", async () => {
      const user = userEvent.setup();
      render(<Navbar />, { wrapper: Wrapper });

      await user.click(screen.getByLabelText("Open menu"));

      // Click a mobile menu link (last match is the mobile copy)
      const cicdLinks = screen.getAllByText("CI/CD Analysis");
      await user.click(cicdLinks[cicdLinks.length - 1]);

      // After closing, the "Close menu" button should be gone
      expect(screen.queryByLabelText("Close menu")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("should have aria-label on the nav element", () => {
      render(<Navbar />, { wrapper: Wrapper });

      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    });

    it("should have aria-expanded on mobile menu button", () => {
      render(<Navbar />, { wrapper: Wrapper });

      const toggleBtn = screen.getByLabelText("Open menu");
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    });

    it("should toggle aria-expanded when mobile menu opens", async () => {
      const user = userEvent.setup();
      render(<Navbar />, { wrapper: Wrapper });

      await user.click(screen.getByLabelText("Open menu"));

      const closeBtn = screen.getByLabelText("Close menu");
      expect(closeBtn).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("scroll CTA", () => {
    it("should show START FREE TRIAL when scrolled past 600px", () => {
      render(<Navbar />, { wrapper: Wrapper });

      // Simulate scroll past 600px
      Object.defineProperty(window, "scrollY", { value: 700, configurable: true });
      fireEvent.scroll(window);

      // The scroll handler should show the CTA
      expect(screen.queryByText("START FREE TRIAL")).toBeInTheDocument();
    });

    it("should not show START FREE TRIAL when not scrolled", () => {
      render(<Navbar />, { wrapper: Wrapper });

      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      fireEvent.scroll(window);

      expect(screen.queryByText("START FREE TRIAL")).not.toBeInTheDocument();
    });
  });
});
