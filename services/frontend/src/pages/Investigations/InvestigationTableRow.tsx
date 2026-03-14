import { TableRow, TableCell } from "@/components/ui/table";
import type { InvestigationRecord } from "@/hooks/useInvestigationData";
import {
  getInvestigationStatusStyle,
  formatDuration,
  formatTimestamp,
  titleCase,
  truncateText,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface InvestigationTableRowProps {
  readonly investigation: InvestigationRecord;
  readonly onClick: () => void;
}

export const InvestigationTableRow = ({ investigation, onClick }: InvestigationTableRowProps) => {
  const confidence = investigation.diagnosis?.confidence;
  const confidenceDisplay =
    confidence !== undefined && confidence !== null ? `${Math.round(confidence * 100)}%` : "--";

  return (
    <TableRow
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
      onClick={onClick}
      onKeyDown={(keyEvent) => {
        const { key } = keyEvent;
        if (key === "Enter" || key === " ") {
          keyEvent.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="link"
    >
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
            getInvestigationStatusStyle(investigation.status)
          )}
        >
          {titleCase(investigation.status)}
        </span>
      </TableCell>
      <TableCell className="max-w-[300px]">
        <span
          className="text-sm text-zinc-900 dark:text-zinc-100"
          title={investigation.description}
        >
          {truncateText(investigation.description, 80)}
        </span>
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {investigation.serviceName ?? "--"}
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {confidenceDisplay}
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {investigation.durationMs !== null ? formatDuration(investigation.durationMs) : "--"}
      </TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
        {formatTimestamp(investigation.createdAt)}
      </TableCell>
    </TableRow>
  );
};
