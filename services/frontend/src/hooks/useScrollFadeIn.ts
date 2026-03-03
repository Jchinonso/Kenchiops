/**
 * Scroll-triggered fade-in animation hook.
 *
 * Uses IntersectionObserver to detect when an element enters the viewport,
 * then applies a fade-in + translate-up transition. Fires once per element.
 * Respects prefers-reduced-motion by showing elements immediately.
 */

import { useEffect, useRef, useState } from "react";

interface ScrollFadeInResult {
  readonly ref: React.RefObject<HTMLElement | null>;
  readonly isVisible: boolean;
  readonly fadeClass: string;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const useScrollFadeIn = (threshold = 0.15): ScrollFadeInResult => {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);

  useEffect(() => {
    // Already visible (prefers-reduced-motion or previously triggered)
    if (isVisible) {
      return;
    }

    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, isVisible]);

  const fadeClass = isVisible
    ? "opacity-100 translate-y-0 transition-all duration-700 ease-out"
    : "opacity-0 translate-y-3";

  return { ref, isVisible, fadeClass };
};
