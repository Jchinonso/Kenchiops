/**
 * Sticky CTA Bar
 *
 * Gradient banner that appears below the navbar when the Hero section
 * scrolls out of view. Keeps conversion opportunity visible throughout
 * the page. Auto-hides when Hero returns to viewport.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export const StickyCTA = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const heroElement = document.getElementById("hero");
    if (!heroElement) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px -64px 0px" }
    );

    observer.observe(heroElement);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!isVisible}
      className={cn(
        "fixed top-16 left-0 right-0 z-30",
        "bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600",
        "py-2.5 px-4 text-center text-sm text-zinc-950 font-medium",
        "transition-all duration-300",
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
      )}
    >
      <span className="mr-3">Start analyzing CI failures in minutes</span>
      <Link
        to="/login"
        className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:no-underline"
        tabIndex={isVisible ? 0 : -1}
      >
        Start free trial
      </Link>
    </div>
  );
};
