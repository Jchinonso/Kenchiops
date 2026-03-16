import type { NavEntry, NavGroup, NavLeafItem } from "./types";

export const isNavGroup = (entry: NavEntry): entry is NavGroup => "children" in entry;

export const isLeafActive = ({ href }: NavLeafItem, pathname: string): boolean =>
  href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
