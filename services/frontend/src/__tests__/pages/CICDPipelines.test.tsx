/**
 * CICDPipelines Page Tests
 *
 * Verifies the pipelines page renders repository cards,
 * loading skeletons, error state, and empty state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { CICDPipelines } from "@/pages/CICDPipelines";

const mockUseRepositories = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      tenantId: "tenant-1",
      organizations: [{ isSelected: true, provider: "github" }],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useDashboardData", () => ({
  useRepositories: () => mockUseRepositories(),
  useGitLabProjects: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscriptionUsage: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/components/FeatureLocked", () => ({
  FeatureLocked: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PageLoader", () => ({
  PageLoader: () => <div data-testid="page-loader" />,
}));

const renderPipelines = () =>
  render(
    <MemoryRouter>
      <CICDPipelines />
    </MemoryRouter>
  );

const createRepo = (overrides = {}) => ({
  id: 1,
  name: "my-repo",
  fullName: "org/my-repo",
  isPrivate: false,
  defaultBranch: "main",
  ...overrides,
});

describe("CICDPipelines", () => {
  beforeEach(() => {
    mockUseRepositories.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it("should render the page title", () => {
    renderPipelines();
    expect(
      screen.getByRole("heading", { level: 1, name: /Pipelines & Repositories/i })
    ).toBeInTheDocument();
  });

  it("should render the page subtitle", () => {
    renderPipelines();
    expect(
      screen.getByText(/Repositories connected through your GitHub App installation/i)
    ).toBeInTheDocument();
  });

  it("should render the Connected Repositories card title", () => {
    renderPipelines();
    expect(screen.getByText("Connected Repositories")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should render skeleton cards when loading", () => {
      mockUseRepositories.mockReturnValue({ data: null, isLoading: true, error: null });
      const { container } = renderPipelines();
      // Skeleton grid should be rendered (6 skeleton items)
      const skeletons = container.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("error state", () => {
    it("should render the error message", () => {
      mockUseRepositories.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed to fetch repositories",
      });
      renderPipelines();
      expect(screen.getByText("Failed to fetch repositories")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no repositories exist", () => {
      mockUseRepositories.mockReturnValue({ data: [], isLoading: false, error: null });
      renderPipelines();
      expect(screen.getByText("No repositories connected")).toBeInTheDocument();
    });

    it("should show install instructions in empty state", () => {
      mockUseRepositories.mockReturnValue({ data: [], isLoading: false, error: null });
      renderPipelines();
      expect(screen.getByText(/Install the Kenchi GitHub App/i)).toBeInTheDocument();
    });

    it("should show correct description count for no repos", () => {
      mockUseRepositories.mockReturnValue({ data: [], isLoading: false, error: null });
      renderPipelines();
      expect(screen.getByText("No repositories connected yet")).toBeInTheDocument();
    });
  });

  describe("with repositories", () => {
    it("should render repository cards", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo()],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("my-repo")).toBeInTheDocument();
      expect(screen.getByText("org/my-repo")).toBeInTheDocument();
    });

    it("should show Private badge for private repos", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo({ isPrivate: true })],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("Private")).toBeInTheDocument();
    });

    it("should show Public badge for public repos", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo({ isPrivate: false })],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("Public")).toBeInTheDocument();
    });

    it("should show default branch badge", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo({ defaultBranch: "develop" })],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("develop")).toBeInTheDocument();
    });

    it("should show correct count in description", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo(), createRepo({ id: 2, name: "other-repo", fullName: "org/other-repo" })],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("2 repositories connected")).toBeInTheDocument();
    });

    it("should show singular form for single repo", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo()],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      expect(screen.getByText("1 repository connected")).toBeInTheDocument();
    });

    it("should link each repo card to its detail page", () => {
      mockUseRepositories.mockReturnValue({
        data: [createRepo()],
        isLoading: false,
        error: null,
      });
      renderPipelines();
      const link = screen.getByRole("link", { name: /my-repo/i });
      expect(link).toHaveAttribute("href", "/dashboard/cicd/pipelines/org%2Fmy-repo");
    });
  });
});
