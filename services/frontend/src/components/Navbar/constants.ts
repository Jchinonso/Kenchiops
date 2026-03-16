import type { NavLink } from "./types";

export const THEME_CYCLE = ["light", "dark", "system"] as const;

export const navLinks: readonly NavLink[] = [
  {
    name: "Product",
    dropdown: true,
    items: [
      { name: "CI/CD Analysis", href: "/#features" },
      { name: "Root Cause Detection", href: "/#features" },
      { name: "Risk Assessment", href: "/#features" },
      { name: "How It Works", href: "/#how-it-works" },
    ],
  },
  {
    name: "Resources",
    dropdown: true,
    items: [
      { name: "Case Studies", href: "/#case-studies" },
      { name: "Integrations", href: "/#integrations" },
    ],
  },
  { name: "Customers", href: "/#case-studies" },
  { name: "Pricing", href: "/#pricing" },
];
