import type { PlanDTO } from "@/hooks/useSubscription";

export const formatPrice = (priceCents: number | null): string => {
  if (priceCents === null) {
    return "Custom";
  }
  if (priceCents === 0) {
    return "$0";
  }
  return `$${Math.floor(priceCents / 100)}`;
};

export const formatPeriod = (plan: PlanDTO): string => {
  if (plan.priceMonthlyCents === null) {
    return "contact us";
  }
  if (plan.priceMonthlyCents === 0) {
    return "forever";
  }
  const seats = plan.limits.maxTeamMembers;
  return seats !== null ? `per month / ${seats} seats` : "per month";
};
