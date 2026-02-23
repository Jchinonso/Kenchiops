/**
 * Stats Section Tests
 *
 * Verifies the stats callout section renders all stat values,
 * labels, and optional sublabels.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Stats from "@/sections/Stats";

describe("Stats", () => {
  it("should render the section with correct aria-label", () => {
    render(<Stats />);
    expect(screen.getByRole("region", { name: "Platform statistics" })).toBeInTheDocument();
  });

  it("should render the section heading", () => {
    render(<Stats />);
    expect(
      screen.getByRole("heading", { level: 2, name: /How Kenchi Transforms/i })
    ).toBeInTheDocument();
  });

  it("should render all stat values", () => {
    render(<Stats />);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("10K+")).toBeInTheDocument();
    expect(screen.getByText("<2min")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
  });

  it("should render all stat labels", () => {
    render(<Stats />);
    expect(screen.getByText("Faster Failure Resolution")).toBeInTheDocument();
    expect(screen.getByText("CI Failures Analyzed")).toBeInTheDocument();
    expect(screen.getByText("Average Analysis Time")).toBeInTheDocument();
    expect(screen.getByText("Root Cause Accuracy")).toBeInTheDocument();
  });

  it("should render sublabel for stat with sublabel", () => {
    render(<Stats />);
    expect(screen.getByText("Confidence-scored diagnostics")).toBeInTheDocument();
  });
});
