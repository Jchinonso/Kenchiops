/**
 * Severity breakdown — triaged incidents by severity label.
 */

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers } from "lucide-react";
import { SEVERITY_CHART_CONFIG, SEVERITY_COLORS } from "./constants";
import type { SeverityCount } from "./types";

interface SeverityBreakdownProps {
  readonly breakdown: readonly SeverityCount[];
  readonly isLoading: boolean;
}

const titleCaseSeverity = (severity: string): string =>
  severity.charAt(0).toUpperCase() + severity.slice(1);

export const SeverityBreakdown = ({ breakdown, isLoading }: SeverityBreakdownProps) => {
  const chartData = useMemo(
    () =>
      breakdown.map((entry) => ({
        severity: titleCaseSeverity(entry.severity),
        count: entry.count,
        fill: SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.unknown,
      })),
    [breakdown]
  );

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" />
          <CardTitle>
            <h2>Incidents by severity</h2>
          </CardTitle>
        </div>
        <CardDescription>
          {chartData.length > 0
            ? "Triaged incidents grouped by classified severity."
            : "No triaged incidents yet. Severity mix will appear here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            Awaiting incident data
          </div>
        ) : (
          <ChartContainer config={SEVERITY_CHART_CONFIG} className="h-48 w-full">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "hsl(var(--foreground))" }}
              />
              <YAxis
                dataKey="severity"
                type="category"
                width={80}
                tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.severity} fill={entry.fill} />
                ))}
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
