import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs));

/** Build URLSearchParams from a record, omitting falsy values. */
export const buildSearchParams = (
  entries: Readonly<Record<string, string | undefined | null>>
): URLSearchParams =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(entries).filter((entry): entry is [string, string] => Boolean(entry[1]))
    )
  );
