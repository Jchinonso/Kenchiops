/**
 * Unit tests for ErrorBoundary component.
 *
 * Tests the class-based error boundary that catches rendering crashes.
 * This is one of the few cases where a class component is expected
 * in the codebase (React requires it for error boundaries).
 *
 * Code paths:
 * - No error: renders children normally
 * - Error thrown: shows recovery UI with error message and stack
 * - Reload button triggers window.location.reload
 * - Home button navigates to "/"
 * - Copy diagnostic button copies error info and shows "Copied!" feedback
 * - Error is logged to console via componentDidCatch
 * - Sidebar navigation links rendered for escape-hatch navigation
 * - Report an issue link with correct href and target
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ==================== Setup ====================

// Component that throws during rendering
const ThrowingComponent = ({ error }: { readonly error: Error }) => {
  throw error;
};

// Save/restore originals
const originalLocation = window.location;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore window.location if overwritten
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
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

    it("should not display error UI when children render successfully", () => {
      render(
        <ErrorBoundary>
          <p>Healthy component</p>
        </ErrorBoundary>
      );

      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });
  });

  describe("when a rendering error occurs", () => {
    it("should display the error UI heading", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("Test rendering crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("should display the error message", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("Test rendering crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Test rendering crash/)).toBeInTheDocument();
    });

    it("should display a description paragraph with recovery instructions", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Try reloading the page/)).toBeInTheDocument();
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

    it("should display navigation sidebar links as escape hatches", () => {
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

    it("should have correct sidebar link hrefs", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      const dashboardLink = screen.getByText("Dashboard").closest("a");
      expect(dashboardLink).toHaveAttribute("href", "/");

      const failuresLink = screen.getByText("Failures").closest("a");
      expect(failuresLink).toHaveAttribute("href", "/dashboard/cicd/failures");
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
      expect(issueLink.closest("a")).toHaveAttribute(
        "href",
        "https://github.com/kenchiops/kenchi/issues"
      );
      expect(issueLink.closest("a")).toHaveAttribute("target", "_blank");
      expect(issueLink.closest("a")).toHaveAttribute("rel", "noopener noreferrer");
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

    it("should navigate to '/' when Home button is clicked", async () => {
      const user = userEvent.setup();
      Object.defineProperty(window, "location", {
        value: { ...window.location, href: "", reload: vi.fn() },
        writable: true,
        configurable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      await user.click(screen.getByRole("button", { name: /home/i }));

      expect(window.location.href).toBe("/");
    });

    it("should log the error to console via componentDidCatch", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("logged crash")} />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should copy diagnostic info to clipboard when copy button is clicked", async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
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
      expect(clipboardContent).toContain("Time:");
      expect(clipboardContent).toContain("URL:");
      expect(clipboardContent).toContain("UA:");
    });

    it("should show 'Copied!' feedback after copying diagnostic info", async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error("crash")} />
        </ErrorBoundary>
      );

      await user.click(screen.getByText("Copy diagnostic info"));

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeInTheDocument();
      });
    });

    it("should render error stack trace when available", () => {
      const error = new Error("stack test");
      error.stack = "Error: stack test\n    at ThrowingComponent";

      render(
        <ErrorBoundary>
          <ThrowingComponent error={error} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/stack test/)).toBeInTheDocument();
    });
  });
});
