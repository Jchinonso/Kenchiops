/**
 * SessionStorage key set during logout to prevent refreshUser from
 * re-authenticating on the next page load. Cleared on the first
 * refreshUser call after the flag is detected.
 */
export const LOGGED_OUT_KEY = "kenchi_logged_out";

/** Idle session timeout in milliseconds (30 minutes -- SOC 2 compliance). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Events that indicate user activity and reset the idle timer. */
export const ACTIVITY_EVENTS: readonly string[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
];
