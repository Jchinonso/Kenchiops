export interface NavLinkDropdown {
  readonly name: string;
  readonly dropdown: true;
  readonly items: ReadonlyArray<{ readonly name: string; readonly href: string }>;
}

export interface NavLinkSimple {
  readonly name: string;
  readonly href: string;
  readonly dropdown?: false;
}

export type NavLink = NavLinkDropdown | NavLinkSimple;
