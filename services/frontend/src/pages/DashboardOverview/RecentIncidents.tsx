import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { truncateText, getSeverityStyle, titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { Siren } from "lucide-react";
import type { IncidentAlertRecord } from "@/hooks/useIncidentData";
import type { RecentIncidentsProps } from "./types";

export const RecentIncidents = ({ items }: RecentIncidentsProps) => (
  <Card className="border-t-2 border-t-orange-500/40">
    <CardHeader className="border-b">
      <div className="flex items-center gap-2">
        <Siren className="w-5 h-5 text-orange-500" />
        <CardTitle>
          <h2>Recent Incidents</h2>
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent className="pt-2">
      <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
        {items.map((incident: IncidentAlertRecord) => (
          <Link
            key={incident.id}
            to="/dashboard/incidents/active"
            className="block py-3 first:pt-2 last:pb-1 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 -mx-4 px-4 sm:-mx-6 sm:px-6 transition-colors duration-200"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <TimeDisplay
                dateTime={incident.receivedAt}
                className="text-xs text-zinc-400 dark:text-zinc-400"
              />
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0", getSeverityStyle(incident.severity))}
              >
                {titleCase(incident.severity)}
              </Badge>
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {truncateText(incident.title, 60)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {titleCase(incident.source)}
            </p>
          </Link>
        ))}
      </div>
    </CardContent>
    <CardFooter className="border-t">
      <Link
        to="/dashboard/incidents/active"
        className="group/link inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
      >
        View all incidents
        <span className="transition-transform duration-200 group-hover/link:translate-x-0.5">
          &rarr;
        </span>
      </Link>
    </CardFooter>
  </Card>
);
