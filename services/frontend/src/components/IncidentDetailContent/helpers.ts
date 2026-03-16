import type { ConfidenceLevel } from "./types";

export const canAcknowledge = (status: string): boolean =>
  status === "received" || status === "triaged" || status === "escalated";

export const canResolve = (status: string): boolean =>
  status !== "resolved" && status !== "closed" && status !== "deduped";

export const getConfidenceLevel = (value: number): ConfidenceLevel => {
  const pct = Math.round(value * 100);
  if (pct >= 80) {
    return {
      label: "High",
      barColor: "bg-green-500",
      badgeClass: "bg-green-900/30 text-green-400 border-green-700",
    };
  }
  if (pct >= 50) {
    return {
      label: "Medium",
      barColor: "bg-amber-500",
      badgeClass: "bg-amber-900/30 text-amber-400 border-amber-700",
    };
  }
  return {
    label: "Low",
    barColor: "bg-red-500",
    badgeClass: "bg-red-900/30 text-red-400 border-red-700",
  };
};
