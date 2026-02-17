/**
 * Vitest Test Setup
 *
 * Configures jsdom environment, extends expect matchers with
 * @testing-library/jest-dom, and provides global mocks for
 * browser APIs not available in jsdom.
 */

import "@testing-library/jest-dom/vitest";

// ==================== Browser API Mocks ====================

/**
 * Mock matchMedia for hooks that depend on media queries
 * (useIsMobile, useTheme system preference detection).
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

/**
 * Mock IntersectionObserver for components that use lazy loading
 * or scroll-based visibility detection.
 */
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe() {
    /* no-op mock */
  }
  unobserve() {
    /* no-op mock */
  }
  disconnect() {
    /* no-op mock */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

/**
 * Mock ResizeObserver for components using size-aware layouts.
 */
class MockResizeObserver {
  observe() {
    /* no-op mock */
  }
  unobserve() {
    /* no-op mock */
  }
  disconnect() {
    /* no-op mock */
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

/**
 * Suppress React act() warnings in test output for cleaner logs.
 * These warnings are informational, not errors, in testing-library.
 */
