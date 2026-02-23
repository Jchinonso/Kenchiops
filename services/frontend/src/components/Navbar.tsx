import { useState, useEffect } from "react";
import { ChevronDown, Menu, X, Moon, Sun, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

const THEME_CYCLE = ["light", "dark", "system"] as const;

interface NavLinkDropdown {
  readonly name: string;
  readonly dropdown: true;
  readonly items: ReadonlyArray<{ readonly name: string; readonly href: string }>;
}

interface NavLinkSimple {
  readonly name: string;
  readonly href: string;
  readonly dropdown?: false;
}

type NavLink = NavLinkDropdown | NavLinkSimple;

const navLinks: readonly NavLink[] = [
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

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [showNavCTA, setShowNavCTA] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const { preference, setTheme } = useTheme();

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(preference);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setTheme(THEME_CYCLE[nextIndex]);
  };

  const themeIcon =
    preference === "dark" ? (
      <Moon className="w-4 h-4" />
    ) : preference === "light" ? (
      <Sun className="w-4 h-4" />
    ) : (
      <Monitor className="w-4 h-4" />
    );

  const themeLabel = preference === "dark" ? "Dark" : preference === "light" ? "Light" : "System";

  useEffect(() => {
    const handleScroll = () => {
      setShowNavCTA(window.scrollY > 600);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Kenchi</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.name} className="relative">
                {link.dropdown ? (
                  <button
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    aria-haspopup="true"
                    aria-expanded={
                      link.name === "Product" ? productDropdownOpen : resourcesDropdownOpen
                    }
                    aria-controls={`dropdown-${link.name.toLowerCase()}`}
                    onMouseEnter={() => {
                      if (link.name === "Product") {
                        setProductDropdownOpen(true);
                      }
                      if (link.name === "Resources") {
                        setResourcesDropdownOpen(true);
                      }
                    }}
                    onMouseLeave={() => {
                      if (link.name === "Product") {
                        setProductDropdownOpen(false);
                      }
                      if (link.name === "Resources") {
                        setResourcesDropdownOpen(false);
                      }
                    }}
                  >
                    {link.name}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                ) : (
                  <a
                    href={link.href}
                    className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {link.name}
                  </a>
                )}

                {/* Dropdown */}
                {link.dropdown && (
                  <div
                    id={`dropdown-${link.name.toLowerCase()}`}
                    role="menu"
                    className={`absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-lg dark:shadow-gray-950/50 border border-gray-100 dark:border-gray-800 py-2 transition-all duration-200 ${
                      (link.name === "Product" && productDropdownOpen) ||
                      (link.name === "Resources" && resourcesDropdownOpen)
                        ? "opacity-100 visible translate-y-0"
                        : "opacity-0 invisible -translate-y-2"
                    }`}
                    onMouseEnter={() => {
                      if (link.name === "Product") {
                        setProductDropdownOpen(true);
                      }
                      if (link.name === "Resources") {
                        setResourcesDropdownOpen(true);
                      }
                    }}
                    onMouseLeave={() => {
                      if (link.name === "Product") {
                        setProductDropdownOpen(false);
                      }
                      if (link.name === "Resources") {
                        setResourcesDropdownOpen(false);
                      }
                    }}
                  >
                    {link.items?.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        role="menuitem"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        {item.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={cycleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              aria-label={`Theme: ${themeLabel}. Click to change.`}
              title={`Theme: ${themeLabel}`}
            >
              {themeIcon}
            </button>

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  DASHBOARD
                </Link>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">
                      {user?.displayName?.charAt(0)?.toUpperCase() ?? "U"}
                    </span>
                  </div>
                  <span className="max-w-[120px] truncate">{user?.displayName ?? "User"}</span>
                </Link>
              </>
            ) : (
              <>
                {showNavCTA ? (
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
                  >
                    START FREE TRIAL
                  </Link>
                ) : (
                  <a
                    href="/#cta"
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    BOOK A DEMO
                  </a>
                )}
                {!isLoading && (
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
                  >
                    LOGIN
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <div key={link.name}>
                {link.dropdown ? (
                  <>
                    <span className="block px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {link.name}
                    </span>
                    {link.items?.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-3 py-2 pl-6 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
                      >
                        {item.name}
                      </a>
                    ))}
                  </>
                ) : (
                  <a
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 text-base font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
                  >
                    {link.name}
                  </a>
                )}
              </div>
            ))}
            <div className="pt-4 space-y-2">
              {/* Mobile Theme Toggle */}
              <button
                onClick={cycleTheme}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
              >
                {themeIcon}
                <span>Theme: {themeLabel}</span>
              </button>

              {isAuthenticated ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg text-center"
                  >
                    DASHBOARD
                  </Link>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {user?.displayName?.charAt(0)?.toUpperCase() ?? "U"}
                      </span>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {user?.displayName ?? "User"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <a
                    href="/#cta"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-center"
                  >
                    BOOK A DEMO
                  </a>
                  {!isLoading && (
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg text-center"
                    >
                      LOGIN
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
