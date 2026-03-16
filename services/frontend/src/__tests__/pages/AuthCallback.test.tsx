/**
 * AuthCallback Page Tests
 *
 * Verifies the OAuth callback handler shows a loading state,
 * handles error params, validates redirect paths, and navigates
 * to the correct destination.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import AuthCallback from "@/pages/AuthCallback";

// Track navigate calls
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderAuthCallback = (searchParams = "") =>
  render(
    <MemoryRouter initialEntries={[`/oauth/callback${searchParams}`]}>
      <Routes>
        <Route path="/oauth/callback" element={<AuthCallback />} />
      </Routes>
    </MemoryRouter>
  );

describe("AuthCallback", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("should render the page loader", () => {
    // AuthCallback now uses PageLoader — verify the spinning loader renders
    const { container } = renderAuthCallback();
    expect(container.querySelector('[class*="animate-spin"]')).toBeInTheDocument();
  });

  it("should navigate to /dashboard when no params are provided", () => {
    renderAuthCallback();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("should navigate to /login with error when error param is present", () => {
    renderAuthCallback("?error=access_denied");
    expect(mockNavigate).toHaveBeenCalledWith("/login?error=access_denied", { replace: true });
  });

  it("should navigate to redirect_after when valid path is provided", () => {
    renderAuthCallback("?redirect_after=/dashboard/settings");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/settings", { replace: true });
  });

  it("should fall back to /dashboard when redirect_after is protocol-relative", () => {
    renderAuthCallback("?redirect_after=//evil.com");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("should fall back to /dashboard when redirect_after starts with /\\", () => {
    renderAuthCallback("?redirect_after=/\\evil.com");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("should fall back to /dashboard when redirect_after contains colon", () => {
    renderAuthCallback("?redirect_after=javascript:alert(1)");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("should prioritize error param over redirect_after", () => {
    renderAuthCallback("?error=server_error&redirect_after=/dashboard");
    expect(mockNavigate).toHaveBeenCalledWith("/login?error=server_error", { replace: true });
  });

  it("should handle URL-encoded error messages", () => {
    renderAuthCallback("?error=invalid%20scope");
    expect(mockNavigate).toHaveBeenCalledWith("/login?error=invalid%20scope", { replace: true });
  });
});
