import { LIMIT_LABELS } from "./constants";

export const getLimitLabel = (limitKey: string): string =>
  LIMIT_LABELS[limitKey] ?? limitKey.replace(/_/g, " ");
