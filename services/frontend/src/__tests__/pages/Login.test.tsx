/**
 * Login Page Tests
 *
 * Verifies the login page renders two tabs (Cloud/Self-Hosted),
 * git provider OAuth buttons, feature callouts, stats,
 * instance URL input, handles authenticated redirect,
 * semantic HTML structure, and accessibility attributes.
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

    it("should render Cloud and Self-Hosted tabs", () => {
      renderLogin();
      expect(screen.getByRole("tab", { name: "Cloud" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Self-Hosted" })).toBeInTheDocument();
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

    it("should have a tablist with proper ARIA attributes", () => {
      renderLogin();
      const tablist = screen.getByRole("tablist", { name: "Hosting type" });
      expect(tablist).toBeInTheDocument();

      const cloudTab = screen.getByRole("tab", { name: "Cloud" });
      expect(cloudTab).toHaveAttribute("aria-selected", "true");
      expect(cloudTab).toHaveAttribute("type", "button");

      const selfHostedTab = screen.getByRole("tab", { name: "Self-Hosted" });
      expect(selfHostedTab).toHaveAttribute("aria-selected", "false");
    });

    it("should render a tabpanel for the active tab", () => {
      renderLogin();
      expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    });

    it("should have type=button on provider buttons", () => {
      renderLogin();
      const githubButton = screen.getByRole("button", { name: /Continue with GitHub/i });
      expect(githubButton).toHaveAttribute("type", "button");
    });

    it("should add aria-disabled and aria-label to coming soon providers", () => {
      renderLogin();
      const gitlabButton = screen.getByRole("button", { name: /GitLab.*coming soon/i });
      expect(gitlabButton).toHaveAttribute("aria-disabled", "true");
    });

    it("should not have heading hierarchy violation (no h2 before h1)", () => {
      const { container } = renderLogin();
      const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
      // Only the h1 "Get started" should exist as a heading element
      expect(headings).toHaveLength(1);
      expect(headings[0].tagName).toBe("H1");
    });

    it("should render feature list as <ul> with <li> items", () => {
      renderLogin();
      const featureList = screen.getByRole("list", { name: "Key features" });
      expect(featureList).toBeInTheDocument();
      const items = featureList.querySelectorAll("li");
      expect(items).toHaveLength(4);
    });

    it("should render testimonial as <blockquote>", () => {
      const { container } = renderLogin();
      expect(container.querySelector("blockquote")).toBeInTheDocument();
    });

    it("should render mobile logo (hidden on lg screens)", () => {
      renderLogin();
      const homeLinks = screen.getAllByLabelText("Kenchi home");
      // One in aside (desktop), one in main (mobile)
      expect(homeLinks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("SaaS tab (default)", () => {
    it("should render Continue with GitHub button", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /Continue with GitHub/i })).toBeInTheDocument();
    });

    it("should render secondary provider buttons with Soon badge", () => {
      renderLogin();
      expect(screen.getByRole("button", { name: /GitLab.*coming soon/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Bitbucket.*coming soon/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Azure DevOps.*coming soon/i })
      ).toBeInTheDocument();
    });

    it("should render the or continue with divider", () => {
      renderLogin();
      expect(screen.getByText("or continue with")).toBeInTheDocument();
    });

    it("should not render the instance URL input on Cloud tab", () => {
      renderLogin();
      expect(screen.queryByLabelText("Instance URL")).not.toBeInTheDocument();
    });

    it("should mark Cloud tab as selected", () => {
      renderLogin();
      expect(screen.getByRole("tab", { name: "Cloud" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Self-Hosted" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
    });
  });

  describe("Self-Hosted tab", () => {
    it("should show instance URL input when Self-Hosted tab is selected", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      expect(screen.getByLabelText("Instance URL")).toBeInTheDocument();
    });

    it("should show self-hosted provider names", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      expect(
        screen.getByRole("button", { name: /Continue with GitHub Enterprise/i })
      ).toBeInTheDocument();
    });

    it("should allow typing an instance URL", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "https://git.company.com" } });
      expect(input).toHaveValue("https://git.company.com");
    });

    it("should have required, name, and autocomplete attributes on URL input", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      expect(input).toHaveAttribute("required");
      expect(input).toHaveAttribute("name", "instanceUrl");
      expect(input).toHaveAttribute("autocomplete", "url");
    });

    it("should show validation error when submitting without URL", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(screen.getByText("Instance URL is required")).toBeInTheDocument();
      expect(mockAssign).not.toHaveBeenCalled();
    });

    it("should show validation error for invalid URL", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "not-a-url" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(screen.getByText(/Please enter a valid URL/)).toBeInTheDocument();
      expect(mockAssign).not.toHaveBeenCalled();
    });

    it("should clear URL error when switching back to Cloud tab", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(screen.getByText("Instance URL is required")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Cloud" }));
      expect(screen.queryByText("Instance URL is required")).not.toBeInTheDocument();
    });

    it("should clear URL error when user types in input", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(screen.getByText("Instance URL is required")).toBeInTheDocument();
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "h" } });
      expect(screen.queryByText("Instance URL is required")).not.toBeInTheDocument();
    });

    it("should mark input as aria-invalid when there is an error", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      const input = screen.getByLabelText("Instance URL");
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("should submit form with Enter key via form onSubmit", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "https://git.company.com" } });
      const form = input.closest("form");
      expect(form).toBeInTheDocument();
      fireEvent.submit(form as HTMLFormElement);
      expect(mockGetLoginUrl).toHaveBeenCalledWith("github", "https://git.company.com");
      expect(mockAssign).toHaveBeenCalled();
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
      fireEvent.click(screen.getByRole("tab", { name: "Self-Hosted" }));
      const input = screen.getByLabelText("Instance URL");
      fireEvent.change(input, { target: { value: "https://git.company.com" } });
      fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub Enterprise/i }));
      expect(mockGetLoginUrl).toHaveBeenCalledWith("github", "https://git.company.com");
    });

    it("should not trigger provider click on comingSoon providers", () => {
      renderLogin();
      const gitlabButton = screen.getByRole("button", { name: /GitLab.*coming soon/i });
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
      expect(screen.getByText("Authentication failed: something_else")).toBeInTheDocument();
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

    it("should render the headline as non-heading element", () => {
      renderLogin();
      expect(screen.getByText(/Stop debugging CI failures manually/)).toBeInTheDocument();
      // Verify it's a <p>, not an <h2> (heading hierarchy fix)
      const element = screen.getByText(/Stop debugging CI failures manually/);
      expect(element.tagName).toBe("P");
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
