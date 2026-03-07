/**
 * Unit tests for useDashboardData hooks.
 *
 * Tests the TanStack Query-based data hooks including:
 *
 * - useTenantInfo: correct path, loading, success, error, refetch
 * - useDashboardStats: correct path construction
 * - useRepositories: correct path construction
 * - useAnalyses: URL building with optional filters
 * - useFailures: URL building with optional filters
 * - useConfidenceDistribution: correct path
 * - useAnalysisDetail: null analysisId disables query (no fetch)
 * - useAnalysisStatusByEvents: POST-based batch lookup, empty eventIds
 * - useConfidenceTrend: URL building with bucket and since params
 * - useWebhookActivity: URL building with source and status params
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ==================== Imports ====================

import {
  useTenantInfo,
  useDashboardStats,
  useRepositories,
  useAnalyses,
  useFailures,
  useConfidenceDistribution,
  useAnalysisDetail,
  useAnalysisStatusByEvents,
  useConfidenceTrend,
  useWebhookActivity,
} from "@/hooks/useDashboardData";

// ==================== Mock apiClient ====================

const mockApiClient = vi.fn();

vi.mock("@/lib/apiClient", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

// ==================== Setup ====================

const createSuccessResponse = (data: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  }) as unknown as Response;

const createErrorResponse = (status: number, message?: string): Response =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve(message ? { error: { message } } : {}),
  }) as unknown as Response;

const createErrorResponseUnparseable = (status: number): Response =>
  ({
    ok: false,
    status,
    json: () => Promise.reject(new Error("Invalid JSON")),
  }) as unknown as Response;

/** Create a fresh QueryClient + wrapper for each test */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  mockApiClient.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== useTenantInfo ====================

describe("useTenantInfo", () => {
  it("should fetch tenant info from correct path", async () => {
    const tenantData = {
      id: "t-1",
      orgName: "acme",
      githubConnected: true,
      slackConnected: false,
      status: "active",
    };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(tenantData));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(tenantData);
    expect(result.current.error).toBeNull();
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/tenant");
  });

  it("should set error on non-ok response with error message", async () => {
    mockApiClient.mockResolvedValueOnce(createErrorResponse(500, "Internal Server Error"));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Internal Server Error");
  });

  it("should set error with status code fallback when response body is not JSON", async () => {
    mockApiClient.mockResolvedValueOnce(createErrorResponseUnparseable(502));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Request failed (502)");
  });

  it("should set error on network failure", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("Network timeout"));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network timeout");
  });
});

// ==================== useDashboardStats ====================

describe("useDashboardStats", () => {
  it("should fetch stats from correct path", async () => {
    const stats = { totalAnalyses: 100, totalFailures: 25, connectedRepos: 5 };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(stats));

    const { result } = renderHook(() => useDashboardStats(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(stats);
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/stats");
  });
});

// ==================== useRepositories ====================

describe("useRepositories", () => {
  it("should fetch repositories from correct path", async () => {
    const repos = [
      { id: 1, name: "repo1", fullName: "org/repo1", isPrivate: false, defaultBranch: "main" },
    ];
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(repos));

    const { result } = renderHook(() => useRepositories(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(repos);
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/repositories");
  });
});

// ==================== useAnalyses ====================

describe("useAnalyses", () => {
  it("should build URL with limit and offset", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useAnalyses({ limit: 20, offset: 0 }), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("/api/v1/dashboard/analyses?");
    expect(calledPath).toContain("limit=20");
    expect(calledPath).toContain("offset=0");
  });

  it("should include repository filter when provided", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useAnalyses({ limit: 10, offset: 0, repository: "org/repo" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("repository=org%2Frepo");
  });

  it("should include minConfidence and maxConfidence filters", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(
      () =>
        useAnalyses({
          limit: 10,
          offset: 0,
          minConfidence: "0.5",
          maxConfidence: "0.9",
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("minConfidence=0.5");
    expect(calledPath).toContain("maxConfidence=0.9");
  });

  it("should include since filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useAnalyses({ limit: 10, offset: 0, since: "2024-01-01" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("since=2024-01-01");
  });

  it("should not include optional filters when undefined", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useAnalyses(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("repository=");
    expect(calledPath).not.toContain("minConfidence=");
    expect(calledPath).not.toContain("maxConfidence=");
    expect(calledPath).not.toContain("since=");
  });

  it("should return paginated result with items", async () => {
    const analysis = {
      id: "a-1",
      eventId: "e-1",
      summary: "Build failed",
      identifiedCause: null,
      diagnosisConfidence: 0.85,
      actionConfidence: null,
      confidenceSignals: null,
      recommendedActions: null,
      fullAnalysis: {},
      tenantId: "t-1",
      modelVersionId: null,
      aggregationKey: "org/repo:abc",
      createdAt: "2024-01-15T10:00:00Z",
    };
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [analysis], total: 1, limit: 20, offset: 0 })
    );

    const { result } = renderHook(() => useAnalyses(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});

// ==================== useFailures ====================

describe("useFailures", () => {
  it("should build URL with limit and offset", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useFailures({ limit: 20, offset: 0 }), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("/api/v1/dashboard/failures?");
    expect(calledPath).toContain("limit=20");
    expect(calledPath).toContain("offset=0");
  });

  it("should include repository filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useFailures({ limit: 10, offset: 0, repository: "org/repo" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("repository=");
  });

  it("should include severity filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useFailures({ limit: 10, offset: 0, severity: "high" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("severity=high");
  });

  it("should include since filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useFailures({ limit: 10, offset: 0, since: "2024-01-01" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("since=2024-01-01");
  });

  it("should not include optional filters when undefined", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useFailures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("repository=");
    expect(calledPath).not.toContain("severity=");
    expect(calledPath).not.toContain("since=");
  });
});

