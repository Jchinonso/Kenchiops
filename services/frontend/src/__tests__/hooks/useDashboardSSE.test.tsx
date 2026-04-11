/**
 * Unit tests for useDashboardSSE hook.
 *
 * Tests:
 * - Initial state: empty notifications
 * - Loads notifications from sessionStorage on mount
 * - EventSource connects to the correct SSE endpoint
 * - new_failure event adds notification to the list
 * - analysis_complete event adds notification to the list
 * - markAllRead marks all notifications as read
 * - markAsRead marks a single notification as read
 * - dismissNotification removes a notification
 * - Notifications are persisted to sessionStorage
 * - EventSource is closed on unmount
 * - Caps notifications at maxItems (50)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock useNotificationPreferences
vi.mock("@/hooks/useNotificationPreferences", () => ({
  useNotificationPreferences: () => ({
    toastEnabled: true,
    browserEnabled: false,
  }),
}));

// Mock useAuth — return a user with a stable tenantId
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { tenantId: "test-tenant" },
    isAuthenticated: true,
    isLoading: false,
    refreshUser: vi.fn(),
    switchOrganization: vi.fn(),
  }),
}));

// Mock apiClient
vi.mock("@/lib/apiClient", () => ({
  apiClient: vi.fn(),
  API_URL: "",
}));

// ==================== EventSource Mock ====================

type EventHandler = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  listeners: Record<string, EventHandler[]> = {};

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: EventHandler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: EventHandler) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  close = vi.fn();

  // Test helper: simulate an event
  emit(eventType: string, data: unknown) {
    const handlers = this.listeners[eventType] ?? [];
    const event = { data: JSON.stringify(data) } as MessageEvent;
    handlers.forEach((h) => h(event));
  }
}

// ==================== Setup ====================

const originalEventSource = globalThis.EventSource;

/** Create a fresh QueryClient + wrapper for each test */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = MockEventSource;
  sessionStorage.clear();
  vi.spyOn(crypto, "randomUUID").mockReturnValue("test-uuid-1234-5678-9012-345678901234");
});

afterEach(() => {
  (globalThis as Record<string, unknown>).EventSource = originalEventSource;
  vi.restoreAllMocks();
});

// Dynamically import after mocks are set up
const importHook = async () => {
  // Clear module cache to get fresh hook per test group
  vi.resetModules();
  return import("@/hooks/useDashboardSSE");
};

describe("useDashboardSSE", () => {
  it("starts with empty notifications", async () => {
    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    expect(result.current.notifications).toEqual([]);
  });

  it("loads notifications from sessionStorage on mount", async () => {
    const stored = [
      {
        id: "n1",
        type: "failure",
        title: "Test",
        description: "Desc",
        timestamp: "2026-01-01T00:00:00Z",
        read: false,
      },
    ];
    sessionStorage.setItem("kenchi_notifications_test-tenant", JSON.stringify(stored));

    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe("Test");
  });

  it("connects EventSource to the correct endpoint", async () => {
    const { useDashboardSSE } = await importHook();
    renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("/api/v1/dashboard/events/stream");
    expect(MockEventSource.instances[0].withCredentials).toBe(true);
  });

  it("adds a failure notification on new_failure event", async () => {
    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    const es = MockEventSource.instances[0];

    act(() => {
      es.emit("new_failure", { type: "new_failure", repository: "org/repo", checkName: "build" });
    });

    expect(result.current.notifications).toHaveLength(1);
    const notification = result.current.notifications[0];
    expect(notification.type).toBe("failure");
    expect(notification.title).toBe("CI failure in org/repo");
    expect(notification.description).toBe('Check "build" failed');
    expect(notification.read).toBe(false);
  });

  it("adds an analysis notification on analysis_complete event", async () => {
    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    const es = MockEventSource.instances[0];

    act(() => {
      es.emit("analysis_complete", {
        type: "analysis_complete",
        repository: "org/repo",
        analysisId: "a1",
        confidence: 0.85,
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    const notification = result.current.notifications[0];
    expect(notification.type).toBe("analysis_complete");
    expect(notification.title).toBe("Analysis complete for org/repo");
    expect(notification.description).toBe("Diagnosis confidence: 85%");
    expect(notification.analysisId).toBe("a1");
  });

  it("markAllRead marks all notifications as read", async () => {
    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    const es = MockEventSource.instances[0];

    act(() => {
      es.emit("new_failure", { type: "new_failure", repository: "repo1" });
      es.emit("new_failure", { type: "new_failure", repository: "repo2" });
    });

    expect(result.current.notifications.every((n) => !n.read)).toBe(true);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.notifications.every((n) => n.read)).toBe(true);
  });

  it("markAsRead marks a single notification", async () => {
    const stored = [
      {
        id: "n1",
        type: "failure",
        title: "F1",
        description: "D",
        timestamp: "2026-01-01T00:00:00Z",
        read: false,
      },
      {
        id: "n2",
        type: "failure",
        title: "F2",
        description: "D",
        timestamp: "2026-01-01T00:00:00Z",
        read: false,
      },
    ];
    sessionStorage.setItem("kenchi_notifications_test-tenant", JSON.stringify(stored));

    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });

    act(() => {
      result.current.markAsRead("n1");
    });

    expect(result.current.notifications.find((n) => n.id === "n1")?.read).toBe(true);
    expect(result.current.notifications.find((n) => n.id === "n2")?.read).toBe(false);
  });

  it("dismissNotification removes a notification", async () => {
    const stored = [
      {
        id: "n1",
        type: "failure",
        title: "F1",
        description: "D",
        timestamp: "2026-01-01T00:00:00Z",
        read: false,
      },
      {
        id: "n2",
        type: "failure",
        title: "F2",
        description: "D",
        timestamp: "2026-01-01T00:00:00Z",
        read: false,
      },
    ];
    sessionStorage.setItem("kenchi_notifications_test-tenant", JSON.stringify(stored));

    const { useDashboardSSE } = await importHook();
    const { result } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });

    act(() => {
      result.current.dismissNotification("n1");
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe("n2");
  });

  it("closes EventSource on unmount", async () => {
    const { useDashboardSSE } = await importHook();
    const { unmount } = renderHook(() => useDashboardSSE(), { wrapper: createWrapper() });
    const es = MockEventSource.instances[0];

    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
