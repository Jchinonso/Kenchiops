/**
 * Investigation Detail Sub-components
 *
 * Reusable sections for the Investigation Detail page:
 * DiagnosisSection, TimelineSection, CorrelationSection,
 * ActiveStatusIndicator, FailedStatusDisplay, and StatBadge.
 */

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, XCircle, Clock, Sparkles, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getConfidenceStyle,
  getConfidenceLabel,
  formatTimestamp,
  titleCase,
} from "@/lib/formatters";
import { getPriorityStyle, getPriorityLabel } from "./helpers";
import type {
  StatBadgeProps,
  SuggestedActionsSectionProps,
  DiagnosisSectionProps,
  TimelineSectionProps,
  CorrelationSectionProps,
  ActiveStatusProps,
  FailedStatusProps,
} from "./types";

// ==================== StatBadge ====================

export const StatBadge = ({ label, value, className }: StatBadgeProps) => (
  <div className="flex flex-col items-center gap-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
    <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    <span className={cn("text-sm font-medium text-zinc-900 dark:text-zinc-100", className)}>
      {value}
    </span>
  </div>
);

// ==================== SuggestedActions ====================

const SuggestedActionsSection = ({ actions }: SuggestedActionsSectionProps) => (
  <div>
    <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Suggested Actions</h4>
    <div className="space-y-2">
      {actions.map((action) => (
        <div
          key={`${action.priority}-${action.action}`}
          className="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg"
        >
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0 mt-0.5",
              getPriorityStyle(action.priority)
            )}
          >
            {getPriorityLabel(action.priority)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{action.action}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{action.reasoning}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ==================== DiagnosisSection ====================

export const DiagnosisSection = ({ diagnosis }: DiagnosisSectionProps) => {
  const { confidence, summary, rootCauseHypothesis, suggestedActions, diagnosisSource } = diagnosis;
  const confidencePercent = Math.round(confidence * 100);
  const { length: actionCount } = suggestedActions;
  const isFallback = diagnosisSource === "fallback";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <CardTitle>Diagnosis</CardTitle>
          {isFallback && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
              Fallback
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Summary</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{summary}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Root Cause Hypothesis
          </h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {rootCauseHypothesis}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Confidence</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  confidencePercent >= 80
                    ? "bg-green-500"
                    : confidencePercent >= 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                )}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                getConfidenceStyle(confidence)
              )}
            >
              {confidencePercent}% ({getConfidenceLabel(confidence)})
            </span>
          </div>
        </div>

        {actionCount > 0 && <SuggestedActionsSection actions={suggestedActions} />}
      </CardContent>
    </Card>
  );
};

// ==================== TimelineSection ====================

export const TimelineSection = ({ events }: TimelineSectionProps) => {
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
      ),
    [events]
  );

  const { length: eventCount } = sortedEvents;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-500" />
          <CardTitle>Timeline</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {eventCount < 1 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
            No timeline events available.
          </p>
        ) : (
          <div className="space-y-0">
            {sortedEvents.map((event, index) => (
              <div key={`${event.timestamp}-${event.type}`} className="flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2" />
                  {index < eventCount - 1 && (
                    <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 mt-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {titleCase(event.type)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5">
                    {event.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ==================== CorrelationSection ====================

export const CorrelationSection = ({ correlation }: CorrelationSectionProps) => {
  const { patterns, relatedServices, commonFactors } = correlation;
  const { length: patternCount } = patterns;
  const { length: serviceCount } = relatedServices;
  const { length: factorCount } = commonFactors;

  if (patternCount < 1 && serviceCount < 1 && factorCount < 1) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-indigo-500" />
          <CardTitle>Correlations</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {serviceCount > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Related Services
            </h4>
            <div className="flex flex-wrap gap-2">
              {relatedServices.map((service) => (
                <span
                  key={service}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                >
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}

        {patternCount > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Patterns</h4>
            <ul className="space-y-1.5">
              {patterns.map((pattern) => (
                <li
                  key={pattern}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                >
                  <span className="text-indigo-400 mt-1 flex-shrink-0">&#8226;</span>
                  {pattern}
                </li>
              ))}
            </ul>
          </div>
        )}

        {factorCount > 0 && (
          <div>
            <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Common Factors
            </h4>
            <ul className="space-y-1.5">
              {commonFactors.map((factor) => (
                <li
                  key={factor}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                >
                  <span className="text-indigo-400 mt-1 flex-shrink-0">&#8226;</span>
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ==================== Status Indicators ====================

export const ActiveStatusIndicator = ({ status }: ActiveStatusProps) => (
  <div className="flex flex-col items-center justify-center py-12 space-y-4">
    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    <div className="text-center">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {status === "queued"
          ? "Investigation queued"
          : status === "gathering"
            ? "Gathering evidence..."
            : "Analyzing findings..."}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
        This page will update automatically.
      </p>
    </div>
  </div>
);

export const FailedStatusDisplay = ({ investigation, onRetry }: FailedStatusProps) => {
  const { errorMessage } = investigation;

  return (
    <Card>
      <CardContent className="py-8">
        <div className="flex flex-col items-center text-center space-y-3">
          <XCircle className="w-8 h-8 text-red-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Investigation Failed
            </p>
            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errorMessage}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Re-investigate
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
