/**
 * Unit tests for ComingSoon component.
 *
 * Tests the placeholder component shown for upcoming features.
 * Verifies content rendering, optional CTA, and navigation links.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComingSoon } from "./ComingSoon";

// Wrapper for components that use React Router
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("ComingSoon", () => {
  const defaultProps = {
    title: "Feature Title",
    description: "This feature is coming soon.",
    icon: <span data-testid="test-icon">Icon</span>,
  };

  it("should render the title and description", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText("Feature Title")).toBeInTheDocument();
    expect(screen.getByText("This feature is coming soon.")).toBeInTheDocument();
  });

  it("should render the icon", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it('should display a "Coming Soon" badge', () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it('should always show "Back to Overview" link', () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    const backLink = screen.getByText("Back to Overview");
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest("a")).toHaveAttribute("href", "/dashboard");
  });

  it("should render CTA button when ctaLabel and ctaHref are provided", () => {
    render(<ComingSoon {...defaultProps} ctaLabel="Learn More" ctaHref="/dashboard/overview" />, {
      wrapper: Wrapper,
    });

    const ctaLink = screen.getByText("Learn More");
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink.closest("a")).toHaveAttribute("href", "/dashboard/overview");
  });

  it("should not render CTA button when ctaLabel is not provided", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.queryByText("Learn More")).not.toBeInTheDocument();
  });

  it("should not render CTA button when ctaHref is not provided", () => {
    render(<ComingSoon {...defaultProps} ctaLabel="Learn More" />, { wrapper: Wrapper });

    expect(screen.queryByText("Learn More")).not.toBeInTheDocument();
  });
});
