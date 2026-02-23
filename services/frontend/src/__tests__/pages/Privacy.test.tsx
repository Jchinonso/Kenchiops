/**
 * Privacy Page Tests
 *
 * Verifies the privacy policy page renders the header,
 * back link, all sections, and contact email.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Privacy from "@/pages/Privacy";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({
    preference: "system",
    resolved: "light",
    setTheme: vi.fn(),
  }),
}));

const renderPrivacy = () =>
  render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>
  );

describe("Privacy", () => {
  it("should render the page title", () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("should render the last updated date", () => {
    renderPrivacy();
    expect(screen.getByText("Last updated: February 17, 2026")).toBeInTheDocument();
  });

  it("should render the back to home link", () => {
    renderPrivacy();
    const backLink = screen.getByRole("link", { name: /Back to home/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("should render all 8 section headings", () => {
    renderPrivacy();
    const sections = [
      "1. Information We Collect",
      "2. How We Use Your Information",
      "3. Data Security",
      "4. Data Retention",
      "5. Third-Party Services",
      "6. Your Rights",
      "7. Cookies",
      "8. Contact",
    ];
    sections.forEach((section) => {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    });
  });

  it("should render the contact email link", () => {
    renderPrivacy();
    const emailLink = screen.getByRole("link", { name: "privacy@kenchi.dev" });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute("href", "mailto:privacy@kenchi.dev");
  });

  it("should render key privacy content", () => {
    renderPrivacy();
    expect(screen.getByText(/we collect information necessary/i)).toBeInTheDocument();
    expect(screen.getByText(/We never store your source code/i)).toBeInTheDocument();
  });
});
