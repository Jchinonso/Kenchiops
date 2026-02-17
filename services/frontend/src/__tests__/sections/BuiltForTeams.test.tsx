/**
 * BuiltForTeams Section Tests
 *
 * Verifies the team benefits section renders all six team cards
 * with titles and descriptions.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BuiltForTeams from "@/sections/BuiltForTeams";

describe("BuiltForTeams", () => {
  it("should render the section with correct aria-label", () => {
    render(<BuiltForTeams />);
    expect(screen.getByRole("region", { name: "Built for engineering teams" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<BuiltForTeams />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Built for Every Engineering Team" })
    ).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    render(<BuiltForTeams />);
    expect(screen.getByText(/Whether you run the platform or ship features/i)).toBeInTheDocument();
  });

  it("should render all six team titles", () => {
    render(<BuiltForTeams />);
    const teams = [
      "Platform Engineering",
      "SRE",
      "DevOps",
      "Backend Engineering",
      "Infrastructure",
      "QA & Release",
    ];
    teams.forEach((team) => {
      expect(screen.getByRole("heading", { level: 3, name: team })).toBeInTheDocument();
    });
  });

  it("should render team descriptions", () => {
    render(<BuiltForTeams />);
    expect(screen.getByText(/Keep your CI\/CD infrastructure reliable/i)).toBeInTheDocument();
    expect(screen.getByText(/Reduce MTTR with instant root cause analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/Automate the feedback loop/i)).toBeInTheDocument();
    expect(screen.getByText(/Stop context-switching to debug CI/i)).toBeInTheDocument();
    expect(screen.getByText(/Identify infra-related failures/i)).toBeInTheDocument();
    expect(screen.getByText(/Understand test failures at scale/i)).toBeInTheDocument();
  });
});
