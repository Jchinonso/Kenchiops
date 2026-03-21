/**
 * Unit tests for usePageContext hook.
 *
 * Tests route pathname parsing into ChatPageContext:
 * - Analysis route with entity ID
 * - Incident route with entity ID
 * - Knowledge-base route (no entity ID)
 * - Failures route (no entity ID)
 * - Overview fallback for unmatched routes
 * - Edge cases: trailing slashes, sub-paths, root dashboard
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock react-router-dom before importing the hook
const mockPathname = vi.fn<() => string>().mockReturnValue("/dashboard");

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname() }),
}));

import { usePageContext } from "./hooks.ts";

// ==================== Tests ====================

describe("usePageContext", () => {
  describe("analysis route", () => {
    it("should return pageType 'analysis' with entityId for /dashboard/cicd/analyses/:id", () => {
      mockPathname.mockReturnValue("/dashboard/cicd/analyses/abc123");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({
        pageType: "analysis",
        entityId: "abc123",
      });
    });

    it("should capture UUID-style entity IDs", () => {
      mockPathname.mockReturnValue("/dashboard/cicd/analyses/550e8400-e29b-41d4-a716-446655440000");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({
        pageType: "analysis",
        entityId: "550e8400-e29b-41d4-a716-446655440000",
      });
    });

    it("should stop capturing at the next path segment", () => {
      mockPathname.mockReturnValue("/dashboard/cicd/analyses/abc123/details");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({
        pageType: "analysis",
        entityId: "abc123",
      });
    });
  });

  describe("incident route", () => {
    it("should return pageType 'incident' with entityId for /dashboard/incidents/:id", () => {
      mockPathname.mockReturnValue("/dashboard/incidents/inc456");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({
        pageType: "incident",
        entityId: "inc456",
      });
    });

    it("should capture numeric entity IDs", () => {
      mockPathname.mockReturnValue("/dashboard/incidents/12345");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({
        pageType: "incident",
        entityId: "12345",
      });
    });
  });

  describe("knowledge-base route", () => {
    it("should return pageType 'knowledge-base' for /dashboard/knowledge-base", () => {
      mockPathname.mockReturnValue("/dashboard/knowledge-base");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "knowledge-base" });
    });

    it("should match sub-paths under knowledge-base", () => {
      mockPathname.mockReturnValue("/dashboard/knowledge-base/articles/42");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "knowledge-base" });
    });
  });

  describe("failures route", () => {
    it("should return pageType 'failures' for /dashboard/cicd/failures", () => {
      mockPathname.mockReturnValue("/dashboard/cicd/failures");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "failures" });
    });

    it("should match sub-paths under failures", () => {
      mockPathname.mockReturnValue("/dashboard/cicd/failures?page=2");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "failures" });
    });
  });

  describe("overview fallback", () => {
    it("should return pageType 'overview' for /dashboard", () => {
      mockPathname.mockReturnValue("/dashboard");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "overview" });
    });

    it("should return pageType 'overview' for /dashboard/settings", () => {
      mockPathname.mockReturnValue("/dashboard/settings");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "overview" });
    });

    it("should return pageType 'overview' for unrecognized dashboard sub-paths", () => {
      mockPathname.mockReturnValue("/dashboard/some-other-page");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "overview" });
    });

    it("should return pageType 'overview' for root path", () => {
      mockPathname.mockReturnValue("/");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "overview" });
    });

    it("should return pageType 'overview' for empty string", () => {
      mockPathname.mockReturnValue("");

      const { result } = renderHook(() => usePageContext());

      expect(result.current).toEqual({ pageType: "overview" });
    });
  });

  describe("route priority", () => {
    it("should match analysis before failures when both prefixes are present", () => {
      // analysis regex runs first, so /dashboard/cicd/analyses/... always wins
      mockPathname.mockReturnValue("/dashboard/cicd/analyses/xyz");

      const { result } = renderHook(() => usePageContext());

      expect(result.current.pageType).toBe("analysis");
    });

    it("should not match /dashboard/cicd/analyses without an ID segment", () => {
      // The regex requires at least one char after the trailing slash
      mockPathname.mockReturnValue("/dashboard/cicd/analyses/");

      const { result } = renderHook(() => usePageContext());

      // Empty string after trailing slash is not captured by [^/]+
      // so it falls through to failures check then overview
      expect(result.current.pageType).toBe("overview");
    });

    it("should not match /dashboard/incidents without an ID segment", () => {
      mockPathname.mockReturnValue("/dashboard/incidents/");

      const { result } = renderHook(() => usePageContext());

      expect(result.current.pageType).toBe("overview");
    });
  });
});
