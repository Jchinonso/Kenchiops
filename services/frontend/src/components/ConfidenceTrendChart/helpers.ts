export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;
