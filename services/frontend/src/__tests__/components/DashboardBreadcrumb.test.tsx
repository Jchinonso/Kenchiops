/**
 * Unit tests for DashboardBreadcrumb component.
 *
 * Tests the path-based breadcrumb navigation for all dashboard sub-pages.
 *
 * Code paths:
 * - /dashboard (overview) shows just "Dashboard" as current page
 * - /dashboard/cicd shows Dashboard link + "CI/CD" as current page
 * - /dashboard/cicd/failures shows Dashboard link + CI/CD link + "Failures" as current page
 * - Unknown segments fall back to URI-decoded segment name
 * - All known segments use SEGMENT_LABELS mapping
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DashboardBreadcrumb } from "@/components/DashboardBreadcrumb";

// Mock shadcn breadcrumb components to render semantic HTML
vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => (
    <nav aria-label="Breadcrumb">{children}</nav>
  ),
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  BreadcrumbLink: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <a>{children}</a>,
  BreadcrumbPage: ({ children }: { children: React.ReactNode }) => (
    <span aria-current="page">{children}</span>
  ),
  BreadcrumbSeparator: () => <span>/</span>,
}));

const renderWithRouter = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DashboardBreadcrumb />
    </MemoryRouter>
  );

describe("DashboardBreadcrumb", () => {
  describe("overview page", () => {
    it("should show 'Dashboard' as the current page on /dashboard", () => {
      renderWithRouter("/dashboard");

      const currentPage = screen.getByText("Dashboard");
      expect(currentPage).toBeInTheDocument();
      expect(currentPage).toHaveAttribute("aria-current", "page");
    });

    it("should not show any separator on the overview page", () => {
      renderWithRouter("/dashboard");

      // No separators on overview (single item)
      expect(screen.queryByText("/")).not.toBeInTheDocument();
    });
  });

  describe("single-level sub-pages", () => {
    it("should show Dashboard as a link and Settings as current page", () => {
      renderWithRouter("/dashboard/settings");

      const dashboardLink = screen.getByText("Dashboard");
      expect(dashboardLink.closest("a")).toHaveAttribute("href", "/dashboard");

      const currentPage = screen.getByText("Settings");
      expect(currentPage).toHaveAttribute("aria-current", "page");
    });

    it("should render a separator between breadcrumb items", () => {
      renderWithRouter("/dashboard/settings");

      expect(screen.getByText("/")).toBeInTheDocument();
    });
  });

  describe("multi-level sub-pages", () => {
    it("should show full path for /dashboard/cicd/failures", () => {
      renderWithRouter("/dashboard/cicd/failures");

      const dashboardLink = screen.getByText("Dashboard");
      expect(dashboardLink.closest("a")).toHaveAttribute("href", "/dashboard");

      const cicdLink = screen.getByText("CI/CD");
      expect(cicdLink.closest("a")).toHaveAttribute("href", "/dashboard/cicd");

      const currentPage = screen.getByText("Failures");
      expect(currentPage).toHaveAttribute("aria-current", "page");
    });

    it("should show full path for /dashboard/cicd/analyses", () => {
      renderWithRouter("/dashboard/cicd/analyses");

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("CI/CD")).toBeInTheDocument();
      expect(screen.getByText("Analyses")).toHaveAttribute("aria-current", "page");
    });

    it("should render multiple separators for deep paths", () => {
      renderWithRouter("/dashboard/cicd/failures");

      const separators = screen.getAllByText("/");
      expect(separators).toHaveLength(2);
    });
  });

  describe("segment label mapping", () => {
    it.each([
      ["/dashboard/cicd", "CI/CD"],
      ["/dashboard/cicd/failures", "Failures"],
      ["/dashboard/cicd/analyses", "Analyses"],
      ["/dashboard/cicd/pipelines", "Pipelines"],
      ["/dashboard/incidents", "Incidents"],
      ["/dashboard/infra", "Infrastructure"],
      ["/dashboard/deployments", "Deployments"],
      ["/dashboard/analytics", "Analytics"],
      ["/dashboard/integrations", "Integrations"],
      ["/dashboard/settings", "Settings"],
    ])("should map segment in %s to '%s'", (path, expectedLabel) => {
      renderWithRouter(path);

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  describe("unknown segments", () => {
    it("should fall back to URI-decoded segment name for unknown paths", () => {
      renderWithRouter("/dashboard/unknown-segment");

      expect(screen.getByText("unknown-segment")).toBeInTheDocument();
    });

    it("should decode URI-encoded segment names", () => {
      renderWithRouter("/dashboard/my%20page");

      expect(screen.getByText("my page")).toBeInTheDocument();
    });
  });

  describe("last crumb is always a page, not a link", () => {
    it("should render the last breadcrumb as a page, not a link", () => {
      renderWithRouter("/dashboard/cicd/failures");

      const failuresPage = screen.getByText("Failures");
      expect(failuresPage).toHaveAttribute("aria-current", "page");
      // Should not be wrapped in an anchor
      expect(failuresPage.closest("a")).toBeNull();
    });
  });
});
