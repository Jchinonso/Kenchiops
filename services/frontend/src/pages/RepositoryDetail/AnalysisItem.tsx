import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { truncateText, getConfidenceLabel, getConfidenceStyle } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import type { AnalysisItemProps } from "./types";

export const AnalysisItem = ({ analysis }: AnalysisItemProps) => (
  <Link
    to={`/dashboard/cicd/analyses/${analysis.id}`}
    className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 -mx-6 px-6 transition-colors"
  >
    <div className="flex items-center justify-between gap-2 mb-1">
      <TimeDisplay
        dateTime={analysis.createdAt}
        className="text-xs text-zinc-400 dark:text-zinc-400"
      />
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0", getConfidenceStyle(analysis.diagnosisConfidence))}
      >
        {getConfidenceLabel(analysis.diagnosisConfidence)}
      </Badge>
    </div>
    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
      {truncateText(analysis.summary, 80)}
    </p>
    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
      {analysis.identifiedCause ? truncateText(analysis.identifiedCause, 60) : "--"}
    </p>
  </Link>
);
