/**
 * Pure formatting helpers for the metrics page.
 */

/** Format a seconds duration as a compact human string (e.g. "1m 30s", "2.5s"). */
export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) {
    return "—";
  }
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
};

/** Format a 0-1 ratio as a percentage string, or em-dash when null. */
export const formatPercent = (ratio: number | null): string =>
  ratio === null ? "—" : `${Math.round(ratio * 1000) / 10}%`;

/** Convert a nullable seconds value to minutes (0 when null), rounded to 2dp. */
export const secondsToMinutes = (seconds: number | null): number =>
  seconds === null ? 0 : Math.round((seconds / 60) * 100) / 100;

/** Format an integer count with locale grouping. */
export const formatCount = (value: number): string => value.toLocaleString();

/** Format estimated hours saved (e.g. "12.5h" or "—" when zero/none). */
export const formatHoursSaved = (hours: number): string =>
  hours <= 0 ? "—" : `${hours.toLocaleString()}h`;

/** Short date label (e.g. "Jun 23") from a YYYY-MM-DD string. */
export const formatTrendDate = (isoDate: string): string => {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthIndex = Number(parts[1]) - 1;
  const month = monthNames[monthIndex] ?? parts[1];
  return `${month} ${Number(parts[2])}`;
};
