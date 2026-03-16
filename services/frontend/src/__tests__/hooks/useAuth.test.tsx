/**
 * Unit tests for useAuth hook and AuthProvider.
 *
 * Tests authentication context including:
 * - Loading state while checking auth
 * - Authenticated state after successful /auth/me
 * - Unauthenticated state after failed /auth/me (non-ok response)
 * - Unauthenticated state after /auth/me network error
 * - Login flow: redirect via window.location.assign
 * - Login with instanceUrl parameter
 * - Logout flow: API call + clear user + session flag + redirect
 * - Logout with API failure (best-effort)
 * - Post-logout flag preventing re-authentication
 * - refreshUser re-fetches user data
 * - useAuth throws TypeError outside AuthProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { apiClient, getLoginUrl } from "@/lib/apiClient";

// Mock apiClient and getLoginUrl before importing the hook
vi.mock("@/lib/apiClient", () => ({
  apiClient: vi.fn(),
  getLoginUrl: vi.fn((provider: string) => `https://api.test/auth/${provider}/login`),
}));

// ==================== Setup ====================

const mockApiClient = vi.mocked(apiClient);
const mockGetLoginUrl = vi.mocked(getLoginUrl);

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: null,
  role: "member",
  tenantId: "tenant-1",
};

/**
 * The /auth/me endpoint returns { data: { user, organizations, githubOrgAccessUrl } }.
 * mapAuthMeToUser destructures response.data.user, so we must nest accordingly.
 */
const createAuthMeResponse = (user: Record<string, unknown>) =>
  ({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data: { user, organizations: [], githubOrgAccessUrl: null },
      }),
  }) as unknown as Response;

const createSuccessResponse = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  }) as unknown as Response;

const createErrorResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message: "Unauthorized" } }),
  }) as unknown as Response;

// Wrapper for hooks that need AuthProvider
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

// Mock window.location.assign
const mockAssign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();

  // Mock window.location
  Object.defineProperty(window, "location", {
    value: { ...originalLocation, assign: mockAssign, href: "http://localhost:3000/" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

// ==================== Tests ====================

describe("useAuth", () => {
  it("should throw TypeError when used outside AuthProvider", () => {
    // Suppress console.error from React's error boundary
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    spy.mockRestore();
  });

  it("should throw a TypeError specifically (not just any Error)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow(TypeError);

    spy.mockRestore();
  });
});

describe("AuthProvider", () => {
  describe("initial loading state", () => {
    it("should start in loading state", () => {
      // Never resolve the API call to keep loading state
      mockApiClient.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe("successful authentication", () => {
    it("should set user when /auth/me succeeds", async () => {
      mockApiClient.mockResolvedValueOnce(createAuthMeResponse(mockUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toMatchObject(mockUser);
    });

    it("should call /auth/me on mount", async () => {
      mockApiClient.mockResolvedValueOnce(createAuthMeResponse(mockUser));

      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockApiClient).toHaveBeenCalledWith("/auth/me");
      });
    });

    it("should set isAuthenticated to true when user is present", async () => {
      mockApiClient.mockResolvedValueOnce(createAuthMeResponse(mockUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });
    });

    it("should expose all user fields correctly", async () => {
      const fullUser = {
        ...mockUser,
        providers: [{ provider: "github", username: "testuser" }],
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockApiClient.mockResolvedValueOnce(createAuthMeResponse(fullUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user?.providers).toEqual([
          { provider: "github", username: "testuser" },
        ]);
        expect(result.current.user?.createdAt).toBe("2024-01-01T00:00:00Z");
      });
    });
  });

  describe("failed authentication", () => {
    it("should set unauthenticated when /auth/me returns non-ok response", async () => {
      mockApiClient.mockResolvedValueOnce(createErrorResponse(401));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it("should set unauthenticated when /auth/me returns 403", async () => {
      mockApiClient.mockResolvedValueOnce(createErrorResponse(403));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should set unauthenticated when /auth/me throws network error", async () => {
      mockApiClient.mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it("should set unauthenticated when /auth/me throws non-Error", async () => {
      mockApiClient.mockRejectedValueOnce("string error");

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe("login", () => {
    it("should redirect to login URL via window.location.assign", async () => {
      mockApiClient.mockResolvedValueOnce(createErrorResponse(401));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.login("github");
      });

      expect(mockGetLoginUrl).toHaveBeenCalledWith("github", undefined);
      expect(mockAssign).toHaveBeenCalled();
    });

    it("should pass instanceUrl to getLoginUrl", async () => {
      mockApiClient.mockResolvedValueOnce(createErrorResponse(401));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.login("gitlab", "https://gitlab.example.com");
      });

      expect(mockGetLoginUrl).toHaveBeenCalledWith("gitlab", "https://gitlab.example.com");
    });

    it("should handle different provider names", async () => {
      mockApiClient.mockResolvedValueOnce(createErrorResponse(401));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.login("azure-devops");
      });

      expect(mockGetLoginUrl).toHaveBeenCalledWith("azure-devops", undefined);
    });
  });

  describe("logout", () => {
    it("should call logout API, clear user, set session flag, and redirect", async () => {
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser)) // /auth/me
        .mockResolvedValueOnce(createSuccessResponse({})); // /auth/logout

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(sessionStorage.getItem("kenchi_logged_out")).toBe("1");
      expect(mockAssign).toHaveBeenCalledWith("/login");
    });

    it("should call /auth/logout with POST method", async () => {
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser))
        .mockResolvedValueOnce(createSuccessResponse({}));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockApiClient).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    });

    it("should redirect even when logout API fails", async () => {
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser))
        .mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(mockAssign).toHaveBeenCalledWith("/login");
      expect(sessionStorage.getItem("kenchi_logged_out")).toBe("1");
    });
  });

  describe("post-logout behavior", () => {
    it("should skip /auth/me and clear user when logged_out flag is set", async () => {
      sessionStorage.setItem("kenchi_logged_out", "1");

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should not have called apiClient at all
      expect(mockApiClient).not.toHaveBeenCalled();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      // Flag should be cleared after reading
      expect(sessionStorage.getItem("kenchi_logged_out")).toBeNull();
    });
  });

  describe("refreshUser", () => {
    it("should fetch user again when refreshUser is called", async () => {
      const updatedUser = { ...mockUser, displayName: "Updated User" };
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser))
        .mockResolvedValueOnce(createAuthMeResponse(updatedUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user?.displayName).toBe("Test User");
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      expect(result.current.user?.displayName).toBe("Updated User");
    });

    it("should handle refreshUser returning non-ok response", async () => {
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser))
        .mockResolvedValueOnce(createErrorResponse(401));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should handle refreshUser throwing error", async () => {
      mockApiClient
        .mockResolvedValueOnce(createAuthMeResponse(mockUser))
        .mockRejectedValueOnce(new Error("Network failure"));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("context value stability", () => {
    it("should provide isAuthenticated derived from user state", async () => {
      mockApiClient.mockResolvedValueOnce(createAuthMeResponse(mockUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // isAuthenticated should be true when user is non-null
      expect(result.current.user).not.toBeNull();
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
