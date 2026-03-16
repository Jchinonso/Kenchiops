export const priorityStyles: Readonly<Record<string, string>> = {
  critical: "text-red-600 dark:text-red-400",
  immediate: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-green-600 dark:text-green-400",
};

export const depChangeLabels: Readonly<Record<string, string>> = {
  added: "Added",
  removed: "Removed",
  updated: "Updated",
};

export const depChangeBadgeStyles: Readonly<Record<string, string>> = {
  added: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  removed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  updated: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};
