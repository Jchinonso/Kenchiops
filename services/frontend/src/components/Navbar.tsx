import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);

  const navLinks = [
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
    { name: "Pricing", href: "/#cta" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
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
            <span className="text-xl font-bold text-gray-900">Kenchi</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.name} className="relative">
                {link.dropdown ? (
                  <button
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
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
                    className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {link.name}
                  </a>
                )}

                {/* Dropdown */}
                {link.dropdown && (
                  <div
                    className={`absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 transition-all duration-200 ${
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
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
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
            <a
              href="/#cta"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              BOOK A DEMO
            </a>
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
            >
              LOGIN
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-700 hover:text-gray-900"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <div key={link.name}>
                {link.dropdown ? (
                  <>
                    <span className="block px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {link.name}
                    </span>
                    {link.items?.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-3 py-2 pl-6 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                      >
                        {item.name}
                      </a>
                    ))}
                  </>
                ) : (
                  <a
                    href={link.href ?? "#"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                  >
                    {link.name}
                  </a>
                )}
              </div>
            ))}
            <div className="pt-4 space-y-2">
              <a
                href="/#cta"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg text-center"
              >
                BOOK A DEMO
              </a>
              <Link
                to="/login"
                className="block w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg text-center"
              >
                LOGIN
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
