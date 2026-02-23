/**
 * Unit tests for ConfidenceTrendChart component.
 *
 * Tests:
 * - Shows loading skeleton when data is loading
 * - Renders card title "Confidence Trend"
 * - Shows empty state when no data
 * - Shows minimal data hint when fewer than 3 points
 * - Renders bucket toggle (Daily/Weekly)
 * - Renders range toggle (7d/30d/90d)
 * - Default bucket is "day" and range is 30
 * - Shows description with range days when data exists
 * - Clicking toggles changes state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfidenceTrendChart } from "@/components/ConfidenceTrendChart";

// Mock the useDashboardData hook
const mockUseConfidenceTrend = vi.fn();
vi.mock("@/hooks/useDashboardData", () => ({
  useConfidenceTrend: (...args: unknown[]) => mockUseConfidenceTrend(...args),
}));

// Mock recharts
vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
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

describe("ConfidenceTrendChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton when data is loading", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: null, isLoading: true });
    const { container } = render(<ConfidenceTrendChart />);
    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it("renders card title", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    expect(screen.getByText("Confidence Trend")).toBeInTheDocument();
  });

  it("shows empty description when no data", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    expect(
      screen.getByText("No trend data available yet. Analyses will populate this chart.")
    ).toBeInTheDocument();
  });

  it("shows 'No data for this period' when data is empty and loaded", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
  });

  it("shows minimal data hint when fewer than 3 data points", () => {
    mockUseConfidenceTrend.mockReturnValue({
      data: [
        { date: "2026-02-01", avgConfidence: 0.85, count: 3 },
        { date: "2026-02-02", avgConfidence: 0.72, count: 2 },
      ],
      isLoading: false,
    });
    render(<ConfidenceTrendChart />);
    expect(screen.getByText(/Your first analyses are in/)).toBeInTheDocument();
  });

  it("renders bucket toggle with Daily and Weekly options", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
  });

  it("renders range toggle with 7d, 30d, 90d options", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("30d")).toBeInTheDocument();
    expect(screen.getByText("90d")).toBeInTheDocument();
  });

  it("defaults to Daily bucket pressed", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    const dailyButton = screen.getByText("Daily");
    expect(dailyButton).toHaveAttribute("aria-pressed", "true");
    const weeklyButton = screen.getByText("Weekly");
    expect(weeklyButton).toHaveAttribute("aria-pressed", "false");
  });

  it("defaults to 30d range pressed", () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    const thirtyDay = screen.getByText("30d");
    expect(thirtyDay).toHaveAttribute("aria-pressed", "true");
  });

  it("shows description with range days when data exists", () => {
    mockUseConfidenceTrend.mockReturnValue({
      data: [
        { date: "2026-02-01", avgConfidence: 0.85, count: 3 },
        { date: "2026-02-02", avgConfidence: 0.72, count: 2 },
        { date: "2026-02-03", avgConfidence: 0.9, count: 5 },
      ],
      isLoading: false,
    });
    render(<ConfidenceTrendChart />);
    expect(
      screen.getByText("Average diagnosis confidence over the last 30 days.")
    ).toBeInTheDocument();
  });

  it("clicking Weekly toggle changes bucket", async () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Weekly"));
    expect(screen.getByText("Weekly")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Daily")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking 7d toggle changes range", async () => {
    mockUseConfidenceTrend.mockReturnValue({ data: [], isLoading: false });
    render(<ConfidenceTrendChart />);
    const user = userEvent.setup();
    await user.click(screen.getByText("7d"));
    expect(screen.getByText("7d")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("30d")).toHaveAttribute("aria-pressed", "false");
  });
});
