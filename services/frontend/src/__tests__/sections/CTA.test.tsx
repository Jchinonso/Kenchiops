/**
 * CTA Section Tests
 *
 * Verifies the final call-to-action section renders the headline,
 * subtitle, and both CTA buttons.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CTA from "@/sections/CTA";

const renderCTA = () =>
  render(
    <MemoryRouter>
      <CTA />
    </MemoryRouter>
  );

describe("CTA", () => {
  it("should render the section with correct aria-label", () => {
    renderCTA();
    expect(screen.getByRole("region", { name: "Get started" })).toBeInTheDocument();
  });

  it("should render the headline", () => {
    renderCTA();
    expect(
      screen.getByRole("heading", { level: 2, name: "Stop debugging CI failures manually." })
    ).toBeInTheDocument();
  });

  it("should render the subtitle", () => {
    renderCTA();
    expect(screen.getByText(/Free for 14 days\. No credit card needed/i)).toBeInTheDocument();
  });

  it("should render the START 14 DAYS FREE TRIAL link to /login", () => {
    renderCTA();
    const link = screen.getByRole("link", { name: /START 14 DAYS FREE TRIAL/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("should render the SCHEDULE A DEMO link to mailto", () => {
    renderCTA();
    const link = screen.getByRole("link", { name: /SCHEDULE A DEMO/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("mailto:hello@kenchi.dev"));
  });
});
