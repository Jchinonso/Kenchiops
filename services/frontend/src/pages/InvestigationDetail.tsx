/**
 * Investigation Detail Page
 *
 * Full-page detail view for a single investigation.
 * Shows diagnosis, evidence, timeline, and correlation data.
 * Auto-polls when investigation is in an active state.
 */

import { Link, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvestigationDetail } from "@/hooks/useInvestigationData";
import { InvestigationEvidence } from "@/components/InvestigationEvidence";
import {
  StatBadge,
  DiagnosisSection,
  TimelineSection,
  CorrelationSection,
  ActiveStatusIndicator,
  FailedStatusDisplay,
} from "@/components/InvestigationDetailSections";
import {
  getInvestigationStatusStyle,
  getConfidenceStyle,
  formatDuration,
  formatTimestamp,
  titleCase,
} from "@/lib/formatters";

// ==================== Types ====================

interface InvestigationDetailProps {
  readonly investigationId: string;
  readonly refreshKey?: number;
}

// ==================== Helpers ====================

const getStatusIcon = (status: string): React.ReactNode =>
  status === "completed" ? (
    <CheckCircle2 className="w-4 h-4" />
  ) : status === "failed" ? (
    <XCircle className="w-4 h-4" />
  ) : (
    <Clock className="w-4 h-4" />
  );

const isActiveInvestigation = (status: string): boolean =>
  status === "queued" || status === "gathering" || status === "analyzing";

// ==================== Back Link ====================

const BackLink = () => (
  <Link
    to="/dashboard/incidents/investigations"
    className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
  >
    <ArrowLeft className="w-4 h-4" />
    Back to Investigations
  </Link>
);

// ==================== Main Component ====================

export const InvestigationDetail = ({
  investigationId,
  refreshKey = 0,
}: InvestigationDetailProps) => {
  const navigate = useNavigate();
  const {
    data: investigation,
    isLoading,
    error,
    refetch,
  } = useInvestigationDetail(investigationId, refreshKey);

  const handleRetry = () => {
    navigate("/dashboard/incidents/investigations/new");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !investigation) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">
                {error ?? "Investigation not found"}
              </p>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    status,
    description,
    diagnosis,
    durationMs,
    serviceName,
    environment,
    createdAt,
    evidence,
    correlation,
  } = investigation;

  const confidenceDisplay =
    diagnosis?.confidence !== undefined ? `${Math.round(diagnosis.confidence * 100)}%` : null;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {description}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              getInvestigationStatusStyle(status)
            )}
          >
            {getStatusIcon(status)}
            {titleCase(status)}
          </span>

          {confidenceDisplay && diagnosis && (
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
                getConfidenceStyle(diagnosis.confidence)
              )}
            >
              {confidenceDisplay} confidence
            </span>
          )}

          <div className="flex flex-wrap gap-2">
            {durationMs !== null && (
              <StatBadge label="Duration" value={formatDuration(durationMs)} />
            )}
            {serviceName && <StatBadge label="Service" value={serviceName} />}
            {environment && <StatBadge label="Environment" value={titleCase(environment)} />}
            <StatBadge label="Created" value={formatTimestamp(createdAt)} />
          </div>
        </div>
      </div>

      {/* Status-dependent content */}
      {isActiveInvestigation(status) && <ActiveStatusIndicator status={status} />}

      {status === "failed" && (
        <FailedStatusDisplay investigation={investigation} onRetry={handleRetry} />
      )}

      {status === "completed" && (
        <div className="space-y-6">
          {diagnosis && <DiagnosisSection diagnosis={diagnosis} />}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                <CardTitle>Evidence</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <InvestigationEvidence evidence={evidence} />
            </CardContent>
          </Card>

          {correlation?.timelineEvents && correlation.timelineEvents.length > 0 && (
            <TimelineSection events={correlation.timelineEvents} />
          )}

          {correlation && <CorrelationSection correlation={correlation} />}
        </div>
      )}
    </div>
  );
};
