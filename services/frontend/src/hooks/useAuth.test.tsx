/**
 * Unit tests for useAuth hook and AuthProvider.
 *
 * Tests authentication context including:
 * - Loading state while checking auth
 * - Authenticated state after successful /auth/me
 * - Unauthenticated state after failed /auth/me
 * - Logout flow (API call + redirect)
 * - Login URL redirect
 * - Post-logout flag preventing re-authentication
 * - useAuth throws outside provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "./useAuth";
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
  it("should throw when used outside AuthProvider", () => {
    // Suppress console.error from React's error boundary
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    spy.mockRestore();
  });
});

describe("AuthProvider", () => {
  it("should start in loading state", () => {
    // Never resolve the API call to keep loading state
    mockApiClient.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should set user when /auth/me succeeds", async () => {
    mockApiClient.mockResolvedValueOnce(createSuccessResponse(mockUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });

  it("should set unauthenticated when /auth/me fails", async () => {
    mockApiClient.mockResolvedValueOnce(createErrorResponse(401));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should set unauthenticated when /auth/me throws", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
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
  });

  describe("logout", () => {
    it("should call logout API, clear user, set session flag, and redirect", async () => {
      mockApiClient
        .mockResolvedValueOnce(createSuccessResponse(mockUser)) // /auth/me
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

    it("should redirect even when logout API fails", async () => {
      mockApiClient
        .mockResolvedValueOnce(createSuccessResponse(mockUser)) // /auth/me
        .mockRejectedValueOnce(new Error("Network error")); // /auth/logout fails

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.logout();
      });

      // Should still redirect and clear user
      expect(result.current.user).toBeNull();
      expect(mockAssign).toHaveBeenCalledWith("/login");
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
      // Flag should be cleared
      expect(sessionStorage.getItem("kenchi_logged_out")).toBeNull();
    });
  });

  describe("refreshUser", () => {
    it("should fetch user again when refreshUser is called", async () => {
      const updatedUser = { ...mockUser, displayName: "Updated User" };
      mockApiClient
        .mockResolvedValueOnce(createSuccessResponse(mockUser))
        .mockResolvedValueOnce(createSuccessResponse(updatedUser));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user?.displayName).toBe("Test User");
      });

      await act(async () => {
        await result.current.refreshUser();
      });

      expect(result.current.user?.displayName).toBe("Updated User");
    });
  });
});
