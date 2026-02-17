/**
 * Terms Page Tests
 *
 * Verifies the terms of service page renders the header,
 * back link, all sections, and contact email.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Terms from "@/pages/Terms";

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

const renderTerms = () =>
  render(
    <MemoryRouter>
      <Terms />
    </MemoryRouter>
  );

describe("Terms", () => {
  it("should render the page title", () => {
    renderTerms();
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
  });

  it("should render the last updated date", () => {
    renderTerms();
    expect(screen.getByText("Last updated: February 17, 2026")).toBeInTheDocument();
  });

  it("should render the back to home link", () => {
    renderTerms();
    const backLink = screen.getByRole("link", { name: /Back to home/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("should render all 8 section headings", () => {
    renderTerms();
    const sections = [
      "1. Acceptance of Terms",
      "2. Description of Service",
      "3. User Accounts",
      "4. Acceptable Use",
      "5. Intellectual Property",
      "6. Limitation of Liability",
      "7. Changes to Terms",
      "8. Contact",
    ];
    sections.forEach((section) => {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
    });
  });

  it("should render the contact email link", () => {
    renderTerms();
    const emailLink = screen.getByRole("link", { name: "legal@kenchi.dev" });
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute("href", "mailto:legal@kenchi.dev");
  });

  it("should render key terms content", () => {
    renderTerms();
    expect(screen.getByText(/By accessing or using Kenchi/i)).toBeInTheDocument();
    expect(screen.getByText(/AI-powered root cause analysis/i)).toBeInTheDocument();
  });
});
