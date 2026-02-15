/**
 * Confidence Distribution Chart
 *
 * Bar chart showing the breakdown of analysis confidence levels
 * (High, Medium, Low) using recharts + shadcn ChartContainer.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { useConfidenceDistribution } from "@/hooks/useDashboardData";

// ==================== Config ====================

const CHART_CONFIG: ChartConfig = {
  count: {
    label: "Analyses",
  },
} as const;

const LEVEL_COLORS: Readonly<Record<string, string>> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#ef4444",
} as const;

const LEVEL_LABELS: Readonly<Record<string, string>> = {
  high: "High (80%+)",
  medium: "Medium (50-79%)",
  low: "Low (<50%)",
} as const;

// ==================== Props ====================

interface ConfidenceChartProps {
  readonly refreshKey?: number;
}

// ==================== Component ====================

export const ConfidenceChart = ({ refreshKey = 0 }: ConfidenceChartProps) => {
  const { data, isLoading } = useConfidenceDistribution(refreshKey);

  const chartData = (data ?? []).map((bucket) => ({
    level: LEVEL_LABELS[bucket.level] ?? bucket.level,
    count: bucket.count,
    fill: LEVEL_COLORS[bucket.level] ?? "#6b7280",
  }));

  const totalAnalyses = chartData.reduce((runningTotal, bucket) => runningTotal + bucket.count, 0);

  if (!isLoading && totalAnalyses === 0) {
    return null;
  }

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <CardTitle>Confidence Distribution</CardTitle>
        </div>
        <CardDescription>
          Breakdown of analysis confidence levels across {totalAnalyses} analyses.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ChartContainer config={CHART_CONFIG} className="h-48 w-full">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "hsl(var(--foreground))" }}
              />
              <YAxis
                dataKey="level"
                type="category"
                width={120}
                tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};
