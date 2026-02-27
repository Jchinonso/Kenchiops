import { Link } from "react-router-dom";
import { Github, Twitter, Linkedin } from "lucide-react";

const footerLinks = {
  Product: [
    { name: "CI/CD Analysis", href: "/#features" },
    { name: "Root Cause Detection", href: "/#features" },
    { name: "Risk Assessment", href: "/#features" },
    { name: "How It Works", href: "/#how-it-works" },
    { name: "Integrations", href: "/#integrations" },
  ],
  "Get Started": [
    { name: "Start Free Trial", href: "/login", internal: true },
    { name: "Customer Stories", href: "/#case-studies" },
  ],
  Legal: [
    { name: "Terms and Conditions", href: "/terms", internal: true },
    { name: "Privacy Policy", href: "/privacy", internal: true },
  ],
} as const;

const Footer = () => (
  <footer
    role="contentinfo"
    aria-label="Site footer"
    className="bg-zinc-950 text-zinc-400 border-t border-zinc-800/40"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {/* Brand Column */}
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
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
            <span className="text-xl font-display font-bold text-zinc-100">Kenchi</span>
          </div>
          <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
            AI-powered CI/CD failure analysis for engineering teams.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/kenchi-dev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kenchi on GitHub"
              className="text-zinc-600 hover:text-amber-500 transition-colors"
            >
              <Github className="w-5 h-5" aria-hidden="true" />
            </a>
            <a
              href="https://x.com/kenchi_dev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kenchi on X (Twitter)"
              className="text-zinc-600 hover:text-amber-500 transition-colors"
            >
              <Twitter className="w-5 h-5" aria-hidden="true" />
            </a>
            <a
              href="https://linkedin.com/company/kenchi-dev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kenchi on LinkedIn"
              className="text-zinc-600 hover:text-amber-500 transition-colors"
            >
              <Linkedin className="w-5 h-5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Link Columns */}
        <nav
          aria-label="Footer navigation"
          className="col-span-2 md:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-8"
        >
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest mb-4 font-display">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    {"internal" in link && link.internal ? (
                      <Link
                        to={link.href}
                        className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
                      >
                        {link.name}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
                      >
                        {link.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Bar */}
      <div className="mt-16 pt-8 border-t border-zinc-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-zinc-600">Copyright &copy; 2026 Kenchi. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <Link
            to="/privacy"
            className="text-sm text-zinc-600 hover:text-amber-400 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="text-sm text-zinc-600 hover:text-amber-400 transition-colors"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
