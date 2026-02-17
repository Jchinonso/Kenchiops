/**
 * Unit tests for ThemeInitializer component.
 *
 * ThemeInitializer calls useTheme() to initialize the theme on the root
 * element and renders null (invisible component). Tests verify:
 * - Renders nothing (null)
 * - Calls useTheme on mount
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import ThemeInitializer from "@/components/ThemeInitializer";
import { useTheme } from "@/hooks/useTheme";

// Mock the useTheme hook before importing the component
vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(() => ({
    preference: "dark" as const,
    resolved: "dark" as const,
    setTheme: vi.fn(),
  })),
}));

describe("ThemeInitializer", () => {
  it("should render nothing (null)", () => {
    const { container } = render(<ThemeInitializer />);

    expect(container.innerHTML).toBe("");
  });

  it("should call useTheme on mount", () => {
    render(<ThemeInitializer />);

    expect(useTheme).toHaveBeenCalled();
  });

  it("should not produce any visible DOM elements", () => {
    const { container } = render(<ThemeInitializer />);

    expect(container.childNodes).toHaveLength(0);
  });
});
