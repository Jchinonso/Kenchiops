/**
 * WebhookActivity helpers — pure formatting utilities.
 */

export const formatDuration = (ms: number | null): string => {
  if (ms === null) {
    return "--";
  }
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};
