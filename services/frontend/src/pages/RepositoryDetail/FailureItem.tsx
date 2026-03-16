import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSeverityStyle, getPayloadString, titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import type { FailureItemProps } from "./types";

export const FailureItem = ({ event }: FailureItemProps) => {
  const checkName = getPayloadString(event.payload, "checkName");
  const conclusion = getPayloadString(event.payload, "conclusion");

  return (
    <Link
      to="/dashboard/cicd/analyses"
      className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 -mx-6 px-6 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <TimeDisplay
          dateTime={event.timestamp}
          className="text-xs text-zinc-400 dark:text-zinc-400"
        />
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0", getSeverityStyle(event.severity))}
        >
          {titleCase(event.severity ?? "unknown")}
        </Badge>
      </div>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{checkName}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{conclusion}</p>
    </Link>
  );
};
