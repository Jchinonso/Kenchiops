/**
 * Keyboard shortcuts hook for the Dashboard shell.
 *
 * Handles global keyboard shortcuts (Cmd+K, Escape, ?, /, t, g→*)
 * and click-outside-to-close for the notifications dropdown.
 */

import { useEffect, useRef } from "react";

/** Helper to set a React ref value without triggering the object-mutation lint rule. */
const setRef = <T>(ref: React.MutableRefObject<T>, value: T): void => {
  Object.assign(ref, { current: value });
};

const GOTO_ROUTES: Readonly<Record<string, string>> = {
  o: "/dashboard",
  f: "/dashboard/cicd/analyses",
  a: "/dashboard/cicd/analyses",
  s: "/dashboard/settings",
  p: "/dashboard/cicd/pipelines",
  i: "/dashboard/incidents/active",
  v: "/dashboard/incidents/investigations",
};

interface UseDashboardKeyboardShortcutsParams {
  readonly toggleTheme: () => void;
  readonly navigate: (path: string) => void;
  readonly notificationsRef: React.RefObject<HTMLDivElement | null>;
  readonly onCloseNotifications: () => void;
  readonly onOpenShortcuts: () => void;
  readonly onToggleCommand: () => void;
}

export const useDashboardKeyboardShortcuts = ({
  toggleTheme,
  navigate,
  notificationsRef,
  onCloseNotifications,
  onOpenShortcuts,
  onToggleCommand,
}: UseDashboardKeyboardShortcutsParams): void => {
  const pendingGotoRef = useRef(false);
  const gotoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        onCloseNotifications();
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const { key } = event;

      // Global shortcuts (work even in text inputs)
      if (key === "Escape") {
        onCloseNotifications();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        onToggleCommand();
        return;
      }

      // Remaining shortcuts disabled in text inputs
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (isInput) {
        return;
      }

      // Two-key "goto" navigation: g → second key
      if (pendingGotoRef.current) {
        setRef(pendingGotoRef, false);
        clearTimeout(gotoTimerRef.current);
        const route = GOTO_ROUTES[key];
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case "?":
          event.preventDefault();
          onOpenShortcuts();
          break;
        case "/": {
          const filterInput = document.querySelector<HTMLInputElement>(
            'input[id="filter-repository"]'
          );
          if (filterInput) {
            event.preventDefault();
            filterInput.focus();
          }
          break;
        }
        case "t":
          event.preventDefault();
          toggleTheme();
          break;
        case "g":
          setRef(pendingGotoRef, true);
          setRef(
            gotoTimerRef,
            setTimeout(() => setRef(pendingGotoRef, false), 1000)
          );
          break;
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [
    toggleTheme,
    navigate,
    notificationsRef,
    onCloseNotifications,
    onOpenShortcuts,
    onToggleCommand,
  ]);
};
