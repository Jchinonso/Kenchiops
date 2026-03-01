/**
 * Dashboard Footer
 *
 * Minimal footer for the dashboard shell with documentation,
 * support links, and version information.
 */

import { ExternalLink } from "lucide-react";

const FOOTER_LINKS = [
  { label: "Documentation", href: "https://docs.kenchi.dev", external: true },
  { label: "Support", href: "https://github.com/kenchiops/kenchi/issues", external: true },
  { label: "API Status", href: "https://status.kenchi.dev", external: true },
] as const;

export const DashboardFooter = () => (
  <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-8 px-4 sm:px-6 lg:px-8 py-4">
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-400 dark:text-zinc-500">
      <div className="flex items-center gap-4">
        {FOOTER_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            {link.label}
            <ExternalLink className="w-3 h-3" />
          </a>
        ))}
      </div>
      <span>&copy; {new Date().getFullYear()} Kenchi</span>
    </div>
  </footer>
);
