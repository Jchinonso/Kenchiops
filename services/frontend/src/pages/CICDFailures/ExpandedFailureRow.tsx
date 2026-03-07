import { Fragment } from "react";
import { Link } from "react-router-dom";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSafeGitHubUrl } from "@/lib/urlSafety";
import { formatTimestamp, getSeverityStyle, getPayloadString, titleCase } from "@/lib/formatters";
import type { ExpandedFailureRowProps } from "./types";

export const ExpandedFailureRow = ({ event, analysisStatus }: ExpandedFailureRowProps) => {
  const repository = getPayloadString(event.payload, "repository");
  const checkName = getPayloadString(event.payload, "checkName");
  const workflowName = getPayloadString(event.payload, "workflowName");
  const branch = getPayloadString(event.payload, "branch");
  const headSha = getPayloadString(event.payload, "headSha");
  const conclusion = getPayloadString(event.payload, "conclusion");
  // Defense-in-depth: validate repository path to prevent URL path traversal
  const commitUrl =
    repository !== "--" && headSha !== "--"
      ? buildSafeGitHubUrl(repository, `/commit/${headSha}`)
      : null;

  const allDetails: ReadonlyArray<readonly [string, string]> = [
    ["Repository", repository],
    ["Check Name", checkName],
    ["Workflow Name", workflowName],
    ["Branch", branch],
    ["Commit SHA", headSha],
    ["Conclusion", conclusion],
    ["Detected At", event.timestamp ? formatTimestamp(event.timestamp) : "--"],
    ["Ingested At", event.createdAt ? formatTimestamp(event.createdAt) : "--"],
  ];
  const visibleDetails = allDetails.filter(([, value]) => value !== "--");

  return (
    <TableRow className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <TableCell colSpan={8} className="bg-zinc-50 dark:bg-zinc-800/50 border-b p-0">
        <div className="p-4 space-y-3">
          {event.severity && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Severity:</span>
              <Badge variant="outline" className={cn("text-xs", getSeverityStyle(event.severity))}>
                {titleCase(event.severity)}
              </Badge>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Payload Details
            </h4>
            {visibleDetails.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {visibleDetails.map(([label, value]) => (
                  <Fragment key={label}>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{value}</span>
                  </Fragment>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Limited payload data available for this event.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {commitUrl && (
              <a
                href={commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            )}
            {analysisStatus && (
              <Link
                to={`/dashboard/cicd/analyses/${analysisStatus.analysisId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
                <Search className="w-3.5 h-3.5" />
                View Analysis
              </Link>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};
