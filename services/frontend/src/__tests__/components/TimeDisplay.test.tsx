/**
 * Unit tests for TimeDisplay component.
 *
 * Tests the semantic <time> element rendering with
 * relative text and absolute title tooltip.
 *
 * Code paths:
 * - Renders <time> element with dateTime attribute
 * - Shows relative time text content
 * - Has title attribute with absolute formatted timestamp
 * - Applies custom className
 * - Handles invalid dateTime gracefully
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeDisplay } from "@/components/TimeDisplay";

describe("TimeDisplay", () => {
  it("should render a <time> element with the correct dateTime attribute", () => {
    const dateTime = "2024-01-15T10:00:00Z";
    render(<TimeDisplay dateTime={dateTime} />);

    const timeEl = screen.getByText(/ago|just now|seconds|minutes|hours|days|months|years/i);
    expect(timeEl.tagName).toBe("TIME");
    expect(timeEl).toHaveAttribute("dateTime", dateTime);
  });

  it("should display relative time as text content", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<TimeDisplay dateTime={fiveMinutesAgo} />);

    const timeEl = screen.getByText(/minutes ago/i);
    expect(timeEl).toBeInTheDocument();
  });

  it("should have a title attribute with the formatted absolute timestamp", () => {
    const dateTime = "2024-06-15T14:30:00Z";
    render(<TimeDisplay dateTime={dateTime} />);

    const timeEl = document.querySelector("time");
    expect(timeEl?.title).not.toBe("--");
    expect(timeEl?.title).toBeTruthy();
  });

  it("should apply custom className", () => {
    render(<TimeDisplay dateTime="2024-01-15T10:00:00Z" className="text-sm text-gray-500" />);

    const timeEl = document.querySelector("time");
    expect(timeEl?.className).toContain("text-sm");
    expect(timeEl?.className).toContain("text-gray-500");
  });

  it("should handle invalid dateTime gracefully (shows '--')", () => {
    render(<TimeDisplay dateTime="invalid" />);

    const timeEl = screen.getByText("--");
    expect(timeEl).toBeInTheDocument();
  });

  it("should render without className when not provided", () => {
    render(<TimeDisplay dateTime="2024-06-15T14:30:00Z" />);

    const timeEl = document.querySelector("time");
    expect(timeEl).toBeInTheDocument();
    // className should be undefined or empty when not provided
    expect(timeEl?.getAttribute("class")).toBeNull();
  });

  it("should show relative time for recent timestamps", () => {
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
    render(<TimeDisplay dateTime={tenSecondsAgo} />);

    const timeEl = document.querySelector("time");
    expect(timeEl?.textContent).toMatch(/seconds? ago|less than a minute ago/i);
  });

  it("should show relative time for old timestamps", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    render(<TimeDisplay dateTime={oneYearAgo} />);

    const timeEl = document.querySelector("time");
    expect(timeEl?.textContent).toMatch(/year|months/i);
  });
});
