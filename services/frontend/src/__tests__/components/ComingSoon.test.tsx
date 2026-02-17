/**
 * Unit tests for ComingSoon component.
 *
 * Tests the placeholder component shown for upcoming features.
 * Verifies content rendering, optional CTA, and navigation links.
 *
 * Code paths:
 * - Renders title, description, icon, and "Coming Soon" badge
 * - CTA button shown only when both ctaLabel AND ctaHref provided
 * - "Back to Overview" link always visible
 * - Missing ctaLabel or ctaHref suppresses CTA
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ComingSoon } from "@/components/ComingSoon";

// Mock Badge since it uses Radix UI
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("ComingSoon", () => {
  const defaultProps = {
    title: "Feature Title",
    description: "This feature is coming soon.",
    icon: <span data-testid="test-icon">Icon</span>,
  };

  it("should render the title", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText("Feature Title")).toBeInTheDocument();
  });

  it("should render the description", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText("This feature is coming soon.")).toBeInTheDocument();
  });

  it("should render the icon", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  it("should display a 'Coming Soon' badge", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("should always show 'Back to Overview' link pointing to /dashboard", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    const backLink = screen.getByText("Back to Overview");
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest("a")).toHaveAttribute("href", "/dashboard");
  });

  it("should render CTA button when both ctaLabel and ctaHref are provided", () => {
    render(<ComingSoon {...defaultProps} ctaLabel="Learn More" ctaHref="/dashboard/overview" />, {
      wrapper: Wrapper,
    });

    const ctaLink = screen.getByText("Learn More");
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink.closest("a")).toHaveAttribute("href", "/dashboard/overview");
  });

  it("should not render CTA button when ctaLabel is not provided", () => {
    render(<ComingSoon {...defaultProps} ctaHref="/foo" />, { wrapper: Wrapper });

    // No CTA link besides "Back to Overview"
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1); // only "Back to Overview"
  });

  it("should not render CTA button when ctaHref is not provided", () => {
    render(<ComingSoon {...defaultProps} ctaLabel="Learn More" />, { wrapper: Wrapper });

    expect(screen.queryByText("Learn More")).not.toBeInTheDocument();
  });

  it("should not render CTA button when neither ctaLabel nor ctaHref are provided", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1); // only "Back to Overview"
  });

  it("should render the title as an h2 heading", () => {
    render(<ComingSoon {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Feature Title");
  });
});
