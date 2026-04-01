/**
 * InvestigationCard
 *
 * Displays investigation results (diagnosis, suggested actions, evidence sources)
 * in a collapsible card above the chat message stream. Shows a skeleton
 * loading state while the investigation pipeline is running.
 */

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Search, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatInvestigationDiagnosis } from "@/hooks/useCopilotChat/types";

interface InvestigationCardProps {
  readonly isInvestigating: boolean;
  readonly diagnosis: ChatInvestigationDiagnosis | null;
}

const PRIORITY_LABELS: Readonly<Record<string, string>> = {
  immediate: "URGENT",
  short_term: "SHORT-TERM",
  long_term: "LONG-TERM",
};

const PRIORITY_COLORS: Readonly<Record<string, string>> = {
  immediate: "text-red-400",
  short_term: "text-amber-400",
  long_term: "text-blue-400",
};

export const InvestigationCard = ({ isInvestigating, diagnosis }: InvestigationCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Loading skeleton
  if (isInvestigating && !diagnosis) {
    return (
      <div className="mx-3 mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Search className="size-3.5 animate-pulse" />
          <span>Investigating incident...</span>
        </div>
        <div className="mt-2 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!diagnosis) {
    return null;
  }

  const confidencePct = Math.round(diagnosis.confidence * 100);

  return (
    <div className="mx-3 mt-3 rounded-lg border border-border/50 bg-muted/30">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={toggleExpand}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-primary" />
          <span className="font-medium">Investigation Results</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Confidence: {confidencePct}%</span>
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expandable body */}
      {isExpanded && (
        <div className="border-t border-border/30 px-3 pb-3 pt-2 text-xs">
          {/* Root cause */}
          <p className="text-foreground">
            <span className="font-medium">Root Cause: </span>
            {diagnosis.rootCauseHypothesis}
          </p>

          {/* Suggested actions */}
          {diagnosis.suggestedActions.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 font-medium text-muted-foreground">Suggested Actions</p>
              <ul className="space-y-0.5">
                {diagnosis.suggestedActions.map((item) => (
                  <li key={`action-${item.priority}-${item.action}`} className="flex gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[10px]",
                        PRIORITY_COLORS[item.priority] ?? "text-muted-foreground"
                      )}
                    >
                      [{PRIORITY_LABELS[item.priority] ?? item.priority}]
                    </span>
                    <span className="text-foreground/80">{item.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence sources */}
          {diagnosis.evidenceSources.length > 0 && (
            <p className="mt-2 text-muted-foreground">
              Evidence: {diagnosis.evidenceSources.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
