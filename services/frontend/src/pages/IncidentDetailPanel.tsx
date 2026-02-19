/**
 * Incident Detail Panel
 *
 * Sheet slide-over panel showing full incident triage details.
 * Opened from the Active Incidents table when "View Full Details" is clicked.
 */

import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Link2, Check } from "lucide-react";
import {
  useIncidentDetail,
  useAcknowledgeIncident,
  useResolveIncident,
} from "@/hooks/useIncidentData";
import { getSourceLabel, formatTimestamp } from "@/lib/formatters";
import { IncidentDetailContent, IncidentDetailSkeleton } from "@/components/IncidentDetailContent";

// ==================== Props ====================

interface IncidentDetailPanelProps {
  readonly incidentId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRefresh: () => void;
}

// ==================== Main Component ====================

export const IncidentDetailPanel = ({
  incidentId,
  open,
  onClose,
  onRefresh,
}: IncidentDetailPanelProps) => {
  const { data, isLoading, error } = useIncidentDetail(incidentId);
  const { acknowledge, isLoading: ackLoading } = useAcknowledgeIncident();
  const { resolve, isLoading: resolveLoading } = useResolveIncident();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    const url = `${window.location.origin}/dashboard/incidents/active?id=${incidentId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [incidentId]);

  const handleAcknowledge = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    await acknowledge(incidentId);
    onRefresh();
  }, [incidentId, acknowledge, onRefresh]);

  const handleResolve = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    await resolve(incidentId);
    onRefresh();
  }, [incidentId, resolve, onRefresh]);

  const title = data?.alert.title ?? "Incident Detail";
  const subtitle = error
    ? "Failed to load incident"
    : data
      ? `${getSourceLabel(data.alert.source)} \u00b7 ${formatTimestamp(data.alert.receivedAt)}`
      : "Loading incident details...";

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="pr-8 line-clamp-2">{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
          {incidentId && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors mt-1 self-start"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          )}
        </SheetHeader>

        {isLoading ? (
          <IncidentDetailSkeleton />
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : data ? (
          <IncidentDetailContent
            data={data}
            onAcknowledge={handleAcknowledge}
            onResolve={handleResolve}
            ackLoading={ackLoading}
            resolveLoading={resolveLoading}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
