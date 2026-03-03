/**
 * WebhookActivity constants — page size, status badge styles, and style lookup.
 */

export const PAGE_SIZE = 20;

const STATUS_STYLES: Readonly<Record<string, string>> = {
  processed:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  skipped:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  ignored:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  failed:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

export const getStatusStyle = (status: string): string =>
  STATUS_STYLES[status] ?? STATUS_STYLES.skipped;
