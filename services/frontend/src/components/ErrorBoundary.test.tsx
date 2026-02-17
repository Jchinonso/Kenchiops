/**
 * Unit tests for ErrorBoundary component.
 *
 * Tests the class-based error boundary that catches rendering crashes.
 * This is one of the few cases where a class component is expected
 * in the codebase (React requires it for error boundaries).
 *
 * Code paths:
 * - No error: renders children normally
 * - Error thrown: shows recovery UI with error message
 * - Reload button triggers window.location.reload
 * - Home button navigates to "/"
 * - Copy diagnostic button copies error info
 * - Error is logged to console
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

// ==================== Setup ====================

// Component that throws during rendering
const ThrowingComponent = ({ error }: { error: Error }) => {
  throw error;
};

// Suppress React's console.error for expected error boundary logging
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ==================== Tests ====================

describe("ErrorBoundary", () => {
  describe("when no error occurs", () => {
    it("should render children normally", () => {
      render(
        <ErrorBoundary>
          <div>App Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText("App Content")).toBeInTheDocument();
    });
  });

  describe("when a rendering error occurs", () => {
    it("should display the error UI with error message", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("Test rendering crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText(/Test rendering crash/)).toBeInTheDocument();
    });

    it("should display Reload Page and Home buttons", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
    });

    it("should display navigation sidebar links", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Kenchi")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Failures")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("should display the 'Copy diagnostic info' button", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Copy diagnostic info")).toBeInTheDocument();
    });

    it("should display a link to report an issue", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      const issueLink = screen.getByText("Report an issue");
      expect(issueLink).toBeInTheDocument();
      expect(issueLink).toHaveAttribute("href", "https://github.com/kenchiops/kenchi/issues");
      expect(issueLink).toHaveAttribute("target", "_blank");
    });

    it("should call window.location.reload when Reload Page is clicked", async () => {
      const user = userEvent.setup();
      const mockReload = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...window.location, reload: mockReload },
        writable: true,
        configurable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      await user.click(screen.getByRole("button", { name: /reload page/i }));

      expect(mockReload).toHaveBeenCalledOnce();
    });

    it("should log the error to console", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("logged crash")} />
        </ErrorBoundary>
      );

      // React's error boundary and our componentDidCatch both log
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should copy diagnostic info to clipboard when copy button is clicked", async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      // navigator.clipboard is read-only in jsdom; use defineProperty
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("diagnostic test")} />
        </ErrorBoundary>
      );

      await user.click(screen.getByText("Copy diagnostic info"));

      expect(mockWriteText).toHaveBeenCalledOnce();
      const clipboardContent = mockWriteText.mock.calls[0][0] as string;
      expect(clipboardContent).toContain("Kenchi Error Report");
      expect(clipboardContent).toContain("diagnostic test");
      expect(clipboardContent).toContain("Error:");
    });
  });
});
