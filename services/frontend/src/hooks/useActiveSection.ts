/**
 * Tracks which section is currently visible in the viewport using IntersectionObserver.
 * Used by the Settings page sidebar navigation to highlight the active section.
 */

import { useState, useEffect } from "react";

export const useActiveSection = (sectionIds: readonly string[]): string => {
  const [active, setActive] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    const observers = sectionIds.flatMap((id) => {
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
  }, [sectionIds]);

  return active;
};
