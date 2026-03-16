/**
 * Back to Top Button
 *
 * Floating button that appears after scrolling past 600px.
 * Smooth-scrolls to top on click. Respects prefers-reduced-motion.
 */

import { useState, useEffect, useCallback } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCROLL_THRESHOLD, REDUCED_MOTION_QUERY } from "./constants";

export const BackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > SCROLL_THRESHOLD);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = useCallback(() => {
    const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }, []);

  return (
    <button
      onClick={handleClick}
      aria-label="Back to top"
      className={cn(
        "fixed bottom-6 right-6 z-40 p-3 rounded-full",
        "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg",
        "transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-amber-500/40 hover:shadow-xl",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
    >
      <ChevronUp className="w-5 h-5" aria-hidden="true" />
    </button>
  );
};
