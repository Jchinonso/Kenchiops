import type { BuildAnalysesUrlOptions, BuildFailuresUrlOptions } from "./types";

export const buildAnalysesUrl = (options: BuildAnalysesUrlOptions): string => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  params.set("offset", String(options.offset));
  if (options.repository) {
    params.set("repository", options.repository);
  }
  if (options.minConfidence) {
    params.set("minConfidence", options.minConfidence);
  }
  if (options.maxConfidence) {
    params.set("maxConfidence", options.maxConfidence);
  }
  if (options.since) {
    params.set("since", options.since);
  }
  if (options.source) {
    params.set("source", options.source);
  }
  return `/api/v1/dashboard/analyses?${params.toString()}`;
};

export const buildFailuresUrl = (options: BuildFailuresUrlOptions): string => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  params.set("offset", String(options.offset));
  if (options.repository) {
    params.set("repository", options.repository);
  }
  if (options.severity) {
    params.set("severity", options.severity);
  }
  if (options.since) {
    params.set("since", options.since);
  }
  if (options.source) {
    params.set("source", options.source);
  }
  return `/api/v1/dashboard/failures?${params.toString()}`;
};

export const buildConfidenceTrendUrl = (bucket: "day" | "week", since?: string): string => {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  if (since) {
    params.set("since", since);
  }
  return `/api/v1/dashboard/stats/confidence-trend?${params.toString()}`;
};

export const buildWebhookActivityUrl = (
  limit: number,
  offset: number,
  source?: string,
  status?: string
): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (source) {
    params.set("source", source);
  }
  if (status) {
    params.set("status", status);
  }
  return `/api/v1/dashboard/webhook-activity?${params.toString()}`;
};
