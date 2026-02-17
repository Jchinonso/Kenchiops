/**
 * Unit tests for DashboardFooter component.
 *
 * Tests the footer rendering including:
 * - External links (Documentation, Support, API Status)
 * - Correct hrefs
 * - Link attributes (target="_blank", rel="noopener noreferrer")
 * - Copyright year dynamically uses current year
 * - Renders as a semantic footer element
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardFooter } from "@/components/DashboardFooter";

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

  it("should open all links in new tab with security attributes", () => {
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

  it("should render a semantic footer element", () => {
    const { container } = render(<DashboardFooter />);

    expect(container.querySelector("footer")).toBeInTheDocument();
  });

  it("should render exactly three external links", () => {
    render(<DashboardFooter />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("should include ExternalLink icons alongside each link", () => {
    const { container } = render(<DashboardFooter />);

    // Each link has an inline-flex with gap-1 and an SVG icon
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(3);
  });
});
