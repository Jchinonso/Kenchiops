/**
 * MTTR trend line chart — median time-to-triage (minutes) per day.
 */

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown } from "lucide-react";
import { TREND_CHART_CONFIG } from "./constants";
import { formatTrendDate, secondsToMinutes } from "./helpers";
import type { MttrTrendPoint } from "./types";

interface MttrTrendChartProps {
  readonly trend: readonly MttrTrendPoint[];
  readonly isLoading: boolean;
}

export const MttrTrendChart = ({ trend, isLoading }: MttrTrendChartProps) => {
  const chartData = useMemo(
    () =>
      trend.map((point) => ({
        date: formatTrendDate(point.date),
        medianMinutes: secondsToMinutes(point.medianTimeToTriageSeconds),
        triagedCount: point.triagedCount,
      })),
    [trend]
  );

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-500" />
          <CardTitle>
            <h2>Time-to-triage trend</h2>
          </CardTitle>
        </div>
        <CardDescription>
          {chartData.length > 0
            ? "Median minutes from alert received to triage complete, per day."
            : "No triaged incidents yet. The trend will appear here as incidents flow in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            Awaiting incident data
          </div>
        ) : (
          <ChartContainer config={TREND_CHART_CONFIG} className="h-56 w-full">
            <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="medianMinutes"
                stroke="var(--color-medianMinutes)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
};
