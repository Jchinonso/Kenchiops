/**
 * Login Page Tests
 *
 * Verifies the login page renders two tabs (Cloud/Self-Hosted),
 * git provider OAuth buttons, feature callouts, stats,
 * instance URL input, and handles authenticated redirect.
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

const renderLogin = () =>
  render(
    <MemoryRouter>
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

    it("should render Cloud and Self-Hosted tabs", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: "Cloud" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Self-Hosted" })).toBeInTheDocument();
    });

    it("should render the Terms of Service and Privacy Policy links", () => {
      renderLogin();
      const termsLink = screen.getByRole("link", { name: "Terms of Service" });
      expect(termsLink).toHaveAttribute("href", "/terms");
      const privacyLink = screen.getByRole("link", { name: "Privacy Policy" });
      expect(privacyLink).toHaveAttribute("href", "/privacy");
    });

    it("should render the contact us link", () => {
      renderLogin();
      const contactLink = screen.getByRole("link", { name: "Contact us" });
      expect(contactLink).toHaveAttribute("href", "/#cta");
    });
  });

  describe("SaaS tab (default)", () => {
    it("should render Continue with GitHub button", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /Continue with GitHub/i })).toBeInTheDocument();
    });

    it("should render secondary provider buttons with Soon badge", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /GitLab.*Soon/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bitbucket.*Soon/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Azure DevOps.*Soon/i })).toBeInTheDocument();
    });

    it("should render the or continue with divider", () => {
      renderLogin();
      expect(screen.getByText("or continue with")).toBeInTheDocument();
    });

    it("should not render the instance URL input on Cloud tab", () => {
      renderLogin();
      expect(screen.queryByLabelText("Instance URL")).not.toBeInTheDocument();
    });
  });

  describe("Self-Hosted tab", () => {
    it("should show instance URL input when Self-Hosted tab is selected", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: "Self-Hosted" }));
      expect(screen.getByLabelText("Instance URL")).toBeInTheDocument();
    });

    it("should show self-hosted provider names", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: "Self-Hosted" }));
      expect(
        screen.getByRole("button", { name: /Continue with GitHub Enterprise/i })
      ).toBeInTheDocument();
    });

    it("should allow typing an instance URL", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "https://git.company.com" } });
      expect(input).toHaveValue("https://git.company.com");
    });
  });

  describe("provider click", () => {
    it("should call getLoginUrl and window.location.assign when GitHub is clicked", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub/i }));
      expect(mockGetLoginUrl).toHaveBeenCalledWith("github");
      expect(mockAssign).toHaveBeenCalledWith("https://api.test/auth/login/github");
    });

    it("should pass instance URL to getLoginUrl on self-hosted tab", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "https://git.company.com" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(mockGetLoginUrl).toHaveBeenCalledWith("github", "https://git.company.com");
    });

    it("should not trigger provider click on comingSoon providers", () => {
      renderLogin();
      const gitlabButton = screen.getByRole("button", { name: /GitLab.*Soon/i });
      fireEvent.click(gitlabButton);
      expect(mockAssign).not.toHaveBeenCalled();
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

  describe("left panel content", () => {
    it("should render the Kenchi logo text", () => {
      renderLogin();
      expect(screen.getByText("Kenchi")).toBeInTheDocument();
    });

    it("should render the headline", () => {
      renderLogin();
      expect(
        screen.getByRole("heading", { level: 2, name: /Stop debugging CI failures manually/i })
      ).toBeInTheDocument();
    });

    it("should render feature callouts", () => {
      renderLogin();
      expect(screen.getByText("Instant CI/CD failure analysis")).toBeInTheDocument();
      expect(screen.getByText("AI-powered root cause detection")).toBeInTheDocument();
      expect(screen.getByText("PR risk assessment & scoring")).toBeInTheDocument();
      expect(screen.getByText("Team analytics & insights")).toBeInTheDocument();
    });

    it("should render stats", () => {
      renderLogin();
      expect(screen.getByText("93%")).toBeInTheDocument();
      expect(screen.getByText("Root cause accuracy")).toBeInTheDocument();
      expect(screen.getByText("12min")).toBeInTheDocument();
      expect(screen.getByText("6hrs")).toBeInTheDocument();
    });

    it("should render the testimonial", () => {
      renderLogin();
      expect(screen.getByText(/cut our CI debugging time by 80%/i)).toBeInTheDocument();
      expect(screen.getByText("James K.")).toBeInTheDocument();
    });

    it("should render trusted by company names", () => {
      renderLogin();
      expect(screen.getByText("Vercel")).toBeInTheDocument();
      expect(screen.getByText("CircleCI")).toBeInTheDocument();
    });
  });
});
