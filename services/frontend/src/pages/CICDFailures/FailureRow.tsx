import { Link } from "react-router-dom";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChevronRight, ExternalLink, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSafeGitHubUrl } from "@/lib/urlSafety";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  getSeverityStyle,
  getPayloadString,
  titleCase,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import type { FailureRowProps } from "./types";

/** Renders a commit SHA as a link, plain text, or placeholder. */
const CommitDisplay = ({
  sha,
  repository,
}: {
  readonly sha: string;
  readonly repository: string;
}) => {
  if (sha === "--") {
    return <span className="font-sans text-zinc-400 dark:text-zinc-500">N/A</span>;
  }

  const shortSha = sha.slice(0, 7);
  // Defense-in-depth: validate repository path to prevent URL path traversal
  const commitUrl = repository !== "--" ? buildSafeGitHubUrl(repository, `/commit/${sha}`) : null;

  if (!commitUrl) {
    return <span>{shortSha}</span>;
  }

  return (
    <a
      href={commitUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-indigo-500 underline decoration-dotted underline-offset-2 transition-colors"
      onClick={(event) => event.stopPropagation()}
    >
      {shortSha}
    </a>
  );
};

export const FailureRow = ({ event, analysisStatus, isExpanded, onClick }: FailureRowProps) => {
  const repository = getPayloadString(event.payload, "repository");
  const checkName = getPayloadString(event.payload, "checkName");
  const conclusion = getPayloadString(event.payload, "conclusion");
  const headSha = getPayloadString(event.payload, "headSha");

  return (
    <TableRow
      onClick={onClick}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
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
        <TimeDisplay dateTime={event.timestamp} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{repository}</span>
          {(() => {
            const repoUrl = buildSafeGitHubUrl(repository);
            return repoUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${repository} on GitHub`}
                    className="text-zinc-400 hover:text-indigo-500 transition-colors"
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open on GitHub</TooltipContent>
              </Tooltip>
            ) : null;
          })()}
        </div>
      </TableCell>
      <TableCell className="text-zinc-700 dark:text-zinc-300">{checkName}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", getSeverityStyle(event.severity))}>
          {titleCase(event.severity ?? "unknown")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
        >
          {conclusion}
        </Badge>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">
        <CommitDisplay sha={headSha} repository={repository} />
      </TableCell>
      <TableCell>
        {analysisStatus ? (
          <Link
            to={`/dashboard/cicd/analyses/${analysisStatus.analysisId}`}
            className="inline-flex items-center gap-1.5 group"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
          >
            <Badge
              variant="outline"
              className={cn(
                "text-xs group-hover:ring-1 group-hover:ring-indigo-300 transition-all",
                getConfidenceStyle(analysisStatus.confidence)
              )}
            >
              <Search className="w-3 h-3 mr-1" />
              {getConfidenceLabel(analysisStatus.confidence)}
            </Badge>
          </Link>
        ) : (
          <Badge
            variant="outline"
            className="text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
};
