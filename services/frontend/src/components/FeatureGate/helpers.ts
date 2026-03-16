import type { PlanDTO } from "@/hooks/useSubscription";
import { FEATURE_LABELS } from "./constants";

export const getFeatureLabel = (feature: string): string =>
  FEATURE_LABELS[feature] ?? feature.replace(/([A-Z])/g, " $1").trim();

export const isFeatureEnabled = (plan: PlanDTO, feature: string): boolean => {
  const features = plan.features as unknown as Readonly<Record<string, unknown>>;
  return features[feature] === true;
};
