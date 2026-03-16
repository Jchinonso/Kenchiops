/** Statuses that allow acknowledging */
export const canAcknowledge = (status: string): boolean =>
  status === "received" || status === "triaged" || status === "escalated";

/** Statuses that allow resolving */
export const canResolve = (status: string): boolean =>
  status !== "resolved" && status !== "closed" && status !== "deduped";
