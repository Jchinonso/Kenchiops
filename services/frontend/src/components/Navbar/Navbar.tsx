import { useState, useEffect } from "react";
import { ChevronDown, Menu, X, Moon, Sun, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { microSpring } from "@/lib/animations";
import { THEME_CYCLE, navLinks } from "./constants";

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  const isDropdownOpen = (name: string): boolean =>
    name === "Product" ? productDropdownOpen : resourcesDropdownOpen;

  const handleDropdownEnter = (name: string) => {
    if (name === "Product") {
      setProductDropdownOpen(true);
    }
    if (name === "Resources") {
      setResourcesDropdownOpen(true);
    }
  };

  const handleDropdownLeave = (name: string) => {
    if (name === "Product") {
      setProductDropdownOpen(false);
    }
    if (name === "Resources") {
      setResourcesDropdownOpen(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowNavCTA(window.scrollY > 600);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navClasses = scrolled
    ? "sticky top-0 z-50 transition-all duration-300 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60"
    : "sticky top-0 z-50 transition-all duration-300 bg-transparent border-b border-transparent";

  return (
    <nav aria-label="Main navigation" className={navClasses}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center transition-shadow group-hover:shadow-glow-amber">
              <svg
                className="w-5 h-5 text-zinc-950"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <span className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Kenchi
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const expanded = link.dropdown ? isDropdownOpen(link.name) : false;
              return (
                <div
                  key={link.name}
                  className="relative"
                  onMouseEnter={link.dropdown ? () => handleDropdownEnter(link.name) : undefined}
                  onMouseLeave={link.dropdown ? () => handleDropdownLeave(link.name) : undefined}
                >
                  {link.dropdown ? (
                    <button
                      className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                      aria-haspopup="menu"
                      aria-expanded={expanded}
                      aria-controls={`dropdown-${link.name.toLowerCase()}`}
                    >
                      {link.name}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <a
                      href={link.href}
                      className="px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      {link.name}
                    </a>
                  )}

                  {/* Dropdown */}
                  {link.dropdown && (
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          id={`dropdown-${link.name.toLowerCase()}`}
                          role="menu"
                          className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 py-2 shadow-lg dark:shadow-2xl"
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.96 }}
                          transition={microSpring}
                        >
                          {link.items.map((item) => (
                            <a
                              key={item.name}
                              href={item.href}
                              role="menuitem"
                              className="block px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 hover:text-amber-400 transition-colors"
                            >
                              {item.name}
                            </a>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={cycleTheme}
              className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors"
              aria-label={`Theme: ${themeLabel}. Click to change.`}
              title={`Theme: ${themeLabel}`}
            >
              {themeIcon}
            </button>

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  DASHBOARD
                </Link>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center">
                    <span className="text-zinc-950 text-xs font-bold">
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
                    className="px-4 py-2 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-all hover:shadow-glow-amber"
                  >
                    START FREE TRIAL
                  </Link>
                ) : (
                  <a
                    href="/#cta"
                    className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    BOOK A DEMO
                  </a>
                )}
                {!isLoading && (
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-all hover:shadow-glow-amber"
                  >
                    LOGIN
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="lg:hidden bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <div key={link.name}>
                  {link.dropdown ? (
                    <>
                      <span className="block px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        {link.name}
                      </span>
                      {link.items.map((item) => (
                        <a
                          key={item.name}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="block px-3 py-2 pl-6 text-base font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg"
                        >
                          {item.name}
                        </a>
                      ))}
                    </>
                  ) : (
                    <a
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-2 text-base font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg"
                    >
                      {link.name}
                    </a>
                  )}
                </div>
              ))}
              <div className="pt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={cycleTheme}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg"
                >
                  {themeIcon}
                  <span>Theme: {themeLabel}</span>
                </button>

                {isAuthenticated ? (
                  <>
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-sm font-semibold text-zinc-950 bg-amber-500 rounded-lg text-center"
                    >
                      DASHBOARD
                    </Link>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center">
                        <span className="text-zinc-950 text-xs font-bold">
                          {user?.displayName?.charAt(0)?.toUpperCase() ?? "U"}
                        </span>
                      </div>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                        {user?.displayName ?? "User"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <a
                      href="/#cta"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 rounded-lg text-center"
                    >
                      BOOK A DEMO
                    </a>
                    {!isLoading && (
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block w-full px-4 py-2.5 text-sm font-semibold text-zinc-950 bg-amber-500 rounded-lg text-center"
                      >
                        LOGIN
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
