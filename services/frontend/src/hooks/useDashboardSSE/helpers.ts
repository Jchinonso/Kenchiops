/** Parse SSE MessageEvent data into a typed payload, returning null on failure. */
export const parseEventData = <T>(event: MessageEvent): T | null => {
  try {
    return JSON.parse(event.data as string) as T;
  } catch {
    return null;
  }
};

export const formatConfidence = (confidence: number): string => `${Math.round(confidence * 100)}%`;

/** Truncate SSE-sourced strings to prevent UI overflow from unexpectedly large payloads. */
export const truncateSSE = (value: string, maxLength = 200): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

/** Show a browser notification if the Notification API is available and permission is granted */
export const showBrowserNotification = (title: string, body: string): void => {
  if (typeof Notification === "undefined") {
    return;
  }
  if (Notification.permission !== "granted") {
    return;
  }
  // eslint-disable-next-line no-new -- Notification constructor fires side effect by design
  new Notification(title, { body });
};
