/**
 * Unit tests for FilterBar component and its helper functions.
 *
 * Tests:
 * - parseConfidenceFilter pure function
 * - loadSavedFilters / saveFilters persistence helpers
 * - timeRangeToSince conversion
 * - FilterBar component rendering and interaction
 *   - Repository input with debounce
 *   - Variant-specific dropdowns (severity for failures, confidence for analyses)
 *   - Time range dropdown (always shown)
 *   - Clear all filters button
 *   - Accessibility (search role, labels)
 *
 * Note: Radix UI Select is mocked because the root monorepo has React 18
 * while the frontend uses React 19, causing dual-React issues in tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  FilterBar,
  parseConfidenceFilter,
  loadSavedFilters,
  saveFilters,
  timeRangeToSince,
  type FilterValues,
} from "@/components/FilterBar";

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

  it("should return null for malformed numeric values", () => {
    expect(parseConfidenceFilter("min:abc")).toEqual({ min: null, max: null });
  });

  it("should return null for completely invalid format", () => {
    expect(parseConfidenceFilter("invalid")).toEqual({ min: null, max: null });
  });

  it("should handle reversed order (max before min)", () => {
    expect(parseConfidenceFilter("max:0.3,min:0.1")).toEqual({ min: 0.1, max: 0.3 });
  });

  it("should parse integer values", () => {
    expect(parseConfidenceFilter("min:1")).toEqual({ min: 1, max: null });
  });

  it("should parse zero values", () => {
    expect(parseConfidenceFilter("min:0,max:0")).toEqual({ min: 0, max: 0 });
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

  it("should use the correct storage key prefix", () => {
    const filters = { repository: "test" };
    localStorage.setItem("kenchi_filters_mypage", JSON.stringify(filters));

    expect(loadSavedFilters("mypage")).toEqual(filters);
    expect(loadSavedFilters("otherpage")).toBeNull();
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
    expect(JSON.parse(raw as string)).toEqual(filters);
  });

  it("should silently handle localStorage errors (quota exceeded)", () => {
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

  it("should overwrite existing saved filters", () => {
    const original: FilterValues = {
      repository: "old/repo",
      severity: "",
      minConfidence: "",
      timeRange: "",
    };
    saveFilters("test", original);

    const updated: FilterValues = {
      repository: "new/repo",
      severity: "high",
      minConfidence: "",
      timeRange: "24h",
    };
    saveFilters("test", updated);

    const raw = localStorage.getItem("kenchi_filters_test");
    expect(JSON.parse(raw as string)).toEqual(updated);
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

  it("should return an ISO timestamp for '24h'", () => {
    const before = Date.now();
    const result = timeRangeToSince("24h");
    const after = Date.now();

    expect(result).toBeDefined();
    const timestamp = new Date(result as string).getTime();
    const expected24h = 24 * 60 * 60 * 1000;
    expect(before - timestamp).toBeGreaterThanOrEqual(expected24h - 100);
    expect(after - timestamp).toBeLessThanOrEqual(expected24h + 100);
  });

  it("should return valid ISO timestamps for all supported ranges", () => {
    const ranges = ["24h", "7d", "30d", "90d"];
    for (const range of ranges) {
      const result = timeRangeToSince(range);
      expect(result).toBeDefined();
      expect(new Date(result as string).toISOString()).toBe(result);
    }
  });

  it("should return progressively older timestamps for increasing ranges", () => {
    const t24h = new Date(timeRangeToSince("24h") as string).getTime();
    const t7d = new Date(timeRangeToSince("7d") as string).getTime();
    const t30d = new Date(timeRangeToSince("30d") as string).getTime();
    const t90d = new Date(timeRangeToSince("90d") as string).getTime();

    expect(t24h).toBeGreaterThan(t7d);
    expect(t7d).toBeGreaterThan(t30d);
    expect(t30d).toBeGreaterThan(t90d);
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
    it("should render the repository input with placeholder", () => {
      render(<FilterBar {...defaultProps} />);

      const input = screen.getByLabelText("Filter by repository");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "Filter by repository, e.g. org/repo-name");
    });

    it("should have a search role on the container", () => {
      render(<FilterBar {...defaultProps} />);

      expect(screen.getByRole("search", { name: "Table filters" })).toBeInTheDocument();
    });

    it("should render confidence options for analyses variant", () => {
      render(<FilterBar {...defaultProps} variant="analyses" />);

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

    it("should always render time range dropdown regardless of variant", () => {
      render(<FilterBar {...defaultProps} variant="analyses" />);
      expect(screen.getAllByText("All Time").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("clear filters", () => {
    it("should not show Clear button when no filters are active", () => {
      render(<FilterBar {...defaultProps} />);

      expect(screen.queryByLabelText("Clear all filters")).not.toBeInTheDocument();
    });

    it("should show Clear button when repository filter is active", () => {
      render(
        <FilterBar {...defaultProps} filters={{ ...defaultFilters, repository: "org/repo" }} />
      );

      expect(screen.getByLabelText("Clear all filters")).toBeInTheDocument();
    });

    it("should show Clear button when severity filter is active", () => {
      render(
        <FilterBar
          {...defaultProps}
          variant="failures"
          filters={{ ...defaultFilters, severity: "high" }}
        />
      );

      expect(screen.getByLabelText("Clear all filters")).toBeInTheDocument();
    });

    it("should show Clear button when minConfidence filter is active", () => {
      render(
        <FilterBar {...defaultProps} filters={{ ...defaultFilters, minConfidence: "min:0.8" }} />
      );

      expect(screen.getByLabelText("Clear all filters")).toBeInTheDocument();
    });

    it("should show Clear button when timeRange filter is active", () => {
      render(<FilterBar {...defaultProps} filters={{ ...defaultFilters, timeRange: "7d" }} />);

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
        source: "",
        status: "",
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

    it("should debounce repository input and call onFilterChange after delay", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onFilterChange = vi.fn();

      render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

      const input = screen.getByLabelText("Filter by repository") as HTMLInputElement;
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

    it("should reset debounce timer on rapid input changes", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onFilterChange = vi.fn();

      render(<FilterBar {...defaultProps} onFilterChange={onFilterChange} />);

      const input = screen.getByLabelText("Filter by repository") as HTMLInputElement;

      // Type rapidly
      fireEvent.change(input, { target: { value: "o" } });
      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "or" } });
      vi.advanceTimersByTime(100);
      fireEvent.change(input, { target: { value: "org" } });
      vi.advanceTimersByTime(100);

      // Should not have fired yet
      expect(onFilterChange).not.toHaveBeenCalled();

      // Wait for debounce
      vi.advanceTimersByTime(300);

      // Should fire once with final value
      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange.mock.calls[0][0].repository).toBe("org");

      vi.useRealTimers();
    });

    it("should have an accessible label for the repository input", () => {
      render(<FilterBar {...defaultProps} />);

      const input = screen.getByLabelText("Filter by repository");
      expect(input).toHaveAttribute("type", "text");
      expect(input).toHaveAttribute("id", "filter-repository");
    });
  });

  describe("external filter sync", () => {
    it("should sync local repo state when filters.repository changes externally", () => {
      const { rerender } = render(<FilterBar {...defaultProps} />);

      const input = screen.getByLabelText("Filter by repository") as HTMLInputElement;
      expect(input.value).toBe("");

      rerender(
        <FilterBar {...defaultProps} filters={{ ...defaultFilters, repository: "new/repo" }} />
      );

      expect(input.value).toBe("new/repo");
    });
  });
});
