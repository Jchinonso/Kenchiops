/**
 * Unit tests for useNotificationPreferences hook.
 *
 * Tests notification preference management including:
 * - Loading defaults when no stored preferences
 * - Loading from localStorage
 * - Merging partial stored preferences with defaults
 * - Handling corrupt JSON in localStorage
 * - Toggling toast notifications on/off
 * - Enabling browser notifications (with Notification API permission)
 * - Handling permission denial
 * - Disabling browser notifications without requesting permission
 * - Handling missing Notification API
 * - localStorage persistence on every change
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";

// ==================== Setup ====================

const STORAGE_KEY = "kenchi_notification_prefs";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== Tests ====================

describe("useNotificationPreferences", () => {
  describe("initial state", () => {
    it("should return default preferences when nothing is stored", () => {
      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(true);
      expect(result.current.browserEnabled).toBe(false);
    });

    it("should load stored preferences from localStorage", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ toastEnabled: false, browserEnabled: true })
      );

      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(false);
      expect(result.current.browserEnabled).toBe(true);
    });

    it("should merge partial stored preferences with defaults", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ toastEnabled: false }));

      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(false);
      expect(result.current.browserEnabled).toBe(false); // default
    });

    it("should merge partial stored preferences (only browserEnabled)", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ browserEnabled: true }));

      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(true); // default
      expect(result.current.browserEnabled).toBe(true);
    });

    it("should return defaults when localStorage contains invalid JSON", () => {
      localStorage.setItem(STORAGE_KEY, "not-json{");

      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(true);
      expect(result.current.browserEnabled).toBe(false);
    });

    it("should return defaults when localStorage contains empty string", () => {
      localStorage.setItem(STORAGE_KEY, "");

      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(true);
      expect(result.current.browserEnabled).toBe(false);
    });

    it("should handle null stored value (key not set)", () => {
      // localStorage.getItem returns null for unset keys
      const { result } = renderHook(() => useNotificationPreferences());

      expect(result.current.toastEnabled).toBe(true);
      expect(result.current.browserEnabled).toBe(false);
    });
  });

  describe("setToastEnabled", () => {
    it("should disable toast and persist to localStorage", () => {
      const { result } = renderHook(() => useNotificationPreferences());

      act(() => {
        result.current.setToastEnabled(false);
      });

      expect(result.current.toastEnabled).toBe(false);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.toastEnabled).toBe(false);
    });

    it("should enable toast and persist", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ toastEnabled: false, browserEnabled: false })
      );
      const { result } = renderHook(() => useNotificationPreferences());

      act(() => {
        result.current.setToastEnabled(true);
      });

      expect(result.current.toastEnabled).toBe(true);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.toastEnabled).toBe(true);
    });

    it("should not affect browserEnabled when changing toastEnabled", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ toastEnabled: true, browserEnabled: true })
      );
      const { result } = renderHook(() => useNotificationPreferences());

      act(() => {
        result.current.setToastEnabled(false);
      });

      expect(result.current.toastEnabled).toBe(false);
      expect(result.current.browserEnabled).toBe(true); // unchanged
    });

    it("should handle multiple rapid toggle calls", () => {
      const { result } = renderHook(() => useNotificationPreferences());

      act(() => {
        result.current.setToastEnabled(false);
      });
      act(() => {
        result.current.setToastEnabled(true);
      });
      act(() => {
        result.current.setToastEnabled(false);
      });

      expect(result.current.toastEnabled).toBe(false);
    });
  });

  describe("setBrowserEnabled", () => {
    it("should enable browser notifications when permission is granted", async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue("granted");
      Object.defineProperty(window, "Notification", {
        value: { requestPermission: mockRequestPermission, permission: "default" },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      expect(mockRequestPermission).toHaveBeenCalledOnce();
      expect(result.current.browserEnabled).toBe(true);
    });

    it("should not enable browser notifications when permission is denied", async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue("denied");
      Object.defineProperty(window, "Notification", {
        value: { requestPermission: mockRequestPermission, permission: "default" },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      expect(mockRequestPermission).toHaveBeenCalledOnce();
      expect(result.current.browserEnabled).toBe(false);
    });

    it("should not enable browser notifications when permission is 'default' (dismissed)", async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue("default");
      Object.defineProperty(window, "Notification", {
        value: { requestPermission: mockRequestPermission, permission: "default" },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      expect(result.current.browserEnabled).toBe(false);
    });

    it("should disable browser notifications without requesting permission", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ toastEnabled: true, browserEnabled: true })
      );

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(false);
      });

      expect(result.current.browserEnabled).toBe(false);
    });

    it("should handle missing Notification API gracefully when enabling", async () => {
      // Ensure Notification is undefined
      const originalNotification = (window as Record<string, unknown>).Notification;
      delete (window as Record<string, unknown>).Notification;

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      // Should enable since we skip the permission check when API is missing
      expect(result.current.browserEnabled).toBe(true);

      // Restore
      if (originalNotification) {
        (window as Record<string, unknown>).Notification = originalNotification;
      }
    });

    it("should persist browser enabled state to localStorage", async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue("granted");
      Object.defineProperty(window, "Notification", {
        value: { requestPermission: mockRequestPermission, permission: "default" },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.browserEnabled).toBe(true);
    });

    it("should not affect toastEnabled when changing browserEnabled", async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue("granted");
      Object.defineProperty(window, "Notification", {
        value: { requestPermission: mockRequestPermission },
        writable: true,
        configurable: true,
      });

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ toastEnabled: false, browserEnabled: false })
      );
      const { result } = renderHook(() => useNotificationPreferences());

      await act(async () => {
        await result.current.setBrowserEnabled(true);
      });

      expect(result.current.toastEnabled).toBe(false); // unchanged
      expect(result.current.browserEnabled).toBe(true);
    });
  });
});
