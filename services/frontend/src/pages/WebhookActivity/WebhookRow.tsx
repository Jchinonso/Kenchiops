import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { getStatusStyle } from "./constants";
import { formatDuration } from "./helpers";
import type { WebhookRowProps } from "./types";

export const WebhookRow = ({ activity, isExpanded, onClick }: WebhookRowProps) => (
  <TableRow
    onClick={onClick}
    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
  >
    <TableCell className="w-8">
      <ChevronRight
        className={cn("w-4 h-4 text-zinc-400 transition-transform", isExpanded && "rotate-90")}
      />
    </TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs">
      <TimeDisplay dateTime={activity.createdAt} />
    </TableCell>
    <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-[160px] truncate">
      {activity.deliveryId}
    </TableCell>
    <TableCell className="text-zinc-900 dark:text-zinc-100 text-sm">{activity.eventType}</TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs">
      {titleCase(activity.source)}
    </TableCell>
    <TableCell>
      <Badge variant="outline" className={cn("text-xs", getStatusStyle(activity.status))}>
        {titleCase(activity.status)}
      </Badge>
    </TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs tabular-nums">
      {formatDuration(activity.processingTimeMs)}
    </TableCell>
  </TableRow>
);
