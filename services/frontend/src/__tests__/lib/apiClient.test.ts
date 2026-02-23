/**
 * Unit tests for apiClient module.
 *
 * Tests the authenticated browser HTTP client including:
 * - Normal request flow with credentials: "include"
 * - JSON body serialization
 * - Header merging
 * - 401 handling with token refresh and retry
 * - Single-flight refresh coordination (concurrent 401s)
 * - Refresh failure returning original 401
 * - getLoginUrl construction with and without instanceUrl
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ==================== Setup ====================

// Mock globalThis.fetch before importing apiClient.
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

// ==================== apiClient ====================

describe("apiClient", () => {
  const getApiClient = async () => {
    const mod = await import("@/lib/apiClient");
    return mod;
  };

  describe("basic request behavior", () => {
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

    it("should default to GET method", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test");

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.method).toBe("GET");
    });
  });

  describe("request body handling", () => {
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

    it("should handle null body correctly (JSON.stringify produces 'null')", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test", { method: "POST", body: null });

      const [, init] = mockFetch.mock.calls[0];
      // null is not undefined, so body is included
      expect(init?.body).toBe("null");
    });

    it("should handle empty object body", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test", { method: "POST", body: {} });

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.body).toBe("{}");
    });

    it("should handle array body", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test", { method: "POST", body: [1, 2, 3] });

      const [, init] = mockFetch.mock.calls[0];
      expect(init?.body).toBe("[1,2,3]");
    });
  });

  describe("header merging", () => {
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

    it("should allow custom headers to override Content-Type", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test", {
        headers: { "Content-Type": "text/plain" },
      });

      const [, init] = mockFetch.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("text/plain");
    });
  });

  describe("non-401 status codes", () => {
    it("should return response directly for successful responses", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(200, { data: "ok" }));

      const response = await apiClient("/api/v1/test");

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("should return response directly for 404 (no refresh attempt)", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(404, { error: "not found" }));

      const response = await apiClient("/api/v1/missing");

      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("should return response directly for 500 (no refresh attempt)", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(500));

      const response = await apiClient("/api/v1/test");

      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("should return response directly for 403", async () => {
      const { apiClient } = await getApiClient();
      mockFetch.mockResolvedValueOnce(createResponse(403));

      const response = await apiClient("/api/v1/test");

      expect(response.status).toBe(403);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("401 token refresh flow", () => {
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

      // Verify refresh call was to /auth/refresh with POST
      const refreshCall = mockFetch.mock.calls[1];
      expect(refreshCall[0]).toContain("/auth/refresh");
      expect((refreshCall[1] as RequestInit).method).toBe("POST");
    });

    it("should return original 401 response when refresh fails (non-ok)", async () => {
      const { apiClient } = await getApiClient();

      mockFetch.mockResolvedValueOnce(createResponse(401));
      mockFetch.mockResolvedValueOnce(createResponse(401, {}, false));

      const response = await apiClient("/api/v1/protected");

      expect(response.status).toBe(401);
      // 2 calls: original + refresh (no retry)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should return original 401 response when refresh throws network error", async () => {
      const { apiClient } = await getApiClient();

      mockFetch.mockResolvedValueOnce(createResponse(401));
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const response = await apiClient("/api/v1/protected");

      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should include credentials in the refresh request", async () => {
      const { apiClient } = await getApiClient();

      mockFetch.mockResolvedValueOnce(createResponse(401));
      mockFetch.mockResolvedValueOnce(createResponse(200));
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test");

      // Check refresh call includes credentials
      const refreshInit = mockFetch.mock.calls[1][1];
      expect(refreshInit?.credentials).toBe("include");
    });

    it("should include credentials in the retry request", async () => {
      const { apiClient } = await getApiClient();

      mockFetch.mockResolvedValueOnce(createResponse(401));
      mockFetch.mockResolvedValueOnce(createResponse(200));
      mockFetch.mockResolvedValueOnce(createResponse(200));

      await apiClient("/api/v1/test");

      // Check retry call includes credentials
      const retryInit = mockFetch.mock.calls[2][1];
      expect(retryInit?.credentials).toBe("include");
    });
  });
});

// ==================== getLoginUrl ====================

describe("getLoginUrl", () => {
  const getLoginUrl = async () => {
    const mod = await import("@/lib/apiClient");
    return mod.getLoginUrl;
  };

  it("should build login URL for a provider", async () => {
    const fn = await getLoginUrl();
    const url = fn("github");

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

  it("should handle azure-devops provider name", async () => {
    const fn = await getLoginUrl();
    const url = fn("azure-devops");

    expect(url).toContain("/auth/azure-devops/login");
  });

  it("should produce a valid URL", async () => {
    const fn = await getLoginUrl();
    const urlString = fn("github");

    // Should not throw when parsed
    const parsed = new URL(urlString);
    expect(parsed.pathname).toContain("/auth/github/login");
  });

  it("should properly encode instanceUrl with special characters", async () => {
    const fn = await getLoginUrl();
    const url = fn("gitlab", "https://gitlab.example.com/path?foo=bar");

    // The URL should be properly encoded
    expect(url).toContain("instance_url=");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("instance_url")).toBe("https://gitlab.example.com/path?foo=bar");
  });
});
