export const computePercent = (current: number, limit: number): number =>
  limit > 0 ? Math.min(Math.round((current / limit) * 100), 100) : 0;
