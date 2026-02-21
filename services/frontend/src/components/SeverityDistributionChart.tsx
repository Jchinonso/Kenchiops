/**
 * Severity Distribution Chart
 *
 * Horizontal bar chart showing the breakdown of incident severity levels
 * (Critical, High, Medium, Low, Info) using recharts + shadcn ChartContainer.
 * When multiple sources have data, shows grouped bars by source.
 */

import { useMemo, useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";
import type { SeverityDistributionEntry, SeverityBySourceEntry } from "@/hooks/useIncidentData";

// ==================== Config ====================

const CHART_CONFIG: ChartConfig = {
  count: {
    label: "Incidents",
  },
} as const;

const SEVERITY_COLORS: Readonly<Record<string, string>> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
} as const;

const SOURCE_COLORS: Readonly<Record<string, string>> = {
  pagerduty: "#06b6d4",
  datadog: "#8b5cf6",
  grafana: "#f59e0b",
  prometheus: "#ef4444",
  vercel: "#171717",
  netlify: "#00c7b7",
} as const;

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
} as const;

/** Max time to show skeleton before giving up (ms) */
const LOADING_TIMEOUT_MS = 5_000;

// ==================== Props ====================

interface SeverityDistributionChartProps {
  readonly distribution: readonly SeverityDistributionEntry[] | null;
  readonly distributionBySource?: readonly SeverityBySourceEntry[] | null;
  readonly isLoading: boolean;
}

// ==================== Component ====================

export const SeverityDistributionChart = ({
  distribution,
  distributionBySource,
  isLoading,
}: SeverityDistributionChartProps) => {
  // Timeout the skeleton so it doesn't spin forever when no data arrives
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [isLoading]);

  const showSkeleton = isLoading && !timedOut;

  const apiMap = new Map(
    (distribution ?? []).map((entry) => [entry.severityLabel.toLowerCase(), entry.count])
  );

  const totalIncidents = SEVERITY_ORDER.reduce(
    (runningTotal, severity) => runningTotal + (apiMap.get(severity) ?? 0),
    0
  );

  // Determine unique sources from per-source data
  const sources = useMemo(() => {
    if (!distributionBySource || distributionBySource.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    return distributionBySource.reduce<readonly string[]>((acc, entry) => {
      if (seen.has(entry.source)) {
        return acc;
      }
      seen.add(entry.source);
      return [...acc, entry.source];
    }, []);
  }, [distributionBySource]);

  const useGrouped = sources.length > 1;

  // Grouped chart data: severity × source
  const groupedChartData = useMemo(() => {
    if (!useGrouped || !distributionBySource) {
      return [];
    }

    const lookup = new Map<string, Map<string, number>>();
    distributionBySource.forEach((entry) => {
      const sevKey = entry.severityLabel.toLowerCase();
      const existing = lookup.get(sevKey) ?? new Map<string, number>();
      existing.set(entry.source, entry.count);
      lookup.set(sevKey, existing);
    });

    return SEVERITY_ORDER.map((severity) => {
      const sourceCounts = lookup.get(severity) ?? new Map<string, number>();
      return {
        severity: SEVERITY_LABELS[severity] ?? severity,
        ...Object.fromEntries(sources.map((source) => [source, sourceCounts.get(source) ?? 0])),
      };
    });
  }, [useGrouped, distributionBySource, sources]);

  // Aggregate chart data (single color per severity)
  const chartData = SEVERITY_ORDER.map((severity) => ({
    severity: SEVERITY_LABELS[severity] ?? severity,
    count: apiMap.get(severity) ?? 0,
    fill: SEVERITY_COLORS[severity] ?? "#6b7280",
  }));

  const groupedConfig = useMemo((): ChartConfig => {
    const cfg: Record<string, { readonly label: string; readonly color?: string }> = {};
    sources.forEach((source) => {
      cfg[source] = {
        label: source.charAt(0).toUpperCase() + source.slice(1),
        color: SOURCE_COLORS[source] ?? "#6b7280",
      };
    });
    return cfg;
  }, [sources]);

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-orange-500" />
          <CardTitle>
            <h2>Severity Distribution</h2>
          </CardTitle>
        </div>
        <CardDescription>
          {showSkeleton
            ? "Loading severity data\u2026"
            : totalIncidents > 0
              ? `Breakdown of incident severity levels across ${totalIncidents} incident${totalIncidents === 1 ? "" : "s"}.${useGrouped ? " Grouped by source." : ""}`
              : "No incidents recorded yet. Severity breakdown will appear here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {showSkeleton ? (
          <Skeleton className="h-56 w-full" />
        ) : totalIncidents === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No severity data available.
          </p>
        ) : useGrouped ? (
          <ChartContainer
            config={groupedConfig}
            className="h-64 w-full"
            role="img"
            aria-label={`Severity distribution grouped by source across ${totalIncidents} incidents`}
          >
            <BarChart data={groupedChartData} layout="vertical">
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
              <Legend />
              {sources.map((source) => (
                <Bar
                  key={source}
                  dataKey={source}
                  fill={SOURCE_COLORS[source] ?? "#6b7280"}
                  radius={[0, 4, 4, 0]}
                  name={source.charAt(0).toUpperCase() + source.slice(1)}
                />
              ))}
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartContainer
            config={CHART_CONFIG}
            className="h-56 w-full"
            role="img"
            aria-label={`Severity distribution bar chart showing breakdown across ${totalIncidents} incidents: Critical, High, Medium, Low, and Info levels`}
          >
            <BarChart data={chartData} layout="vertical">
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
