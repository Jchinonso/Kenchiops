/**
 * Unit tests for ConfidenceChart component.
 *
 * Tests:
 * - Shows loading skeleton when data is loading
 * - Renders card title "Confidence Distribution"
 * - Shows empty state description when no data
 * - Shows data description with total count
 * - Renders chart with correct aria-label
 * - Handles singular "analysis" vs plural "analyses"
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConfidenceChart } from "@/components/ConfidenceChart";

// Mock the useDashboardData hook
const mockUseConfidenceDistribution = vi.fn();
vi.mock("@/hooks/useDashboardData", () => ({
  useConfidenceDistribution: (...args: unknown[]) => mockUseConfidenceDistribution(...args),
}));

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  LabelList: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock chart UI wrapper to avoid recharts dependency chain
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <div
      data-testid="chart-container"
      role={props.role as string}
      aria-label={props["aria-label"] as string}
    >
      {children}
    </div>
  ),
  ChartTooltip: () => <div />,
  ChartTooltipContent: () => <div />,
}));

describe("ConfidenceChart", () => {
  it("shows loading skeleton when data is loading", () => {
    mockUseConfidenceDistribution.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<ConfidenceChart />);
    // Skeleton renders a div with animate-pulse
    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it("renders card title", () => {
    mockUseConfidenceDistribution.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceChart />);
    expect(screen.getByText("Confidence Distribution")).toBeInTheDocument();
  });

  it("shows empty state message when no data", () => {
    mockUseConfidenceDistribution.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceChart />);
    expect(
      screen.getByText("No analyses recorded yet. Confidence breakdown will appear here.")
    ).toBeInTheDocument();
  });

  it("shows data description with total count for multiple analyses", () => {
    mockUseConfidenceDistribution.mockReturnValue({
      data: [
        { level: "high", count: 10 },
        { level: "medium", count: 5 },
        { level: "low", count: 2 },
      ],
      isLoading: false,
    });
    render(<ConfidenceChart />);
    expect(
      screen.getByText("Breakdown of analysis confidence levels across 17 analyses.")
    ).toBeInTheDocument();
  });

  it("uses singular 'analysis' for count of 1", () => {
    mockUseConfidenceDistribution.mockReturnValue({
      data: [{ level: "high", count: 1 }],
      isLoading: false,
    });
    render(<ConfidenceChart />);
    expect(
      screen.getByText("Breakdown of analysis confidence levels across 1 analysis.")
    ).toBeInTheDocument();
  });

  it("renders chart with aria-label when data is available", () => {
    mockUseConfidenceDistribution.mockReturnValue({
      data: [{ level: "high", count: 5 }],
      isLoading: false,
    });
    render(<ConfidenceChart />);
    expect(
      screen.getByRole("img", {
        name: /Confidence distribution bar chart/,
      })
    ).toBeInTheDocument();
  });

  it("passes refreshKey to the hook", () => {
    mockUseConfidenceDistribution.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceChart refreshKey={42} />);
    expect(mockUseConfidenceDistribution).toHaveBeenCalledWith(42);
  });
});
