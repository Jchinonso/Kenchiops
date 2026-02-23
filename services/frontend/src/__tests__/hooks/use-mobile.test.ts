/**
 * Unit tests for useIsMobile hook.
 *
 * Tests responsive breakpoint detection at 768px boundary.
 *
 * Code paths covered:
 * - Initial state: undefined converted to false via !!
 * - Desktop width (>= 768px) returns false
 * - Mobile width (< 768px) returns true
 * - Exact breakpoint (768px) returns false
 * - Just below breakpoint (767px) returns true
 * - Media query change event updates state
 * - Cleanup removes listener on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

// ==================== Setup ====================

type MediaChangeHandler = () => void;
const mediaListeners: MediaChangeHandler[] = [];

const createMockMatchMedia = () =>
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_event: string, handler: MediaChangeHandler) => {
      mediaListeners.push(handler);
    },
    removeEventListener: (_event: string, handler: MediaChangeHandler) => {
      const idx = mediaListeners.indexOf(handler);
      if (idx >= 0) mediaListeners.splice(idx, 1);
    },
    dispatchEvent: vi.fn(),
  }));

// let: save/restore pattern for window.innerWidth
let originalInnerWidth: number; // let: must be captured before test modifies it

beforeEach(() => {
  mediaListeners.length = 0;
  window.matchMedia = createMockMatchMedia();
  originalInnerWidth = window.innerWidth;
});

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    value: originalInnerWidth,
    writable: true,
    configurable: true,
  });
  vi.restoreAllMocks();
});

// ==================== Tests ====================

describe("useIsMobile", () => {
  describe("desktop widths", () => {
    it("should return false for desktop width (1024px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it("should return false for large desktop width (1920px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1920,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });
  });

  describe("mobile widths", () => {
    it("should return true for mobile width (375px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });

    it("should return true for very small width (320px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 320,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });
  });

  describe("breakpoint boundary", () => {
    it("should return false for exact breakpoint (768px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 768,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it("should return true for width just below breakpoint (767px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 767,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });

    it("should return false for width just above breakpoint (769px)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 769,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });
  });

  describe("media query change", () => {
    it("should update when media query change fires (desktop to mobile)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);

      // Simulate resize to mobile
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      });
      act(() => {
        mediaListeners.forEach((handler) => handler());
      });

      expect(result.current).toBe(true);
    });

    it("should update when media query change fires (mobile to desktop)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 375,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);

      // Simulate resize to desktop
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });
      act(() => {
        mediaListeners.forEach((handler) => handler());
      });

      expect(result.current).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should clean up listener on unmount", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });

      const { unmount } = renderHook(() => useIsMobile());
      const listenerCount = mediaListeners.length;

      unmount();

      expect(mediaListeners.length).toBeLessThan(listenerCount);
    });
  });

  describe("return type", () => {
    it("should always return a boolean (not undefined)", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(typeof result.current).toBe("boolean");
    });
  });

  describe("matchMedia query string", () => {
    it("should create matchMedia with max-width: 767px query", () => {
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        writable: true,
        configurable: true,
      });

      renderHook(() => useIsMobile());

      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    });
  });
});
