/**
 * TimeDisplay
 *
 * Renders a semantic <time> element with relative text and absolute tooltip.
 * Uses the shared formatters for consistency.
 */

import { formatTimestamp, formatRelativeTime } from "@/lib/formatters";
import type { TimeDisplayProps } from "./types";

export const TimeDisplay = ({ dateTime, className }: TimeDisplayProps) => (
  <time dateTime={dateTime} className={className} title={formatTimestamp(dateTime)}>
    {formatRelativeTime(dateTime)}
  </time>
);
