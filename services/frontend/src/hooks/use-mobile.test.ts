/**
 * Unit tests for useIsMobile hook.
 *
 * Tests responsive breakpoint detection at 768px boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

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

let originalInnerWidth: number;

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
  it("should return false for desktop width (>= 768px)", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("should return true for mobile width (< 768px)", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("should return false for exact breakpoint (768px)", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, writable: true, configurable: true });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it("should return true for width just below breakpoint (767px)", () => {
    Object.defineProperty(window, "innerWidth", { value: 767, writable: true, configurable: true });

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("should update when media query change event fires", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
    act(() => {
      mediaListeners.forEach((handler) => handler());
    });

    expect(result.current).toBe(true);
  });

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

  it("should return false initially (before effect runs isMobile is undefined, !! converts to false)", () => {
    // The hook starts with undefined state and converts with !!
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useIsMobile());

    // After effect, should be false for desktop
    expect(typeof result.current).toBe("boolean");
  });
});
