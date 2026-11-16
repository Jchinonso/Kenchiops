/**
 * Headline stat cards for the reliability metrics page.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Gauge, Sparkles, ShieldCheck, Timer, Activity } from "lucide-react";
import { formatCount, formatDuration, formatHoursSaved, formatPercent } from "./helpers";
import type { ReliabilityMetrics } from "./types";

interface MetricsStatCardsProps {
  readonly metrics: ReliabilityMetrics | undefined;
  readonly isLoading: boolean;
}

interface StatDef {
  readonly title: string;
  readonly value: string;
  readonly subtitle: string;
  readonly icon: React.ReactNode;
  readonly colorClass: string;
}

/** Fixed skeleton slots (matches the six real cards). */
const SKELETON_SLOTS: readonly string[] = ["s1", "s2", "s3", "s4", "s5", "s6"];

const buildStats = (metrics: ReliabilityMetrics): readonly StatDef[] => {
  const { summary, timeSaved } = metrics;
  return [
    {
      title: "Median time-to-triage",
      value: formatDuration(summary.medianTimeToTriageSeconds),
      subtitle: "Alert received → triaged",
      icon: <Clock className="w-5 h-5 text-white" />,
      colorClass: "bg-indigo-500",
    },
    {
      title: "Est. engineer time saved",
      value: formatHoursSaved(timeSaved.estimatedHoursSaved),
      subtitle: `vs. ${timeSaved.assumedManualMinutesPerIncident}m manual baseline`,
      icon: <Timer className="w-5 h-5 text-white" />,
      colorClass: "bg-emerald-500",
    },
    {
      title: "Incidents triaged",
      value: formatCount(summary.incidentsTriaged),
      subtitle: `of ${formatCount(summary.incidentsTotal)} ingested`,
      icon: <ShieldCheck className="w-5 h-5 text-white" />,
      colorClass: "bg-blue-500",
    },
    {
      title: "AI success rate",
      value: formatPercent(summary.aiSuccessRate),
      subtitle: "AI summary used vs. fallback",
      icon: <Sparkles className="w-5 h-5 text-white" />,
      colorClass: "bg-violet-500",
    },
    {
      title: "P90 time-to-triage",
      value: formatDuration(summary.p90TimeToTriageSeconds),
      subtitle: "90th percentile",
      icon: <Gauge className="w-5 h-5 text-white" />,
      colorClass: "bg-amber-500",
    },
    {
      title: "CI/CD analyses",
      value: formatCount(summary.analysesTotal),
      subtitle: "Total failures analyzed",
      icon: <Activity className="w-5 h-5 text-white" />,
      colorClass: "bg-rose-500",
    },
  ];
};

export const MetricsStatCards = ({ metrics, isLoading }: MetricsStatCardsProps) => {
  const stats = metrics ? buildStats(metrics) : [];

  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
        {SKELETON_SLOTS.map((slot) => (
          <Card key={slot} className="py-4 sm:py-5">
            <CardContent className="px-4 sm:px-6">
              <Skeleton className="h-4 w-28 mb-3" />
              <Skeleton className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
      {stats.map((stat) => (
        <Card key={stat.title} className="py-4 sm:py-5 h-full">
          <CardContent className="px-4 sm:px-6 h-full">
            <div className="flex items-start justify-between gap-3 h-full">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 truncate">
                  {stat.title}
                </p>
                <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {stat.value}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {stat.subtitle}
                </p>
              </div>
              <div
                className={`w-10 h-10 lg:w-12 lg:h-12 ${stat.colorClass} rounded-full flex items-center justify-center flex-shrink-0`}
              >
                {stat.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
