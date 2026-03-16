/**
 * Tracks which section is currently visible in the viewport using IntersectionObserver.
 * Used by the Settings page sidebar navigation to highlight the active section.
 */

import { useState, useEffect, useMemo } from "react";

export const useActiveSection = (sectionIds: readonly string[]): string => {
  const [active, setActive] = useState(sectionIds[0] ?? "");

  // Stabilize the sectionIds reference so callers passing inline arrays
  // don't re-trigger IntersectionObserver creation every render.
  const serialized = JSON.stringify(sectionIds);
  const stableIds = useMemo(() => JSON.parse(serialized) as readonly string[], [serialized]);

  useEffect(() => {
    const observers = stableIds.flatMap((id) => {
      const element = document.getElementById(id);
      if (!element) {
        return [];
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setActive(id);
          }
        },
        { rootMargin: "-20% 0px -60% 0px" }
      );

      observer.observe(element);
      return [{ observer, element }];
    });

    return () => {
      observers.forEach(({ observer }) => observer.disconnect());
    };
  }, [stableIds]);

  return active;
};
