/**
 * GetStarted Section Tests
 *
 * Verifies the 3-step get-started section renders step numbers,
 * titles, descriptions, and CTA link.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GetStarted from "@/sections/GetStarted";

const renderGetStarted = () =>
  render(
    <MemoryRouter>
      <GetStarted />
    </MemoryRouter>
  );

describe("GetStarted", () => {
  it("should render the section with correct aria-label", () => {
    renderGetStarted();
    expect(screen.getByRole("region", { name: "Get started in 3 steps" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    renderGetStarted();
    expect(
      screen.getByRole("heading", { level: 2, name: "Up and Running in Minutes" })
    ).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    renderGetStarted();
    expect(screen.getByText(/Three steps to your first CI failure analysis/i)).toBeInTheDocument();
  });

  it("should render all three step numbers", () => {
    renderGetStarted();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should render all three step titles", () => {
    renderGetStarted();
    expect(
      screen.getByRole("heading", { level: 3, name: "Connect Your Repo" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Push a Commit" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Get Your First Analysis" })
    ).toBeInTheDocument();
  });

  it("should render step descriptions", () => {
    renderGetStarted();
    expect(screen.getByText(/Install the Kenchi GitHub App in one click/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Kenchi automatically monitors your CI pipelines/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/confidence-scored root cause report/i)).toBeInTheDocument();
  });

  it("should render the CTA link to /login", () => {
    renderGetStarted();
    const cta = screen.getByRole("link", { name: /Get Started/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/login");
  });
});
