import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ExternalLink, Trash2 } from "lucide-react";
import { formatTimestamp, formatSnakeCase, truncateText } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import { cn } from "@/lib/utils";
import type { DocTableRowProps } from "./types";

export const DocTableRow = ({
  doc,
  isSelected,
  onToggleSelect,
  onClick,
  onDelete,
  isDeleting,
}: DocTableRowProps) => (
  <TableRow
    className={cn(
      "group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
      isSelected && "bg-indigo-50/50 dark:bg-indigo-950/20"
    )}
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    }}
  >
    <TableCell className="w-10 pr-0">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(doc.id)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Select ${truncateText(doc.title, 30)}`}
      />
    </TableCell>
    <TableCell className="max-w-[300px]">
      <div className="flex items-center gap-2">
        <span
          className="text-sm text-zinc-900 dark:text-zinc-100"
          title={truncateText(doc.title, 100)}
        >
          {truncateText(doc.title, 60)}
        </span>
        {/* SECURITY (VULN-703): Validate URL protocol before rendering as link */}
        {doc.sourceUrl && isSafeUrl(doc.sourceUrl) && (
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open source for ${truncateText(doc.title, 30)} in new tab`}
            className="text-zinc-400 hover:text-indigo-500 transition-colors flex-shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </TableCell>
    <TableCell>
      <Badge variant="secondary" className="text-xs">
        {formatSnakeCase(doc.docType)}
      </Badge>
    </TableCell>
    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
      {doc.repository ?? "--"}
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[200px]">
      <span title={truncateText(doc.content, 100)}>{truncateText(doc.content, 50)}</span>
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
      {formatTimestamp(doc.createdAt)}
    </TableCell>
    <TableCell className="w-10 pl-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            disabled={isDeleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(doc.id);
            }}
            aria-label="Delete document"
          >
            <Trash2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete document</TooltipContent>
      </Tooltip>
    </TableCell>
  </TableRow>
);
