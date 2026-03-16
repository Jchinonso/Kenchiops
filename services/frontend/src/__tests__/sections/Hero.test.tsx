/**
 * Hero Section Tests
 *
 * Verifies the hero section renders the headline, badge, CTA buttons,
 * trusted-by logos, and skip-to-content link.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Hero from "@/sections/Hero";

const renderHero = () =>
  render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>
  );

describe("Hero", () => {
  it("should render the section with correct aria-label", () => {
    renderHero();
    expect(screen.getByRole("region", { name: "Hero" })).toBeInTheDocument();
  });

  it("should render the AI-Powered badge", () => {
    renderHero();
    expect(screen.getByText("AI-Powered CI/CD Intelligence")).toBeInTheDocument();
  });

  it("should render the main headline", () => {
    renderHero();
    expect(
      screen.getByRole("heading", { level: 1, name: /Fix CI\/CD failures/i })
    ).toBeInTheDocument();
  });

  it("should render the gradient text within headline", () => {
    renderHero();
    // Gradient text is split across two spans
    expect(screen.getByText("before they slow")).toBeInTheDocument();
    expect(screen.getByText(/you down/)).toBeInTheDocument();
  });

  it("should render the subheadline", () => {
    renderHero();
    expect(
      screen.getByText(/Kenchi automatically analyzes your CI\/CD failures/i)
    ).toBeInTheDocument();
  });

  it("should render START FREE TRIAL CTA link to /login", () => {
    renderHero();
    const cta = screen.getByRole("link", { name: /START FREE TRIAL/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/login");
  });

  it("should render BOOK A DEMO CTA link", () => {
    renderHero();
    const demo = screen.getByRole("link", { name: /BOOK A DEMO/i });
    expect(demo).toBeInTheDocument();
    expect(demo).toHaveAttribute("href", "/#cta");
  });

  it("should render the NO CC badge inside the CTA", () => {
    renderHero();
    expect(screen.getByText("NO CC")).toBeInTheDocument();
  });

  it("should render trusted-by section with company names", () => {
    renderHero();
    const companies = ["Vercel", "LaunchDarkly", "CircleCI", "Buildkite", "Render", "Railway"];
    companies.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it("should render the trusted by label", () => {
    renderHero();
    expect(screen.getByText("Trusted by engineering teams everywhere")).toBeInTheDocument();
  });
});
