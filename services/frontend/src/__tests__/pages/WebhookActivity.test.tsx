/**
 * WebhookActivity Page Tests
 *
 * Verifies the webhook activity page renders loading, error, empty,
 * and populated states with status filter and sorting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { WebhookActivity } from "@/pages/WebhookActivity";

const mockUseWebhookActivity = vi.fn();

vi.mock("@/hooks/useDashboardData", () => ({
  useWebhookActivity: (...args: unknown[]) => mockUseWebhookActivity(...args),
}));

const createWebhookRecord = (overrides = {}) => ({
  id: "wh-1",
  deliveryId: "delivery-abc-123",
  eventType: "check_run.completed",
  source: "github",
  status: "processed",
  processingTimeMs: 450,
  errorMessage: null,
  metadata: {},
  createdAt: "2026-02-17T10:00:00Z",
  ...overrides,
});

const renderWebhookActivity = (refreshKey = 0) =>
  render(
    <MemoryRouter>
      <WebhookActivity refreshKey={refreshKey} />
    </MemoryRouter>
  );

describe("WebhookActivity", () => {
  beforeEach(() => {
    mockUseWebhookActivity.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("should render the page title", () => {
    renderWebhookActivity();
    expect(screen.getByRole("heading", { level: 1, name: "Webhook Activity" })).toBeInTheDocument();
  });

  it("should render the page subtitle", () => {
    renderWebhookActivity();
    expect(screen.getByText(/Incoming webhook deliveries/i)).toBeInTheDocument();
  });

  it("should render status filter buttons", () => {
    renderWebhookActivity();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Processed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skipped" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignored" })).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should render skeleton when loading", () => {
      mockUseWebhookActivity.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      const { container } = renderWebhookActivity();
      // TableSkeleton is rendered
      expect(
        container.querySelector("table") || container.querySelector("[data-slot='skeleton']")
      ).toBeTruthy();
    });
  });

  describe("error state", () => {
    it("should render the error message", () => {
      mockUseWebhookActivity.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed to load webhook activity",
        refetch: vi.fn(),
      });
      renderWebhookActivity();
      expect(screen.getByText("Failed to load webhook activity")).toBeInTheDocument();
    });

    it("should render a retry button", () => {
      const mockRefetch = vi.fn();
      mockUseWebhookActivity.mockReturnValue({
        data: null,
        isLoading: false,
        error: "Failed",
        refetch: mockRefetch,
      });
      renderWebhookActivity();
      const retryButton = screen.getByRole("button", { name: /Retry/i });
      fireEvent.click(retryButton);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no webhook activity", () => {
      mockUseWebhookActivity.mockReturnValue({
        data: { items: [], total: 0, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWebhookActivity();
      expect(screen.getByText("No webhook activity yet")).toBeInTheDocument();
    });
  });

  describe("with data", () => {
    const record1 = createWebhookRecord();
    const record2 = createWebhookRecord({
      id: "wh-2",
      deliveryId: "delivery-def-456",
      eventType: "push",
      status: "failed",
      processingTimeMs: 1200,
      errorMessage: "Signature verification failed",
    });

    beforeEach(() => {
      mockUseWebhookActivity.mockReturnValue({
        data: { items: [record1, record2], total: 2, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("should render the total deliveries count", () => {
      renderWebhookActivity();
      expect(screen.getByText("2 total deliveries")).toBeInTheDocument();
    });

    it("should render delivery IDs", () => {
      renderWebhookActivity();
      expect(screen.getByText("delivery-abc-123")).toBeInTheDocument();
      expect(screen.getByText("delivery-def-456")).toBeInTheDocument();
    });

    it("should render event types", () => {
      renderWebhookActivity();
      expect(screen.getByText("check_run.completed")).toBeInTheDocument();
      expect(screen.getByText("push")).toBeInTheDocument();
    });

    it("should render source names", () => {
      renderWebhookActivity();
      const githubTexts = screen.getAllByText("Github");
      expect(githubTexts.length).toBeGreaterThanOrEqual(2);
    });

    it("should render status badges", () => {
      renderWebhookActivity();
      // "Processed" and "Failed" appear in both filter buttons and table badges
      const processedTexts = screen.getAllByText("Processed");
      expect(processedTexts.length).toBeGreaterThanOrEqual(2);
      const failedTexts = screen.getAllByText("Failed");
      expect(failedTexts.length).toBeGreaterThanOrEqual(2);
    });

    it("should render formatted durations", () => {
      renderWebhookActivity();
      expect(screen.getByText("450ms")).toBeInTheDocument();
      expect(screen.getByText("1.2s")).toBeInTheDocument();
    });

    it("should show singular form for 1 delivery", () => {
      mockUseWebhookActivity.mockReturnValue({
        data: { items: [record1], total: 1, limit: 20, offset: 0 },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
      renderWebhookActivity();
      expect(screen.getByText("1 total delivery")).toBeInTheDocument();
    });
  });

  describe("status filter", () => {
    it("should highlight the active filter button", () => {
      renderWebhookActivity();
      const allButton = screen.getByRole("button", { name: "All" });
      // The "All" button should be initially active (default statusFilter is "")
      expect(allButton.className).toContain("indigo");
    });

    it("should allow clicking a filter button", () => {
      renderWebhookActivity();
      fireEvent.click(screen.getByRole("button", { name: "Processed" }));
      // After click, "Processed" should be the active filter
      const processedButton = screen.getByRole("button", { name: "Processed" });
      expect(processedButton.className).toContain("indigo");
    });
  });
});
