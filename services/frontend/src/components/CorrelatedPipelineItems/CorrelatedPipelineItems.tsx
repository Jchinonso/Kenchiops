/**
 * Correlated Pipeline Items
 *
 * Shows cross-pipeline correlations for a given commit SHA.
 * Fetches related CI/CD analyses and incident alerts via the correlation endpoint.
 * Used inside both IncidentDetailPanel and AnalysisDetailPanel.
 */

import { Link } from "react-router-dom";
import { GitCommit, Search, Siren, Loader2 } from "lucide-react";
import { useCorrelation } from "@/hooks/useDashboardData";
import { truncateText } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import type { CorrelatedPipelineItemsProps, CorrelationItemProps } from "./types";

// ==================== Sub-components ====================

const CorrelationItem = ({ item, to, icon }: CorrelationItemProps) => (
  <Link
    to={to}
    className="flex items-center gap-2.5 py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors group"
  >
    <span className="shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-indigo-500 transition-colors">
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
        {truncateText(item.title, 80)}
      </p>
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
        <TimeDisplay dateTime={item.createdAt} />
      </span>
    </div>
  </Link>
);

// ==================== Main Component ====================

export const CorrelatedPipelineItems = ({
  commitSha,
  sourcePipeline,
}: CorrelatedPipelineItemsProps) => {
  const { data, isLoading } = useCorrelation(commitSha);

  const showAnalyses = sourcePipeline === "incident";
  const showIncidents = sourcePipeline === "cicd";

  const analyses = data?.analyses ?? [];
  const incidents = data?.incidents ?? [];

  const hasAnalyses = showAnalyses && analyses.length > 0;
  const hasIncidents = showIncidents && incidents.length > 0;
  const hasCorrelations = hasAnalyses || hasIncidents;

  if (!commitSha || (!isLoading && !hasCorrelations)) {
    return null;
  }

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Cross-Pipeline
          </h4>
        </div>
        <div className="flex items-center gap-2 py-3 text-xs text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Checking for related items...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
        <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Cross-Pipeline
        </h4>
      </div>
      <div className="space-y-1.5">
        {hasAnalyses &&
          analyses.map((analysis) => (
            <CorrelationItem
              key={analysis.id}
              item={analysis}
              to={`/dashboard/cicd/analyses?id=${analysis.id}`}
              icon={<Search className="w-3.5 h-3.5" />}
            />
          ))}
        {hasIncidents &&
          incidents.map((incident) => (
            <CorrelationItem
              key={incident.id}
              item={incident}
              to={`/dashboard/incidents/active?id=${incident.id}`}
              icon={<Siren className="w-3.5 h-3.5" />}
            />
          ))}
      </div>
    </div>
  );
};
