import { ChevronRight } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  truncateText,
  extractRepoFromKey,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import type { AnalysisRowProps } from "./types";
import { buildCommitUrl } from "./helpers";
import { PROVIDER_BADGE_CONFIG } from "./constants";

/** Renders a commit SHA as a link, plain text, or placeholder. */
const CommitDisplay = ({
  sha,
  url,
}: {
  readonly sha: string | null;
  readonly url: string | null;
}) => {
  if (!sha) {
    return <span className="font-sans text-zinc-400 dark:text-zinc-500">--</span>;
  }

  const shortSha = sha.slice(0, 7);

  if (!url) {
    return <span>{shortSha}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-indigo-500 underline decoration-dotted underline-offset-2 transition-colors"
      onClick={(event) => event.stopPropagation()}
    >
      {shortSha}
    </a>
  );
};

export const AnalysisRow = ({ analysis, isExpanded, onClick }: AnalysisRowProps) => {
  const repo = extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis);
  const confidence = Math.round(analysis.diagnosisConfidence * 100);
  const commitSha = analysis.headSha ?? null;
  const commitUrl =
    commitSha && repo !== "--" ? buildCommitUrl(repo, commitSha, analysis.ciProvider) : null;
  const providerBadge = analysis.ciProvider
    ? (PROVIDER_BADGE_CONFIG[analysis.ciProvider] ?? null)
    : null;

  return (
    <TableRow
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      aria-expanded={isExpanded}
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
    >
      <TableCell className="w-8">
        <ChevronRight
          aria-hidden="true"
          className={cn("w-4 h-4 text-zinc-400 transition-transform", isExpanded && "rotate-90")}
        />
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs">
        <TimeDisplay dateTime={analysis.createdAt} />
      </TableCell>
      <TableCell className="text-zinc-700 dark:text-zinc-300 font-medium text-xs">
        <div className="flex items-center gap-1.5">
          <span>{repo}</span>
          {providerBadge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 flex-shrink-0">
              {providerBadge.icon}
              {providerBadge.label}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-sm">
        <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
          {truncateText(analysis.summary, 100)}
        </p>
        {analysis.identifiedCause && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            Cause: {truncateText(analysis.identifiedCause, 60)}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", getConfidenceStyle(analysis.diagnosisConfidence))}
        >
          {getConfidenceLabel(analysis.diagnosisConfidence)} ({confidence}%)
        </Badge>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">
        <CommitDisplay sha={commitSha} url={commitUrl} />
      </TableCell>
    </TableRow>
  );
};
