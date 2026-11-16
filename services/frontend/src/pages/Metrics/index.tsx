/**
 * Reliability Metrics page.
 *
 * Tenant-scoped MTTR, AI success rate, severity mix, time-to-triage trend, and a
 * clearly-labelled "estimated time saved" figure. Read-only; data from
 * GET /api/v1/metrics.
 */

import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Info, RefreshCw } from "lucide-react";
import { useReliabilityMetrics } from "./useMetrics";
import { MetricsStatCards } from "./MetricsStatCards";
import { MttrTrendChart } from "./MttrTrendChart";
import { SeverityBreakdown } from "./SeverityBreakdown";
import { formatHoursSaved } from "./helpers";

export const Metrics = () => {
  const { data: metrics, isLoading, error, refetch } = useReliabilityMetrics();

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-6 h-6 text-indigo-500" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reliability Metrics
          </h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Incident triage performance, AI quality, and estimated engineering time saved.
        </p>
      </header>

      {error ? (
        <Card className="mb-6">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load metrics. {error instanceof Error ? error.message : ""}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </CardContent>
        </Card>
      ) : (
        <>
          <MetricsStatCards metrics={metrics} isLoading={isLoading} />

          {metrics && metrics.timeSaved.estimatedHoursSaved > 0 && (
            <Card className="mb-6 sm:mb-8 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardContent className="py-4 px-4 sm:px-6 flex items-start gap-3">
                <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  <span className="font-semibold">
                    ~{formatHoursSaved(metrics.timeSaved.estimatedHoursSaved)} of engineer time
                    saved
                  </span>{" "}
                  — estimated across {metrics.summary.incidentsTriaged} triaged incidents, assuming
                  a {metrics.timeSaved.assumedManualMinutesPerIncident}-minute manual triage
                  baseline vs. Kenchi&apos;s measured median of{" "}
                  {metrics.timeSaved.kenchiMedianMinutesPerIncident ?? "—"} min. This is an
                  estimate, not a measurement — adjust the baseline to your team.
                </p>
              </CardContent>
            </Card>
          )}

          <MttrTrendChart trend={metrics?.mttrTrend ?? []} isLoading={isLoading} />
          <SeverityBreakdown breakdown={metrics?.severityBreakdown ?? []} isLoading={isLoading} />
        </>
      )}
    </div>
  );
};
