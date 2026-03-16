import type { UsageLimitDTO } from "@/hooks/useSubscription";
import type { ExceededLimit } from "./types";
import { LIMIT_LABELS } from "./constants";

export const extractExceededLimits = (
  usage:
    | {
        readonly repositories: UsageLimitDTO;
        readonly analysesThisMonth: UsageLimitDTO;
        readonly integrations: UsageLimitDTO;
        readonly teamMembers: UsageLimitDTO;
      }
    | undefined
): readonly ExceededLimit[] => {
  if (!usage) {
    return [];
  }
  return Object.entries(usage)
    .filter(
      ([, detail]) => detail.limited && detail.limit !== null && detail.current >= detail.limit
    )
    .map(([key, detail]) => ({
      label: LIMIT_LABELS[key] ?? key,
      current: detail.current,
      limit: detail.limit ?? 0,
    }));
};
