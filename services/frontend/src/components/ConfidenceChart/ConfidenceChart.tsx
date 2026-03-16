/**
 * Confidence Distribution Chart
 *
 * Bar chart showing the breakdown of analysis confidence levels
 * (High, Medium, Low) using recharts + shadcn ChartContainer.
 */

import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { useConfidenceDistribution } from "@/hooks/useDashboardData";
import {
  CHART_CONFIG,
  LEVEL_COLORS,
  LEVEL_LABELS,
  LEVEL_LABELS_SHORT,
  ALL_LEVELS,
} from "./constants";

// ==================== Component ====================

export const ConfidenceChart = () => {
  const { data, isLoading } = useConfidenceDistribution();
  const isMobile = useIsMobile();
  const labels = isMobile ? LEVEL_LABELS_SHORT : LEVEL_LABELS;

  const { chartData, totalAnalyses } = useMemo(() => {
    const apiMap = new Map((data ?? []).map((bucket) => [bucket.level, bucket.count]));
    const items = ALL_LEVELS.map((level) => ({
      level: labels[level] ?? level,
      count: apiMap.get(level) ?? 0,
      fill: LEVEL_COLORS[level] ?? "#6b7280",
    }));
    const total = items.reduce((runningTotal, bucket) => runningTotal + bucket.count, 0);
    return { chartData: items, totalAnalyses: total };
  }, [data, labels]);

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          <CardTitle>
            <h2>Confidence Distribution</h2>
          </CardTitle>
        </div>
        <CardDescription>
          {totalAnalyses > 0
            ? `Breakdown of analysis confidence levels across ${totalAnalyses} analys${totalAnalyses === 1 ? "is" : "es"}.`
            : "No analyses recorded yet. Confidence breakdown will appear here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ChartContainer
            config={CHART_CONFIG}
            className="h-48 w-full"
            role="img"
            aria-label={`Confidence distribution bar chart showing breakdown across ${totalAnalyses} analyses: High, Medium, and Low confidence levels`}
          >
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
                width={isMobile ? 70 : 120}
                tick={{ fontSize: isMobile ? 11 : 12, fill: "hsl(var(--foreground))" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="count"
                  position="right"
                  fill="hsl(var(--foreground))"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};
