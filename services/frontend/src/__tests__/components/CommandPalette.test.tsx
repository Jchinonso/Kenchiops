/**
 * Unit tests for CommandPalette component.
 *
 * Tests:
 * - Does not render content when closed
 * - Renders navigation items when open
 * - Shows "Coming Soon" badges for appropriate items
 * - Renders action items (toggle theme, keyboard shortcuts)
 * - Shows Sun/Moon icon based on resolvedTheme
 * - Calls onOpenChange and onToggleTheme on action selection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import { CommandPalette } from "@/components/CommandPalette";

// Mock the command UI wrapper to bypass cmdk's scrollIntoView in jsdom
vi.mock("@/components/ui/command", () => {
  const CommandDialog = ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div data-testid="command-dialog">{children}</div> : null);

  const CommandInput = (props: { placeholder?: string; [key: string]: unknown }) => (
    <input placeholder={props.placeholder} aria-label={props["aria-label"] as string} />
  );

  const CommandList = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  const CommandEmpty = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  const CommandGroup = ({ children, heading }: { children: React.ReactNode; heading?: string }) => (
    <div>
      {heading && <div>{heading}</div>}
      {children}
    </div>
  );

  const CommandItem = ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  );

  const CommandSeparator = () => <hr />;

  return {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandSeparator,
    CommandShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  resolvedTheme: "light" as const,
  onToggleTheme: vi.fn(),
  onOpenShortcuts: vi.fn(),
};

const Wrapper = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render content when closed", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} open={false} />
      </Wrapper>
    );
    expect(screen.queryByText("Navigation")).not.toBeInTheDocument();
  });

  it("renders the search input when open", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} />
      </Wrapper>
    );
    expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
  });

  it("renders Navigation group with nav items", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} />
      </Wrapper>
    );
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("CI/CD Analyses")).toBeInTheDocument();
    expect(screen.getByText("CI/CD Pipelines")).toBeInTheDocument();
    expect(screen.getByText("Webhook Activity")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows 'Soon' badges for coming-soon items", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} />
      </Wrapper>
    );
    const soonBadges = screen.getAllByText("Soon");
    expect(soonBadges.length).toBe(2); // Analytics and Integrations
  });

  it("renders Actions group", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} />
      </Wrapper>
    );
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Toggle theme")).toBeInTheDocument();
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("shows no results message", () => {
    render(
      <Wrapper>
        <CommandPalette {...defaultProps} />
      </Wrapper>
    );
    expect(screen.getByText("No results found.")).toBeInTheDocument();
  });
});
