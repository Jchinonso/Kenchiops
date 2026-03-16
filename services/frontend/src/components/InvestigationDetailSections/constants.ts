export const PRIORITY_STYLES: Readonly<Record<string, string>> = {
  immediate:
    "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  short_term:
    "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  long_term:
    "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800",
} as const;
