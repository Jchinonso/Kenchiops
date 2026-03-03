import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSeverityStyle, getPayloadString, titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { AlertTriangle } from "lucide-react";
import type { EventRecord } from "@/hooks/useDashboardData";
import type { RecentFailuresProps } from "./types";
import { getEventSourceLabel } from "./constants";

export const RecentFailures = ({ items }: RecentFailuresProps) => (
  <Card className="border-t-2 border-t-red-500/40">
    <CardHeader className="border-b">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <CardTitle>
          <h2>Recent Failures</h2>
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent className="pt-2">
      <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
        {items.map((event: EventRecord) => {
          const sourceLabel = getEventSourceLabel(event.source);
          return (
            <Link
              key={event.id}
              to="/dashboard/cicd/analyses"
              className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 -mx-6 px-6 transition-colors duration-200"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <TimeDisplay
                  dateTime={event.timestamp}
                  className="text-xs text-zinc-400 dark:text-zinc-400"
                />
                <div className="flex items-center gap-1.5">
                  {sourceLabel && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {sourceLabel}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0", getSeverityStyle(event.severity))}
                  >
                    {titleCase(event.severity ?? "unknown")}
                  </Badge>
                </div>
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {getPayloadString(event.payload, "repository")}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {getPayloadString(event.payload, "checkName")}
              </p>
            </Link>
          );
        })}
      </div>
    </CardContent>
    <CardFooter className="border-t">
      <Link
        to="/dashboard/cicd/analyses"
        className="group/link inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
      >
        View all failures
        <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">
          &rarr;
        </span>
      </Link>
    </CardFooter>
  </Card>
);
