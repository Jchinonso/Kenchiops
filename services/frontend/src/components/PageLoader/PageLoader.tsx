/**
 * Page Loader
 *
 * Branded full-content-area loader with the Kenchi logo inside a spinning
 * ring. Used as a placeholder while subscription usage data loads to
 * prevent page content from flashing before FeatureLocked renders.
 */

import { cn } from "@/lib/utils";
import type { PageLoaderProps } from "./types";

export const PageLoader = ({ className }: PageLoaderProps) => (
  <div className={cn("flex items-center justify-center py-32", className)}>
    <div className="relative w-16 h-16">
      {/* Spinning ring */}
      <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      {/* Logo center */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      </div>
    </div>
  </div>
);
