/**
 * Shared types for the PlanSelection module.
 */

import type { PlanDTO } from "@/hooks/useSubscription";

export interface PlanCardProps {
  readonly plan: PlanDTO;
  readonly isCurrent: boolean;
  readonly isChanging: boolean;
  readonly onSelect: (planId: string) => void;
}
