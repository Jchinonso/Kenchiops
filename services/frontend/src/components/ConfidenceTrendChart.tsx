/**
 * Confidence Trend Chart
 *
 * Area chart showing average diagnosis confidence over time,
 * bucketed by day or week using recharts + shadcn ChartContainer.
 */

import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useConfidenceTrend, type ConfidenceTrendPoint } from "@/hooks/useDashboardData";

// ==================== Config ====================

const CHART_CONFIG: ChartConfig = {
  avgConfidence: {
    label: "Avg Confidence",
    color: "#6366f1",
  },
} as const;

const BUCKET_OPTIONS = [
  { value: "day" as const, label: "Daily" },
  { value: "week" as const, label: "Weekly" },
] as const;

const RANGE_OPTIONS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
] as const;

const MS_PER_DAY = 86_400_000;

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

// ==================== Props ====================

interface ConfidenceTrendChartProps {
  readonly refreshKey?: number;
}

// ==================== Component ====================

export const ConfidenceTrendChart = ({ refreshKey = 0 }: ConfidenceTrendChartProps) => {
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const [rangeDays, setRangeDays] = useState(30);

  const since = useMemo(
    () => new Date(Date.now() - rangeDays * MS_PER_DAY).toISOString(),
    [rangeDays]
  );

  const { data, isLoading } = useConfidenceTrend(bucket, since, refreshKey);

  const chartData = useMemo(
    () =>
      (data ?? []).map((point: ConfidenceTrendPoint) => ({
        date: formatDate(point.date),
        avgConfidence: point.avgConfidence,
        count: point.count,
      })),
    [data]
  );

  const hasData = chartData.length > 0;
  const hasMinimalData = hasData && chartData.length < 3;

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <CardTitle>
              <h2>Confidence Trend</h2>
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
            {/* Bucket toggle */}
            <div
              role="group"
              aria-label="Time bucket"
              className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs flex-shrink-0"
            >
              {BUCKET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBucket(opt.value)}
                  aria-pressed={bucket === opt.value}
                  className={`px-3 py-1.5 transition-colors ${
                    bucket === opt.value
                      ? "bg-indigo-500 text-white"
                      : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Range toggle */}
            <div
              role="group"
              aria-label="Date range"
              className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs flex-shrink-0"
            >
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRangeDays(opt.value)}
                  aria-pressed={rangeDays === opt.value}
                  className={`px-3 py-1.5 transition-colors ${
                    rangeDays === opt.value
                      ? "bg-indigo-500 text-white"
                      : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <CardDescription>
          {hasData
            ? `Average diagnosis confidence over the last ${rangeDays} days.`
            : "No trend data available yet. Analyses will populate this chart."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hasData ? (
          <div className="h-56 flex items-center justify-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No data for this period</p>
          </div>
        ) : (
          <div className="relative">
            {hasMinimalData && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Your first analyses are in. Check back soon to see trends forming.
                  </p>
                </div>
              </div>
            )}
            <ChartContainer
              config={CHART_CONFIG}
              className="h-56 w-full"
              role="img"
              aria-label={`Confidence trend area chart showing average diagnosis confidence over the last ${rangeDays} days`}
            >
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={formatPercent}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => formatPercent(value as number)} />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="avgConfidence"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#confidenceGradient)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
