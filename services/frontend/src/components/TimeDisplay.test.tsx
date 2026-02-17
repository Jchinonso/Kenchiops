/**
 * Unit tests for TimeDisplay component.
 *
 * Tests the semantic <time> element rendering with
 * relative text and absolute title tooltip.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeDisplay } from "./TimeDisplay";

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

    // The title should be the absolute formatted timestamp (not "--")
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

  it('should handle invalid dateTime gracefully (shows "--")', () => {
    render(<TimeDisplay dateTime="invalid" />);

    // Both formatRelativeTime and formatTimestamp return "--" for invalid dates
    const timeEl = screen.getByText("--");
    expect(timeEl).toBeInTheDocument();
  });
});
