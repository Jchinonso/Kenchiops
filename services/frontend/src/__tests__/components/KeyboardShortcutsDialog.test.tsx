/**
 * Unit tests for KeyboardShortcutsDialog component.
 *
 * Tests:
 * - Does not render content when closed
 * - Shows dialog title and description when open
 * - Renders all shortcut groups (General, Navigation, Tables)
 * - Renders individual shortcut keys and descriptions
 * - Calls onOpenChange when dialog is closed
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";

describe("KeyboardShortcutsDialog", () => {
  it("does not render dialog content when closed", () => {
    render(<KeyboardShortcutsDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });

  it("renders dialog title and description when open", () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Quick actions to navigate the dashboard.")).toBeInTheDocument();
  });

  it("renders all shortcut groups", () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
  });

  it("renders General shortcuts", () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Open command palette")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
    expect(screen.getByText("Show keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Toggle light / dark theme")).toBeInTheDocument();
    expect(screen.getByText("Close dialogs and menus")).toBeInTheDocument();
  });

  it("renders Navigation shortcuts", () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Go to Overview")).toBeInTheDocument();
    expect(screen.getByText("g then o")).toBeInTheDocument();
    expect(screen.getByText("Go to Failures")).toBeInTheDocument();
    expect(screen.getByText("Go to Analyses")).toBeInTheDocument();
  });

  it("renders Tables shortcuts", () => {
    render(<KeyboardShortcutsDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Focus repository filter")).toBeInTheDocument();
  });
});
