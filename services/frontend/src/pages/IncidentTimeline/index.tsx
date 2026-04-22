/**
 * Incident Timeline Page
 *
 * Unified chronological feed of incidents, CI failures, and analyses.
 * Filters by time range and source with paginated card layout.
 */

import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Clock,
  Siren,
  GitBranch,
  Search,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTimeline, type TimelineEntry, type TimeRange } from "@/hooks/useTimelineData";
import { cn } from "@/lib/utils";

// ==================== Constants ====================

const PAGE_SIZE = 30;

const TIME_RANGE_OPTIONS: ReadonlyArray<{ readonly value: TimeRange; readonly label: string }> = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const SOURCE_OPTIONS: readonly string[] = [
  "all",
  "prometheus",
  "grafana",
  "datadog",
  "pagerduty",
  "github",
  "vercel",
  "netlify",
];

// ==================== Helpers ====================

const getTypeIcon = (type: TimelineEntry["type"]): React.ReactNode => {
  switch (type) {
    case "incident":
      return <Siren className="w-4 h-4 text-red-500" />;
    case "ci_failure":
      return <GitBranch className="w-4 h-4 text-amber-500" />;
    case "analysis":
      return <Search className="w-4 h-4 text-blue-500" />;
    default:
      return <Info className="w-4 h-4 text-zinc-400" />;
  }
};

const getSeverityBadgeClasses = (severity: string): string => {
  switch (severity) {
    case "critical":
      return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
    case "high":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800";
    case "medium":
    case "warning":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    case "low":
    case "info":
      return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    default:
      return "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700";
  }
};

const getTypeBadgeClasses = (type: TimelineEntry["type"]): string => {
  switch (type) {
    case "incident":
      return "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400";
    case "ci_failure":
      return "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400";
    case "analysis":
      return "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400";
    default:
      return "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400";
  }
};

const formatRelativeTime = (timestamp: string): string => {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
};

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

// ==================== Sub-components ====================

interface TimelineCardProps {
  readonly entry: TimelineEntry;
}

const TimelineCard = ({ entry }: TimelineCardProps) => (
  <div className="flex items-start gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
    <div className="mt-0.5 flex-shrink-0">{getTypeIcon(entry.type)}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
          {entry.title}
        </h3>
        <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>
      {entry.description && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {entry.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded-full",
            getTypeBadgeClasses(entry.type)
          )}
        >
          {entry.type === "ci_failure" ? "CI Failure" : titleCase(entry.type)}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded-full border",
            getSeverityBadgeClasses(entry.severity)
          )}
        >
          {titleCase(entry.severity)}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
          {entry.source}
        </span>
      </div>
    </div>
  </div>
);

// ==================== Main Component ====================

export const IncidentTimeline = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [offset, setOffset] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [sourceFilter, setSourceFilter] = useState("all");

  const { data, isLoading, error } = useTimeline({
    tenantId,
    limit: PAGE_SIZE,
    offset,
    timeRange,
    source: sourceFilter === "all" ? undefined : sourceFilter,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    setOffset(0);
  };

  const handleSourceChange = (source: string) => {
    setSourceFilter(source);
    setOffset(0);
  };

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            Incident Timeline
          </h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No tenant configured</EmptyTitle>
                <EmptyDescription>
                  Connect your organization in Settings to see the incident timeline.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Incident Timeline
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Unified chronological feed of incidents, CI failures, and analyses across all sources.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Time:</span>
          {TIME_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleTimeRangeChange(option.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                timeRange === option.value
                  ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                  : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Source:</span>
          <select
            value={sourceFilter}
            onChange={(event) => handleSourceChange(event.target.value)}
            className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>
                {source === "all" ? "All sources" : titleCase(source)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            <CardTitle>Timeline</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} event${total > 1 ? "s" : ""} found`
              : "No events in the selected time range"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-sm text-red-500">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Failed to load timeline
            </div>
          ) : items.length === 0 ? (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No events found</EmptyTitle>
                <EmptyDescription>Try adjusting the time range or source filter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2">
              {items.map((entry) => (
                <TimelineCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-4">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
