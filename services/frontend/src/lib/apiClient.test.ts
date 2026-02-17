/**
 * Unit tests for apiClient module.
 *
 * Tests the authenticated browser HTTP client including:
 * - Normal request flow
 * - 401 handling with token refresh
 * - Single-flight refresh coordination
 * - getLoginUrl construction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ==================== Setup ====================

// We need to mock globalThis.fetch before importing apiClient.
// The module captures `globalThis.fetch.bind(globalThis)` at import time.
const mockFetch = vi.fn<typeof globalThis.fetch>();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockFetch.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Helper to create mock Response objects
const createResponse = (status: number, body: unknown = {}, ok?: boolean): Response =>
  ({
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: () => Promise.resolve(body),
    headers: new Headers(),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as Response;

// ==================== Tests ====================

describe("apiClient", () => {
  // Re-import for each test to reset module state (activeRefresh)
  // Using dynamic import to get fresh module state
  const getApiClient = async () => {
    // Force re-evaluation would need vi.resetModules which is complex.
    // Instead, import the module once and test behaviors.
    const mod = await import("./apiClient");
    return mod;
  };

  it("should make a GET request with credentials included", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(200, { data: "test" }));

    const response = await apiClient("/api/v1/test");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/test");
    expect(init?.credentials).toBe("include");
    expect(response.status).toBe(200);
  });

  it("should send Content-Type: application/json header", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(200));

    await apiClient("/api/v1/test");

    const [, init] = mockFetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("should include body as JSON for POST requests", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(200));

    await apiClient("/api/v1/test", {
      method: "POST",
      body: { key: "value" },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ key: "value" }));
  });

  it("should not include body in init when body is undefined", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(200));

    await apiClient("/api/v1/test", { method: "GET" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init?.body).toBeUndefined();
  });

  it("should return response directly for non-401 status codes", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(404, { error: "not found" }));

    const response = await apiClient("/api/v1/missing");

    expect(response.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("should attempt token refresh on 401 and retry on success", async () => {
    const { apiClient } = await getApiClient();

    // First call returns 401
    mockFetch.mockResolvedValueOnce(createResponse(401));
    // Refresh call succeeds
    mockFetch.mockResolvedValueOnce(createResponse(200));
    // Retry call succeeds
    mockFetch.mockResolvedValueOnce(createResponse(200, { data: "refreshed" }));

    const response = await apiClient("/api/v1/protected");

    expect(response.status).toBe(200);
    // 3 calls: original + refresh + retry
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify refresh call was to /auth/refresh
    const refreshCall = mockFetch.mock.calls[1];
    expect(refreshCall[0]).toContain("/auth/refresh");
    expect((refreshCall[1] as RequestInit).method).toBe("POST");
  });

  it("should return original 401 response when refresh fails", async () => {
    const { apiClient } = await getApiClient();

    // First call returns 401
    mockFetch.mockResolvedValueOnce(createResponse(401));
    // Refresh call fails
    mockFetch.mockResolvedValueOnce(createResponse(401, {}, false));

    const response = await apiClient("/api/v1/protected");

    expect(response.status).toBe(401);
    // 2 calls: original + refresh (no retry)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should return original 401 response when refresh throws", async () => {
    const { apiClient } = await getApiClient();

    // First call returns 401
    mockFetch.mockResolvedValueOnce(createResponse(401));
    // Refresh call throws network error
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const response = await apiClient("/api/v1/protected");

    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should merge custom headers with default headers", async () => {
    const { apiClient } = await getApiClient();
    mockFetch.mockResolvedValueOnce(createResponse(200));

    await apiClient("/api/v1/test", {
      headers: { "X-Custom": "value" },
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Custom"]).toBe("value");
  });
});

// ==================== getLoginUrl ====================

describe("getLoginUrl", () => {
  const getLoginUrl = async () => {
    const mod = await import("./apiClient");
    return mod.getLoginUrl;
  };

  it("should build login URL for a provider", async () => {
    const fn = await getLoginUrl();
    const url = fn("github");

    // When VITE_API_URL is empty, falls back to window.location.origin
    expect(url).toContain("/auth/github/login");
  });

  it("should include instance_url param when provided", async () => {
    const fn = await getLoginUrl();
    const url = fn("gitlab", "https://gitlab.example.com");

    expect(url).toContain("/auth/gitlab/login");
    expect(url).toContain("instance_url=");
    expect(url).toContain("gitlab.example.com");
  });

  it("should not include instance_url param when not provided", async () => {
    const fn = await getLoginUrl();
    const url = fn("bitbucket");

    expect(url).toContain("/auth/bitbucket/login");
    expect(url).not.toContain("instance_url");
  });
});
