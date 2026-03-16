import type { SourceHealthInfo, HealthStatus } from "./types";
import { STALE_MS } from "./constants";

export const computeHealthStatus = (health: SourceHealthInfo | undefined): HealthStatus => {
  if (!health || !health.lastReceived) {
    return "no_events";
  }
  const ageMs = Date.now() - new Date(health.lastReceived).getTime();
  return ageMs <= STALE_MS ? "connected" : "stale";
};

export const healthDotColor = (status: HealthStatus): string =>
  status === "connected" ? "bg-green-500" : status === "stale" ? "bg-yellow-500" : "bg-zinc-400";

export const healthLabel = (status: HealthStatus): string =>
  status === "connected" ? "Connected" : status === "stale" ? "Stale" : "No events";

export const healthTextColor = (status: HealthStatus): string =>
  status === "connected"
    ? "text-green-600 dark:text-green-400"
    : status === "stale"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-zinc-500 dark:text-zinc-400";

export const formatRelativeTime = (isoString: string): string => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
