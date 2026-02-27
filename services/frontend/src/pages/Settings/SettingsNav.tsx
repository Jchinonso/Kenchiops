/**
 * Settings navigation — sticky sidebar on desktop, horizontal scroll tabs on mobile.
 * Active section tracked via IntersectionObserver in the parent.
 */

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./constants";
import { microSpring } from "@/lib/animations";

interface SettingsNavProps {
  readonly activeSection: string;
}

export const SettingsNav = ({ activeSection }: SettingsNavProps) => (
  <>
    {/* Desktop: sticky sidebar */}
    <nav className="hidden lg:block sticky top-24 self-start" aria-label="Settings navigation">
      <div className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {isActive && (
                <motion.div
                  layoutId="settings-nav-active"
                  className="absolute inset-0 bg-gray-100 dark:bg-gray-800/80 rounded-lg -z-10"
                  transition={microSpring}
                />
              )}
            </a>
          );
        })}
      </div>
    </nav>

    {/* Mobile: horizontal scroll tabs */}
    <nav
      aria-label="Settings navigation"
      className="lg:hidden -mx-4 sm:-mx-6 px-4 sm:px-6 mb-6 overflow-x-auto scrollbar-none"
    >
      <div className="flex gap-1 min-w-max pb-2">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  </>
);
