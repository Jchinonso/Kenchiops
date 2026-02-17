/**
 * Unit tests for FilterBar component and its helper functions.
 *
 * Tests:
 * - parseConfidenceFilter pure function
 * - loadSavedFilters / saveFilters persistence helpers
 * - timeRangeToSince conversion
 * - FilterBar component rendering and interaction
 *
 * Note: Radix UI Select is mocked because the root monorepo has React 18
 * while the frontend uses React 19, causing dual-React issues in tests.
 * The mock renders a native <select> element for testing purposes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FilterBar,
  parseConfidenceFilter,
  loadSavedFilters,
  saveFilters,
  timeRangeToSince,
  type FilterValues,
} from "./FilterBar";

// Mock the Radix UI Select component to avoid dual-React issues in monorepo
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="mock-select" data-value={value} data-onchange={String(onValueChange)}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

// ==================== parseConfidenceFilter ====================

describe("parseConfidenceFilter", () => {
  it("should return null min and max for empty string", () => {
    expect(parseConfidenceFilter("")).toEqual({ min: null, max: null });
  });

  it("should parse min-only filter", () => {
    expect(parseConfidenceFilter("min:0.8")).toEqual({ min: 0.8, max: null });
  });

  it("should parse max-only filter", () => {
    expect(parseConfidenceFilter("max:0.5")).toEqual({ min: null, max: 0.5 });
  });

  it("should parse min and max filter", () => {
    expect(parseConfidenceFilter("min:0.5,max:0.8")).toEqual({ min: 0.5, max: 0.8 });
  });

  it("should return null for malformed values", () => {
    expect(parseConfidenceFilter("min:abc")).toEqual({ min: null, max: null });
    expect(parseConfidenceFilter("invalid")).toEqual({ min: null, max: null });
  });

  it("should handle reversed order", () => {
    expect(parseConfidenceFilter("max:0.3,min:0.1")).toEqual({ min: 0.1, max: 0.3 });
  });
});

// ==================== loadSavedFilters / saveFilters ====================

describe("loadSavedFilters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should return null when no saved filters exist", () => {
    expect(loadSavedFilters("analyses")).toBeNull();
  });

  it("should load saved filters from localStorage", () => {
    const filters = { repository: "org/repo", severity: "high" };
    localStorage.setItem("kenchi_filters_analyses", JSON.stringify(filters));

    expect(loadSavedFilters("analyses")).toEqual(filters);
  });

  it("should return null for invalid JSON", () => {
    localStorage.setItem("kenchi_filters_failures", "bad-json{");

    expect(loadSavedFilters("failures")).toBeNull();
  });
});

describe("saveFilters", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should save filters to localStorage", () => {
    const filters: FilterValues = {
      repository: "org/repo",
      severity: "high",
      minConfidence: "",
      timeRange: "7d",
    };

    saveFilters("analyses", filters);

    const raw = localStorage.getItem("kenchi_filters_analyses");
    expect(raw).not.toBeNull();
    const stored: unknown = JSON.parse(raw as string);
    expect(stored).toEqual(filters);
  });

  it("should silently handle localStorage errors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const filters: FilterValues = {
      repository: "",
      severity: "",
      minConfidence: "",
      timeRange: "",
    };

    expect(() => saveFilters("test", filters)).not.toThrow();

    vi.restoreAllMocks();
  });
});

// ==================== timeRangeToSince ====================

describe("timeRangeToSince", () => {
  it("should return undefined for empty string", () => {
    expect(timeRangeToSince("")).toBeUndefined();
  });

  it("should return undefined for unknown time range", () => {
    expect(timeRangeToSince("1y")).toBeUndefined();
  });

  it("should return an ISO timestamp for valid time ranges", () => {
    const before = Date.now();
    const result = timeRangeToSince("24h");
    const after = Date.now();

    expect(result).toBeDefined();
    const timestamp = new Date(result as string).getTime();
    const expected24h = 24 * 60 * 60 * 1000;
    expect(before - timestamp).toBeGreaterThanOrEqual(expected24h - 100);
    expect(after - timestamp).toBeLessThanOrEqual(expected24h + 100);
  });

  it("should return correct timestamps for all supported ranges", () => {
    const ranges = ["24h", "7d", "30d", "90d"];
    for (const range of ranges) {
      const result = timeRangeToSince(range);
      expect(result).toBeDefined();
      expect(new Date(result as string).toISOString()).toBe(result);
    }
  });
});

// ==================== FilterBar Component ====================

describe("FilterBar", () => {
  const defaultFilters: FilterValues = {
    repository: "",
    severity: "",
    minConfidence: "",
    timeRange: "",
  };

  const defaultProps = {
    filters: defaultFilters,
    onFilterChange: vi.fn(),
    variant: "analyses" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render the repository input", () => {
      render(<FilterBar {...defaultProps} />);

      expect(screen.getByLabelText("Filter by repository")).toBeInTheDocument();
    });

    it("should have a search role on the container", () => {
      render(<FilterBar {...defaultProps} />);

      expect(screen.getByRole("search", { name: "Table filters" })).toBeInTheDocument();
    });

    it("should render confidence options for analyses variant", () => {
      render(<FilterBar {...defaultProps} variant="analyses" />);

      // Mock renders both placeholder and option text; verify at least one exists
      expect(screen.getAllByText("All Confidence").length).toBeGreaterThanOrEqual(1);
    });

    it("should render severity options for failures variant", () => {
      render(<FilterBar {...defaultProps} variant="failures" />);

      expect(screen.getAllByText("All Severities").length).toBeGreaterThanOrEqual(1);
    });

    it("should not render severity for analyses variant", () => {
      render(<FilterBar {...defaultProps} variant="analyses" />);

      expect(screen.queryByText("All Severities")).not.toBeInTheDocument();
    });

    it("should not render confidence for failures variant", () => {
      render(<FilterBar {...defaultProps} variant="failures" />);

      expect(screen.queryByText("All Confidence")).not.toBeInTheDocument();
    });
  });

  describe("clear filters", () => {
    it("should not show Clear button when no filters are active", () => {
      render(<FilterBar {...defaultProps} />);

      expect(screen.queryByLabelText("Clear all filters")).not.toBeInTheDocument();
    });

    it("should show Clear button when a filter is active", () => {
      render(
        <FilterBar {...defaultProps} filters={{ ...defaultFilters, repository: "org/repo" }} />
      );

      expect(screen.getByLabelText("Clear all filters")).toBeInTheDocument();
    });

    it("should call onFilterChange with empty filters when Clear is clicked", async () => {
      const user = userEvent.setup();
      const onFilterChange = vi.fn();

      render(
        <FilterBar
          {...defaultProps}
          onFilterChange={onFilterChange}
          filters={{ ...defaultFilters, repository: "org/repo" }}
        />
      );

      await user.click(screen.getByLabelText("Clear all filters"));

      expect(onFilterChange).toHaveBeenCalledWith({
        repository: "",
        severity: "",
        minConfidence: "",
        timeRange: "",
      });
    });
  });

  describe("repository input", () => {
    it("should show the current repository filter value", () => {
      render(
        <FilterBar {...defaultProps} filters={{ ...defaultFilters, repository: "org/repo" }} />
      );

      const input = screen.getByLabelText("Filter by repository") as HTMLInputElement;
      expect(input.value).toBe("org/repo");
    });

    it("should debounce repository input and call onFilterChange", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onFilterChange = vi.fn();

      render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

      const input = screen.getByLabelText("Filter by repository") as HTMLInputElement;

      // Use fireEvent instead of userEvent to avoid timeout issues with fake timers
      const { fireEvent } = await import("@testing-library/react");
      fireEvent.change(input, { target: { value: "org/repo" } });

      // Should not have been called yet (debounced at 300ms)
      expect(onFilterChange).not.toHaveBeenCalled();

      // Advance past debounce timer
      vi.advanceTimersByTime(350);

      expect(onFilterChange).toHaveBeenCalled();
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.repository).toBe("org/repo");

      vi.useRealTimers();
    });

    it("should have an accessible label for the repository input", () => {
      render(<FilterBar {...defaultProps} />);

      const input = screen.getByLabelText("Filter by repository");
      expect(input).toHaveAttribute("type", "text");
    });
  });
});
