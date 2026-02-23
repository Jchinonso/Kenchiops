/**
 * Global mocks for Radix UI-based shadcn/ui components.
 *
 * These components use @radix-ui packages that are pre-compiled
 * against React 18 in the monorepo root. Since the frontend uses
 * React 19, these cause "dual React" crashes in tests. We mock
 * them as simple div/button wrappers for testing purposes.
 *
 * The shadcn/ui primitives in components/ui/ are NOT our test
 * targets (per CLAUDE.md). Tests focus on application behavior,
 * not on whether Radix primitives render correctly.
 */

import { vi } from "vitest";
import React from "react";

// Helper to create a simple passthrough component
const passthrough = (displayName: string, tag = "div") =>
  React.forwardRef<HTMLElement, Record<string, unknown>>(({ children, ...props }, ref) =>
    React.createElement(
      tag,
      { ...props, ref, "data-testid": displayName },
      children as React.ReactNode
    )
  );

const passthroughDiv = (name: string) => passthrough(name, "div");
const passthroughButton = (name: string) => passthrough(name, "button");

// ==================== Switch ====================
vi.mock("@/components/ui/switch", () => ({
  Switch: React.forwardRef<
    HTMLButtonElement,
    { checked?: boolean; onCheckedChange?: (v: boolean) => void }
  >(({ checked, onCheckedChange, ...props }, ref) =>
    React.createElement("button", {
      ...props,
      ref,
      role: "switch",
      "aria-checked": checked,
      onClick: () => onCheckedChange?.(!checked),
      "data-testid": "switch",
    })
  ),
}));

// ==================== Select ====================
vi.mock("@radix-ui/react-select", () => {
  const SelectRoot = ({
    children,
    value: _value,
    onValueChange: _onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => React.createElement("div", { "data-testid": "select" }, children);

  return {
    Root: SelectRoot,
    Trigger: passthroughButton("select-trigger"),
    Value: passthroughDiv("select-value"),
    Content: passthroughDiv("select-content"),
    Viewport: passthroughDiv("select-viewport"),
    Item: passthroughDiv("select-item"),
    ItemText: passthroughDiv("select-item-text"),
    ItemIndicator: passthroughDiv("select-item-indicator"),
    Icon: passthroughDiv("select-icon"),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Group: passthroughDiv("select-group"),
    Label: passthroughDiv("select-label"),
    Separator: passthroughDiv("select-separator"),
    ScrollUpButton: passthroughDiv("select-scroll-up"),
    ScrollDownButton: passthroughDiv("select-scroll-down"),
  };
});

// ==================== Accordion (used by FAQ section) ====================
vi.mock("@radix-ui/react-accordion", () => ({
  Root: passthroughDiv("accordion"),
  Item: passthroughDiv("accordion-item"),
  Trigger: passthroughButton("accordion-trigger"),
  Header: passthroughDiv("accordion-header"),
  Content: passthroughDiv("accordion-content"),
}));

// ==================== Dialog (used by KeyboardShortcutsDialog) ====================
vi.mock("@radix-ui/react-dialog", () => {
  const DialogRoot = ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? React.createElement("div", { "data-testid": "dialog" }, children) : null;

  return {
    Root: DialogRoot,
    Trigger: passthroughButton("dialog-trigger"),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Overlay: passthroughDiv("dialog-overlay"),
    Content: passthroughDiv("dialog-content"),
    Title: passthroughDiv("dialog-title"),
    Description: passthroughDiv("dialog-description"),
    Close: passthroughButton("dialog-close"),
  };
});

// ==================== AlertDialog (used by Settings delete) ====================
vi.mock("@radix-ui/react-alert-dialog", () => {
  const AlertDialogRoot = ({
    children,
    open: _open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => React.createElement("div", { "data-testid": "alert-dialog" }, children);

  return {
    Root: AlertDialogRoot,
    Trigger: passthroughButton("alert-dialog-trigger"),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Overlay: passthroughDiv("alert-dialog-overlay"),
    Content: passthroughDiv("alert-dialog-content"),
    Title: passthroughDiv("alert-dialog-title"),
    Description: passthroughDiv("alert-dialog-description"),
    Action: passthroughButton("alert-dialog-action"),
    Cancel: passthroughButton("alert-dialog-cancel"),
  };
});

// ==================== Navigation Menu (used by Navbar) ====================
vi.mock("@radix-ui/react-navigation-menu", () => ({
  Root: passthroughDiv("nav-menu"),
  List: passthroughDiv("nav-menu-list"),
  Item: passthroughDiv("nav-menu-item"),
  Trigger: passthroughButton("nav-menu-trigger"),
  Content: passthroughDiv("nav-menu-content"),
  Link: passthroughDiv("nav-menu-link"),
  Viewport: passthroughDiv("nav-menu-viewport"),
  Indicator: passthroughDiv("nav-menu-indicator"),
  Sub: passthroughDiv("nav-menu-sub"),
}));

// ==================== Collapsible ====================
vi.mock("@radix-ui/react-collapsible", () => {
  const CollapsibleRoot = ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    React.createElement("div", { "data-testid": "collapsible", "data-open": open }, children);

  return {
    Root: CollapsibleRoot,
    Trigger: passthroughButton("collapsible-trigger"),
    Content: passthroughDiv("collapsible-content"),
    // shadcn wrapper uses these named exports
    CollapsibleTrigger: passthroughButton("collapsible-trigger"),
    CollapsibleContent: passthroughDiv("collapsible-content"),
  };
});

// ==================== Tooltip ====================
vi.mock("@radix-ui/react-tooltip", () => ({
  Provider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Root: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Trigger: passthroughDiv("tooltip-trigger"),
  Content: passthroughDiv("tooltip-content"),
  Portal: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Arrow: passthroughDiv("tooltip-arrow"),
}));

// ==================== Tabs ====================
vi.mock("@radix-ui/react-tabs", () => ({
  Root: passthroughDiv("tabs"),
  List: passthroughDiv("tabs-list"),
  Trigger: passthroughButton("tabs-trigger"),
  Content: passthroughDiv("tabs-content"),
}));

export {};
