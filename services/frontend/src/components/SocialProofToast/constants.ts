import type { ToastMessage } from "./types";

export const TOAST_MESSAGES: readonly ToastMessage[] = [
  { company: "FastShip", action: "resolved a CI failure in", time: "23s" },
  { company: "Acme Corp", action: "fixed a test suite timeout in", time: "47s" },
  { company: "ScaleOps", action: "started a 14-day trial", time: "" },
  { company: "BuildFast", action: "diagnosed a Docker build issue in", time: "38s" },
  { company: "DeployHQ", action: "identified a dependency conflict in", time: "1m 12s" },
] as const;

export const SHOW_DURATION_MS = 4000;
export const HIDE_DURATION_MS = 8000;
export const INITIAL_DELAY_MS = 5000;
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