// ==================== useConfidenceDistribution ====================

describe("useConfidenceDistribution", () => {
  it("should fetch from correct path", async () => {
    const buckets = [
      { level: "high", count: 10 },
      { level: "medium", count: 20 },
      { level: "low", count: 5 },
    ];
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(buckets));

    const { result } = renderHook(() => useConfidenceDistribution(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(buckets);
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/stats/confidence-distribution");
  });
});

// ==================== useAnalysisDetail ====================

describe("useAnalysisDetail", () => {
  it("should fetch analysis detail by ID", async () => {
    const analysis = {
      id: "a-1",
      eventId: "e-1",
      summary: "Build failed",
      identifiedCause: "Missing dependency",
      diagnosisConfidence: 0.9,
      actionConfidence: 0.8,
      confidenceSignals: {},
      recommendedActions: ["Install package"],
      fullAnalysis: {},
      tenantId: "t-1",
      modelVersionId: null,
      aggregationKey: "org/repo:abc",
      createdAt: "2024-01-15T10:00:00Z",
    };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(analysis));

    const { result } = renderHook(() => useAnalysisDetail("a-1"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(analysis);
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/analyses/a-1");
  });

  it("should not fetch when analysisId is null", async () => {
    const { result } = renderHook(() => useAnalysisDetail(null), { wrapper: createWrapper() });

    // Should immediately be not loading with no data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    // apiClient should not be called because query is disabled
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("should fetch when analysisId changes from null to a value", async () => {
    const analysis = { id: "a-2", summary: "Test" };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(analysis));

    const { result, rerender } = renderHook(({ id }) => useAnalysisDetail(id), {
      initialProps: { id: null as string | null },
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockApiClient).not.toHaveBeenCalled();

    rerender({ id: "a-2" });

    await waitFor(() => {
      expect(result.current.data).toEqual(analysis);
    });
  });
});

// ==================== useAnalysisStatusByEvents ====================

describe("useAnalysisStatusByEvents", () => {
  it("should POST event IDs and return status map", async () => {
    const statusMap = {
      "e-1": { analysisId: "a-1", confidence: 0.85 },
      "e-2": null,
    };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(statusMap));

    const eventIds = ["e-1", "e-2"];
    const { result } = renderHook(() => useAnalysisStatusByEvents(eventIds), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(statusMap);
    expect(mockApiClient).toHaveBeenCalledWith("/api/v1/dashboard/analyses/by-events", {
      method: "POST",
      body: { eventIds: ["e-1", "e-2"] },
    });
  });

  it("should not fetch when eventIds is empty", async () => {
    const { result } = renderHook(() => useAnalysisStatusByEvents([]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("should handle error response", async () => {
    mockApiClient.mockResolvedValueOnce(createErrorResponse(500));

    const { result } = renderHook(() => useAnalysisStatusByEvents(["e-1"]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("should handle network error", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useAnalysisStatusByEvents(["e-1"]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network failure");
  });
});

// ==================== useConfidenceTrend ====================

describe("useConfidenceTrend", () => {
  it("should build URL with day bucket", async () => {
    mockApiClient.mockResolvedValueOnce(createSuccessResponse([]));

    renderHook(() => useConfidenceTrend("day"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("/api/v1/dashboard/stats/confidence-trend?");
    expect(calledPath).toContain("bucket=day");
  });

  it("should build URL with week bucket", async () => {
    mockApiClient.mockResolvedValueOnce(createSuccessResponse([]));

    renderHook(() => useConfidenceTrend("week"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("bucket=week");
  });

  it("should include since parameter when provided", async () => {
    mockApiClient.mockResolvedValueOnce(createSuccessResponse([]));

    renderHook(() => useConfidenceTrend("day", "2024-01-01"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("since=2024-01-01");
  });

  it("should not include since parameter when not provided", async () => {
    mockApiClient.mockResolvedValueOnce(createSuccessResponse([]));

    renderHook(() => useConfidenceTrend("day"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("since=");
  });

  it("should return trend data", async () => {
    const trend = [
      { date: "2024-01-15", avgConfidence: 0.75, count: 10 },
      { date: "2024-01-16", avgConfidence: 0.82, count: 8 },
    ];
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(trend));

    const { result } = renderHook(() => useConfidenceTrend("day"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(trend);
  });
});

// ==================== useWebhookActivity ====================

describe("useWebhookActivity", () => {
  it("should build URL with limit and offset", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useWebhookActivity({ limit: 20, offset: 0 }), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("/api/v1/dashboard/webhook-activity?");
    expect(calledPath).toContain("limit=20");
    expect(calledPath).toContain("offset=0");
  });

  it("should include source filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useWebhookActivity({ limit: 10, offset: 0, source: "github" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("source=github");
  });

  it("should include status filter", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(() => useWebhookActivity({ limit: 10, offset: 0, status: "processed" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("status=processed");
  });

  it("should not include optional filters when undefined", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 20, offset: 0 })
    );

    renderHook(() => useWebhookActivity({}), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("source=");
    expect(calledPath).not.toContain("status=");
  });

  it("should include both source and status filters", async () => {
    mockApiClient.mockResolvedValueOnce(
      createSuccessResponse({ items: [], total: 0, limit: 10, offset: 0 })
    );

    renderHook(
      () => useWebhookActivity({ limit: 10, offset: 0, source: "slack", status: "failed" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const calledPath = mockApiClient.mock.calls[0][0] as string;
    expect(calledPath).toContain("source=slack");
    expect(calledPath).toContain("status=failed");
  });
});

// ==================== Generic TanStack Query behavior (via useTenantInfo) ====================

describe("TanStack Query behavior", () => {
  it("should provide a refetch function", async () => {
    const data1 = {
      id: "t-1",
      orgName: "acme",
      githubConnected: true,
      slackConnected: false,
      status: "active",
    };
    const data2 = { ...data1, status: "updated" };
    mockApiClient
      .mockResolvedValueOnce(createSuccessResponse(data1))
      .mockResolvedValueOnce(createSuccessResponse(data2));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("active");
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data?.status).toBe("updated");
    });
  });

  it("should handle error response with no error message in body", async () => {
    mockApiClient.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Falls back to "Request failed (400)"
    expect(result.current.error).toBe("Request failed (400)");
  });

  it("should transition from loading to loaded state", async () => {
    const data = {
      id: "t-1",
      orgName: "acme",
      githubConnected: true,
      slackConnected: false,
      status: "active",
    };
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(data));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // After load
    expect(result.current.data).toEqual(data);
    expect(result.current.error).toBeNull();
  });

  it("should clear error on successful refetch", async () => {
    const data = {
      id: "t-1",
      orgName: "acme",
      githubConnected: true,
      slackConnected: false,
      status: "active",
    };
    mockApiClient
      .mockRejectedValueOnce(new Error("First failure"))
      .mockResolvedValueOnce(createSuccessResponse(data));

    const { result } = renderHook(() => useTenantInfo(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.error).toBe("First failure");
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(data);
      expect(result.current.error).toBeNull();
    });
  });
});
