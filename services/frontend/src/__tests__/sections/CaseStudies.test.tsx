/**
 * CaseStudies Section Tests
 *
 * Verifies case study cards render with company names, metrics,
 * badges, avatars, and CTA links.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CaseStudies from "@/sections/CaseStudies";

const renderCaseStudies = () =>
  render(
    <MemoryRouter>
      <CaseStudies />
    </MemoryRouter>
  );

describe("CaseStudies", () => {
  it("should render the section with correct aria-label", () => {
    renderCaseStudies();
    expect(screen.getByRole("region", { name: "Customer case studies" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    renderCaseStudies();
    expect(
      screen.getByRole("heading", { level: 2, name: "Teams Shipping Faster with Kenchi" })
    ).toBeInTheDocument();
  });

  it("should render all three company names", () => {
    renderCaseStudies();
    expect(screen.getByText("FastShip")).toBeInTheDocument();
    expect(screen.getByText("ScaleOps")).toBeInTheDocument();
    expect(screen.getByText("DeployHQ")).toBeInTheDocument();
  });

  it("should render company badges", () => {
    renderCaseStudies();
    expect(screen.getByText("120-person eng team")).toBeInTheDocument();
    expect(screen.getByText("Series B startup")).toBeInTheDocument();
    expect(screen.getByText("Enterprise, 500+ devs")).toBeInTheDocument();
  });

  it("should render metric values", () => {
    renderCaseStudies();
    expect(screen.getByText("73%")).toBeInTheDocument();
    expect(screen.getByText("6hrs")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("should render metric labels", () => {
    renderCaseStudies();
    expect(screen.getByText("faster CI failure resolution")).toBeInTheDocument();
    expect(screen.getByText("saved per developer per week")).toBeInTheDocument();
    expect(screen.getByText("reduction in mean time to recovery")).toBeInTheDocument();
  });

  it("should render avatar initials", () => {
    renderCaseStudies();
    const initials = ["SC", "JL", "AR", "MK", "DP", "TN", "RW", "EH", "KS"];
    initials.forEach((initial) => {
      expect(screen.getByText(initial)).toBeInTheDocument();
    });
  });

  it("should render READ FULL CASE STUDY links", () => {
    renderCaseStudies();
    const links = screen.getAllByText("READ FULL CASE STUDY");
    expect(links).toHaveLength(3);
  });
});
