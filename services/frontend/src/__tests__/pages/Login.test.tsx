/**
 * Login Page Tests
 *
 * Verifies the login page renders provider OAuth buttons,
 * handles authenticated redirect, error banners, semantic
 * HTML structure, and left panel showcase content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Login from "@/pages/Login";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock getLoginUrl
const mockGetLoginUrl = vi.fn().mockReturnValue("https://api.test/auth/login/github");
vi.mock("@/lib/apiClient", () => ({
  getLoginUrl: (...args: unknown[]) => mockGetLoginUrl(...args),
}));

// Mock PKCE flow
vi.mock("@/lib/pkce", () => ({
  initPkceFlow: () =>
    Promise.resolve({ codeChallenge: "test-challenge", codeChallengeMethod: "S256" }),
}));

// Mock window.location.assign
const mockAssign = vi.fn();
Object.defineProperty(window, "location", {
  value: { assign: mockAssign },
  writable: true,
});

const defaultAuth = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const renderLogin = (initialEntries: readonly string[] = ["/login"]) =>
  render(
    <MemoryRouter initialEntries={[...initialEntries]}>
      <Login />
    </MemoryRouter>
  );

describe("Login", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(defaultAuth);
    mockGetLoginUrl.mockReturnValue("https://api.test/auth/login/github");
    mockAssign.mockClear();
  });

  describe("rendering", () => {
    it("should render the page heading", () => {
      renderLogin();
      expect(screen.getByRole("heading", { level: 1, name: "Get started" })).toBeInTheDocument();
    });

    it("should render the free trial text", () => {
      renderLogin();
      expect(screen.getByText("free 14-day trial")).toBeInTheDocument();
    });

    it("should render the Back to home link", () => {
      renderLogin();
      const backLink = screen.getByRole("link", { name: /Back to home/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute("href", "/");
    });

    it("should render the Terms of Service and Privacy Policy links", () => {
      renderLogin();
      const termsLink = screen.getByRole("link", { name: "Terms of Service" });
      expect(termsLink).toHaveAttribute("href", "/terms");
      const privacyLink = screen.getByRole("link", { name: "Privacy Policy" });
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });

    it("should render the contact us link with mailto", () => {
      renderLogin();
      const contactLink = screen.getByRole("link", { name: "Contact us" });
      expect(contactLink).toHaveAttribute("href", "mailto:hello@kenchi.dev");
    });

    it("should render security reassurance note", () => {
      renderLogin();
      expect(screen.getByText(/Secure OAuth/)).toBeInTheDocument();
    });
  });

  describe("semantic HTML and accessibility", () => {
    it("should use <main> landmark for the login form area", () => {
      const { container } = renderLogin();
      expect(container.querySelector("main")).toBeInTheDocument();
    });

    it("should use <aside> landmark for the left panel", () => {
      const { container } = renderLogin();
      const aside = container.querySelector("aside");
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveAttribute("aria-label", "Product highlights");
    });

    it("should have type=button on provider buttons", () => {
      renderLogin();
      const githubButton = screen.getByRole("button", { name: /Continue with GitHub/i });
      expect(githubButton).toHaveAttribute("type", "button");
    });

    it("should render mobile logo (hidden on lg screens)", () => {
      renderLogin();
      const homeLinks = screen.getAllByLabelText("Kenchi home");
      // One in aside (desktop), one in main (mobile)
      expect(homeLinks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("provider buttons", () => {
    it("should render Continue with GitHub button", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /Continue with GitHub/i })).toBeInTheDocument();
    });

    it("should render secondary provider buttons", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /GitLab/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bitbucket/i })).toBeInTheDocument();
    });

    it("should render the or continue with divider", () => {
      renderLogin();
      expect(screen.getByText("or continue with")).toBeInTheDocument();
    });

    it("should show Connecting text while loading", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub/i }));
      expect(screen.getByText(/Connecting to GitHub.../i)).toBeInTheDocument();
    });
  });

  describe("auth states", () => {
    it("should show loading spinner when auth is loading", () => {
      mockUseAuth.mockReturnValue({ ...defaultAuth, isLoading: true });
      renderLogin();
      expect(screen.getByText("Checking authentication...")).toBeInTheDocument();
    });

    it("should not render provider buttons when auth is loading", () => {
      mockUseAuth.mockReturnValue({ ...defaultAuth, isLoading: true });
      renderLogin();
      expect(
        screen.queryByRole("button", { name: /Continue with GitHub/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("OAuth error handling", () => {
    it("should display error banner when ?error=access_denied is present", () => {
      renderLogin(["/login?error=access_denied"]);
      expect(
        screen.getByText("Access was denied. Please try again or use a different account.")
      ).toBeInTheDocument();
    });

    it("should display error banner for invalid_state error", () => {
      renderLogin(["/login?error=invalid_state"]);
      expect(
        screen.getByText("Authentication session expired. Please try again.")
      ).toBeInTheDocument();
    });

    it("should display generic error for unknown error codes", () => {
      renderLogin(["/login?error=something_else"]);
      expect(screen.getByText("Authentication failed. Please try again.")).toBeInTheDocument();
    });

    it("should not display error banner when no error param", () => {
      renderLogin();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("should use role=alert on error banner for screen readers", () => {
      renderLogin(["/login?error=server_error"]);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("left panel content", () => {
    it("should render the Kenchi logo as a link to home", () => {
      renderLogin();
      const homeLinks = screen.getAllByLabelText("Kenchi home");
      expect(homeLinks.length).toBeGreaterThanOrEqual(1);
      expect(homeLinks[0].closest("a")).toHaveAttribute("href", "/");
    });

    it("should render the headline in the showcase", () => {
      renderLogin();
      expect(screen.getByText(/Stop debugging CI failures/)).toBeInTheDocument();
    });

    it("should render trusted by company names", () => {
      renderLogin();
      expect(screen.getByText("Vercel")).toBeInTheDocument();
      expect(screen.getByText("CircleCI")).toBeInTheDocument();
    });
  });
});
