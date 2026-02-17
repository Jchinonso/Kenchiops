/**
 * Integrations Section Tests
 *
 * Verifies active integration cards and coming-soon items render correctly.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Integrations from "@/sections/Integrations";

describe("Integrations", () => {
  it("should render the section with correct aria-label", () => {
    render(<Integrations />);
    expect(screen.getByRole("region", { name: "Integrations" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<Integrations />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Works Where You Work" })
    ).toBeInTheDocument();
  });

  it("should render the section description", () => {
    render(<Integrations />);
    expect(
      screen.getByText(/Kenchi plugs into your existing CI\/CD workflow/i)
    ).toBeInTheDocument();
  });

  it("should render all active integration names", () => {
    render(<Integrations />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
  });

  it("should render active integration descriptions", () => {
    render(<Integrations />);
    expect(screen.getByText("PR comments, check runs, CI failure detection")).toBeInTheDocument();
    expect(screen.getByText("Real-time alerts and failure notifications")).toBeInTheDocument();
    expect(screen.getByText("Multi-model AI backbone for analysis")).toBeInTheDocument();
  });

  it("should render Coming Soon label", () => {
    render(<Integrations />);
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("should render all coming-soon integration names", () => {
    render(<Integrations />);
    const comingSoon = ["GitLab", "Bitbucket", "Teams", "Discord", "Datadog", "PagerDuty"];
    comingSoon.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });
});
