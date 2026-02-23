/**
 * Pricing Section Tests
 *
 * Verifies the pricing table renders all three tiers with names,
 * prices, features, CTA buttons, and the "Most Popular" badge.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pricing from "@/sections/Pricing";

const renderPricing = () =>
  render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>
  );

describe("Pricing", () => {
  it("should render the section with correct aria-label", () => {
    renderPricing();
    expect(screen.getByRole("region", { name: "Pricing" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    renderPricing();
    expect(
      screen.getByRole("heading", { level: 2, name: "Simple, Transparent Pricing" })
    ).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    renderPricing();
    expect(screen.getByText(/Start free, upgrade when you need more/i)).toBeInTheDocument();
  });

  it("should render all three tier names", () => {
    renderPricing();
    expect(screen.getByRole("heading", { level: 3, name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Pro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Enterprise" })).toBeInTheDocument();
  });

  it("should render tier prices", () => {
    renderPricing();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("should render tier periods", () => {
    renderPricing();
    expect(screen.getByText("/ forever")).toBeInTheDocument();
    expect(screen.getByText("/ per month / 10 seats")).toBeInTheDocument();
    expect(screen.getByText("/ contact us")).toBeInTheDocument();
  });

  it("should render the Most Popular badge on Pro tier", () => {
    renderPricing();
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
  });

  it("should render CTA buttons for each tier", () => {
    renderPricing();
    expect(screen.getByRole("link", { name: "Get Started Free" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start 14-Day Trial" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact Sales" })).toBeInTheDocument();
  });

  it("should link Free and Pro CTAs to /login", () => {
    renderPricing();
    expect(screen.getByRole("link", { name: "Get Started Free" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("link", { name: "Start 14-Day Trial" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("should link Enterprise CTA to mailto", () => {
    renderPricing();
    const salesLink = screen.getByRole("link", { name: "Contact Sales" });
    expect(salesLink).toHaveAttribute("href", expect.stringContaining("mailto:sales@kenchi.dev"));
  });

  it("should render feature lists for each tier", () => {
    renderPricing();
    expect(screen.getByText("Up to 3 repositories")).toBeInTheDocument();
    expect(screen.getByText("Unlimited repositories")).toBeInTheDocument();
    expect(screen.getByText("Everything in Pro")).toBeInTheDocument();
    expect(screen.getByText("SSO / SAML authentication")).toBeInTheDocument();
  });
});
