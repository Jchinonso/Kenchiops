/**
 * Unit tests for useTheme hook.
 *
 * Tests theme preference management including:
 * - Reading stored preference from localStorage
 * - Resolving system theme via matchMedia
 * - Setting theme updates localStorage and document class
 * - System mode listens for OS preference changes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

// ==================== Setup ====================

const STORAGE_KEY = "kenchi_theme";

// Track matchMedia listeners
type MediaQueryChangeHandler = (event: { matches: boolean }) => void;
const mediaListeners: MediaQueryChangeHandler[] = [];

const createMockMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_event: string, handler: MediaQueryChangeHandler) => {
      mediaListeners.push(handler);
    },
    removeEventListener: (_event: string, handler: MediaQueryChangeHandler) => {
      const idx = mediaListeners.indexOf(handler);
      if (idx >= 0) mediaListeners.splice(idx, 1);
    },
    dispatchEvent: vi.fn(),
  }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mediaListeners.length = 0;
  // Default: system prefers light
  window.matchMedia = createMockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== Tests ====================

describe("useTheme", () => {
  describe("initial state", () => {
    it("should default to 'dark' preference when no stored value", () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
      expect(result.current.resolved).toBe("dark");
    });

    it("should read stored preference from localStorage", () => {
      localStorage.setItem(STORAGE_KEY, "light");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("light");
      expect(result.current.resolved).toBe("light");
    });

    it("should resolve 'system' preference using matchMedia", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      // System prefers dark
      window.matchMedia = createMockMatchMedia(true);

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolved).toBe("dark");
    });

    it("should ignore invalid stored values and default to 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "invalid-theme");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("should update preference and persist to localStorage", () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("light");
      });

      expect(result.current.preference).toBe("light");
      expect(result.current.resolved).toBe("light");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    });

    it("should add 'dark' class to document when setting dark theme", () => {
      localStorage.setItem(STORAGE_KEY, "light");
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("dark");
      });

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("should remove 'dark' class when setting light theme", () => {
      document.documentElement.classList.add("dark");
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("light");
      });

      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("system preference listener", () => {
    it("should register a media query listener when preference is 'system'", () => {
      localStorage.setItem(STORAGE_KEY, "system");

      renderHook(() => useTheme());

      // A listener should have been registered
      expect(mediaListeners.length).toBeGreaterThan(0);
    });

    it("should not register a media query listener when preference is not 'system'", () => {
      localStorage.setItem(STORAGE_KEY, "dark");

      renderHook(() => useTheme());

      expect(mediaListeners.length).toBe(0);
    });

    it("should update resolved theme when system preference changes", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      // Start with light system preference
      window.matchMedia = createMockMatchMedia(false);

      const { result } = renderHook(() => useTheme());

      expect(result.current.resolved).toBe("light");

      // Simulate system switching to dark
      window.matchMedia = createMockMatchMedia(true);
      act(() => {
        mediaListeners.forEach((handler) => handler({ matches: true }));
      });

      expect(result.current.resolved).toBe("dark");
    });

    it("should clean up listener on unmount", () => {
      localStorage.setItem(STORAGE_KEY, "system");

      const { unmount } = renderHook(() => useTheme());
      const listenerCount = mediaListeners.length;

      unmount();

      // Listener should have been removed
      expect(mediaListeners.length).toBeLessThan(listenerCount);
    });
  });
});
