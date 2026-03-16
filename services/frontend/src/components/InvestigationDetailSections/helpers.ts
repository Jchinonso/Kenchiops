import { PRIORITY_STYLES } from "./constants";

export const getPriorityStyle = (priority: string): string =>
  PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.long_term;

export const getPriorityLabel = (priority: string): string =>
  priority.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
