/**
 * Incident Detail Panel
 *
 * Sheet slide-over panel showing full incident triage details.
 * Opened from the Active Incidents table when "View Full Details" is clicked.
 */

import { useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  useIncidentDetail,
  useAcknowledgeIncident,
  useResolveIncident,
} from "@/hooks/useIncidentData";
import { getSourceLabel, formatTimestamp } from "@/lib/formatters";
import { IncidentDetailContent, IncidentDetailSkeleton } from "@/components/IncidentDetailContent";
import { CorrelatedPipelineItems } from "@/components/CorrelatedPipelineItems";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { buildIncidentUrl, extractCommitSha } from "./helpers";
import type { IncidentDetailPanelProps } from "./types";

// ==================== Main Component ====================

export const IncidentDetailPanel = ({
  incidentId,
  open,
  onClose,
  onRefresh,
}: IncidentDetailPanelProps) => {
  const { data, isLoading, error, refetch: refetchDetail } = useIncidentDetail(incidentId);
  const { acknowledge, isLoading: ackLoading } = useAcknowledgeIncident();
  const { resolve, isLoading: resolveLoading } = useResolveIncident();

  const handleAcknowledge = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    await acknowledge(incidentId);
    refetchDetail();
    onRefresh();
  }, [incidentId, acknowledge, refetchDetail, onRefresh]);

  const handleResolve = useCallback(async () => {
    if (!incidentId) {
      return;
    }
    await resolve(incidentId);
    refetchDetail();
    onRefresh();
  }, [incidentId, resolve, refetchDetail, onRefresh]);

  const commitSha = useMemo(() => {
    if (!data) {
      return null;
    }
    return extractCommitSha(data.alert.labels as Readonly<Record<string, string>>);
  }, [data]);

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
          {incidentId && <CopyLinkButton url={buildIncidentUrl(incidentId)} />}
        </SheetHeader>

        {isLoading ? (
          <IncidentDetailSkeleton />
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : data ? (
          <>
            <IncidentDetailContent
              data={data}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
              ackLoading={ackLoading}
              resolveLoading={resolveLoading}
            />
            <div className="px-4 pb-4">
              <CorrelatedPipelineItems commitSha={commitSha} sourcePipeline="incident" />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
