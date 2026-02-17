/**
 * Unit tests for DashboardFooter component.
 *
 * Tests the footer rendering including:
 * - External links (Documentation, Support, API Status)
 * - Copyright year
 * - Link attributes (target, rel)
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardFooter } from "./DashboardFooter";

describe("DashboardFooter", () => {
  it("should render all footer links", () => {
    render(<DashboardFooter />);

    expect(screen.getByText("Documentation")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("API Status")).toBeInTheDocument();
  });

  it("should have correct hrefs for footer links", () => {
    render(<DashboardFooter />);

    expect(screen.getByText("Documentation").closest("a")).toHaveAttribute(
      "href",
      "https://docs.kenchi.dev"
    );
    expect(screen.getByText("Support").closest("a")).toHaveAttribute(
      "href",
      "https://github.com/kenchiops/kenchi/issues"
    );
    expect(screen.getByText("API Status").closest("a")).toHaveAttribute(
      "href",
      "https://status.kenchi.dev"
    );
  });

  it("should open links in new tab with security attributes", () => {
    render(<DashboardFooter />);

    const links = screen.getAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("should display the current year in copyright", () => {
    render(<DashboardFooter />);

    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`${currentYear} Kenchi`))).toBeInTheDocument();
  });

  it("should render a footer element", () => {
    const { container } = render(<DashboardFooter />);

    expect(container.querySelector("footer")).toBeInTheDocument();
  });
});
