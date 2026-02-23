/**
 * Unit tests for useTheme hook.
 *
 * Tests theme preference management including:
 * - Reading stored preference from localStorage
 * - Defaulting to "dark" when nothing stored
 * - Invalid stored values fallback to "dark"
 * - Resolving "system" preference via matchMedia
 * - setTheme updates localStorage, state, and document class
 * - System mode listens for OS preference changes
 * - Cleanup of media query listener on unmount and mode switch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/hooks/useTheme";

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

    it("should read stored 'light' preference from localStorage", () => {
      localStorage.setItem(STORAGE_KEY, "light");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("light");
      expect(result.current.resolved).toBe("light");
    });

    it("should read stored 'dark' preference from localStorage", () => {
      localStorage.setItem(STORAGE_KEY, "dark");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
      expect(result.current.resolved).toBe("dark");
    });

    it("should resolve 'system' preference using matchMedia (dark)", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      window.matchMedia = createMockMatchMedia(true); // system prefers dark

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolved).toBe("dark");
    });

    it("should resolve 'system' preference using matchMedia (light)", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      window.matchMedia = createMockMatchMedia(false); // system prefers light

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("system");
      expect(result.current.resolved).toBe("light");
    });

    it("should ignore invalid stored values and default to 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "invalid-theme");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
    });

    it("should ignore empty string stored value and default to 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
    });

    it("should ignore numeric stored value and default to 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "42");

      const { result } = renderHook(() => useTheme());

      expect(result.current.preference).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("should update preference to light and persist to localStorage", () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("light");
      });

      expect(result.current.preference).toBe("light");
      expect(result.current.resolved).toBe("light");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    });

    it("should update preference to dark and persist", () => {
      localStorage.setItem(STORAGE_KEY, "light");
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("dark");
      });

      expect(result.current.preference).toBe("dark");
      expect(result.current.resolved).toBe("dark");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    });

    it("should update preference to system and persist", () => {
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme("system");
      });

      expect(result.current.preference).toBe("system");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
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

    it("should be a stable callback reference (useCallback)", () => {
      const { result, rerender } = renderHook(() => useTheme());
      const firstSetTheme = result.current.setTheme;

      rerender();

      expect(result.current.setTheme).toBe(firstSetTheme);
    });
  });

  describe("system preference listener", () => {
    it("should register a media query listener when preference is 'system'", () => {
      localStorage.setItem(STORAGE_KEY, "system");

      renderHook(() => useTheme());

      expect(mediaListeners.length).toBeGreaterThan(0);
    });

    it("should not register a media query listener when preference is 'dark'", () => {
      localStorage.setItem(STORAGE_KEY, "dark");

      renderHook(() => useTheme());

      expect(mediaListeners.length).toBe(0);
    });

    it("should not register a media query listener when preference is 'light'", () => {
      localStorage.setItem(STORAGE_KEY, "light");

      renderHook(() => useTheme());

      expect(mediaListeners.length).toBe(0);
    });

    it("should update resolved theme when system preference changes to dark", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      window.matchMedia = createMockMatchMedia(false); // start with light

      const { result } = renderHook(() => useTheme());
      expect(result.current.resolved).toBe("light");

      // Simulate system switching to dark
      window.matchMedia = createMockMatchMedia(true);
      act(() => {
        mediaListeners.forEach((handler) => handler({ matches: true }));
      });

      expect(result.current.resolved).toBe("dark");
    });

    it("should update resolved theme when system preference changes to light", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      window.matchMedia = createMockMatchMedia(true); // start with dark

      const { result } = renderHook(() => useTheme());
      expect(result.current.resolved).toBe("dark");

      // Simulate system switching to light
      window.matchMedia = createMockMatchMedia(false);
      act(() => {
        mediaListeners.forEach((handler) => handler({ matches: false }));
      });

      expect(result.current.resolved).toBe("light");
    });

    it("should clean up listener on unmount", () => {
      localStorage.setItem(STORAGE_KEY, "system");

      const { unmount } = renderHook(() => useTheme());
      const listenerCount = mediaListeners.length;

      unmount();

      expect(mediaListeners.length).toBeLessThan(listenerCount);
    });

    it("should apply document class when system preference changes", () => {
      localStorage.setItem(STORAGE_KEY, "system");
      window.matchMedia = createMockMatchMedia(false);

      renderHook(() => useTheme());

      // Simulate system switching to dark
      window.matchMedia = createMockMatchMedia(true);
      act(() => {
        mediaListeners.forEach((handler) => handler({ matches: true }));
      });

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  describe("document class management", () => {
    it("should apply dark class on mount when preference is dark", () => {
      localStorage.setItem(STORAGE_KEY, "dark");

      renderHook(() => useTheme());

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("should not have dark class on mount when preference is light", () => {
      localStorage.setItem(STORAGE_KEY, "light");

      renderHook(() => useTheme());

      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});
