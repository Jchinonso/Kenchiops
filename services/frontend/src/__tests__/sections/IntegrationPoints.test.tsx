/**
 * IntegrationPoints Section Tests
 *
 * Verifies the "How Kenchi Works" workflow section renders
 * all four steps with numbers, titles, and descriptions.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import IntegrationPoints from "@/sections/IntegrationPoints";

describe("IntegrationPoints", () => {
  it("should render the section with correct aria-label", () => {
    render(<IntegrationPoints />);
    expect(screen.getByRole("region", { name: "How Kenchi works" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<IntegrationPoints />);
    expect(screen.getByRole("heading", { level: 2, name: "How Kenchi Works" })).toBeInTheDocument();
  });

  it("should render the section subtitle", () => {
    render(<IntegrationPoints />);
    expect(screen.getByText("From failure to fix in minutes, not hours")).toBeInTheDocument();
  });

  it("should render all four step numbers", () => {
    render(<IntegrationPoints />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
  });

  it("should render all four step titles", () => {
    render(<IntegrationPoints />);
    expect(
      screen.getByRole("heading", { level: 3, name: "CI Failure Detected" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Log Analysis" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Root Cause Report" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "PR Comment & Slack Alert" })
    ).toBeInTheDocument();
  });

  it("should render step descriptions", () => {
    render(<IntegrationPoints />);
    expect(screen.getByText(/Kenchi monitors your GitHub Actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Logs are chunked, extracted, and analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence-scored diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText(/Results posted directly to your pull request/i)).toBeInTheDocument();
  });
});
