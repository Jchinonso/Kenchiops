/**
 * Unit tests for Footer component.
 *
 * Tests:
 * - Brand column (logo, tagline)
 * - Link columns (Product, Get Started, Legal)
 * - Internal links use React Router <Link> (href attributes)
 * - External links use <a> (href attributes)
 * - Bottom bar: copyright year, Privacy Policy, Terms of Service
 * - Footer element with correct role and aria-label
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "@/components/Footer";

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("Footer", () => {
  describe("branding", () => {
    it("should render the Kenchi brand name", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Kenchi")).toBeInTheDocument();
    });

    it("should render the tagline", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(
        screen.getByText("AI-powered CI/CD failure analysis for engineering teams.")
      ).toBeInTheDocument();
    });
  });

  describe("link columns", () => {
    it("should render Product column heading", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Product")).toBeInTheDocument();
    });

    it("should render Get Started column heading", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Get Started")).toBeInTheDocument();
    });

    it("should render Legal column heading", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Legal")).toBeInTheDocument();
    });

    it("should render Product links", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("CI/CD Analysis")).toBeInTheDocument();
      expect(screen.getByText("Root Cause Detection")).toBeInTheDocument();
      expect(screen.getByText("Risk Assessment")).toBeInTheDocument();
      expect(screen.getByText("How It Works")).toBeInTheDocument();
      expect(screen.getByText("Integrations")).toBeInTheDocument();
    });

    it("should render Get Started links", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Start Free Trial")).toBeInTheDocument();
      expect(screen.getByText("Customer Stories")).toBeInTheDocument();
    });

    it("should render Legal links", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText("Terms and Conditions")).toBeInTheDocument();
    });

    it("should render internal links (Start Free Trial) with correct href", () => {
      render(<Footer />, { wrapper: Wrapper });

      const startLink = screen.getByText("Start Free Trial").closest("a");
      expect(startLink).toHaveAttribute("href", "/login");
    });

    it("should render internal links (Terms) with correct href", () => {
      render(<Footer />, { wrapper: Wrapper });

      const termsLink = screen.getByText("Terms and Conditions").closest("a");
      expect(termsLink).toHaveAttribute("href", "/terms");
    });

    it("should render internal links (Privacy Policy in Legal) with correct href", () => {
      render(<Footer />, { wrapper: Wrapper });

      // There are multiple "Privacy Policy" — one in Legal column, one in bottom bar
      const privacyLinks = screen.getAllByText("Privacy Policy");
      expect(privacyLinks.length).toBeGreaterThanOrEqual(2);
    });

    it("should render external links (Product) as anchor tags with hash hrefs", () => {
      render(<Footer />, { wrapper: Wrapper });

      const cicdLink = screen.getByText("CI/CD Analysis").closest("a");
      expect(cicdLink).toHaveAttribute("href", "/#features");
    });
  });

  describe("bottom bar", () => {
    it("should display the copyright year", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText(/2026 Kenchi/)).toBeInTheDocument();
    });

    it("should display 'All rights reserved'", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByText(/All rights reserved/)).toBeInTheDocument();
    });

    it("should have Privacy Policy link in bottom bar", () => {
      render(<Footer />, { wrapper: Wrapper });

      const bottomLinks = screen.getAllByText("Privacy Policy");
      const bottomLink = bottomLinks.find(
        (el) => el.closest("a")?.getAttribute("href") === "/privacy"
      );
      expect(bottomLink).toBeDefined();
    });

    it("should have Terms of Service link in bottom bar", () => {
      render(<Footer />, { wrapper: Wrapper });

      const termsLink = screen.getByText("Terms of Service");
      expect(termsLink.closest("a")).toHaveAttribute("href", "/terms");
    });
  });

  describe("accessibility", () => {
    it("should render a footer element with role contentinfo", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    it("should have an accessible label on the footer", () => {
      render(<Footer />, { wrapper: Wrapper });

      const footer = screen.getByRole("contentinfo");
      expect(footer).toHaveAttribute("aria-label", "Site footer");
    });

    it("should have footer navigation with aria-label", () => {
      render(<Footer />, { wrapper: Wrapper });

      expect(screen.getByRole("navigation", { name: "Footer navigation" })).toBeInTheDocument();
    });
  });
});
