import { Check } from "lucide-react";
import { Link } from "react-router-dom";

interface PricingTier {
  readonly name: string;
  readonly price: string;
  readonly period: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly cta: string;
  readonly ctaHref: string;
  readonly highlighted?: boolean;
}

const tiers: readonly PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For small teams getting started with CI/CD analysis.",
    features: [
      "Up to 3 repositories",
      "50 analyses per month",
      "GitHub integration",
      "PR comments",
      "Community support",
    ],
    cta: "Get Started Free",
    ctaHref: "/login",
  },
  {
    name: "Pro",
    price: "$49",
    period: "per month / 10 seats",
    description: "For growing teams that need unlimited analysis power.",
    features: [
      "Unlimited repositories",
      "Unlimited analyses",
      "GitHub + Slack integration",
      "Custom analysis rules",
      "Priority support",
      "Team analytics dashboard",
    ],
    cta: "Start 14-Day Trial",
    ctaHref: "/login",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For organizations with advanced security and compliance needs.",
    features: [
      "Everything in Pro",
      "SSO / SAML authentication",
      "SLA & uptime guarantee",
      "Dedicated support engineer",
      "Self-hosted deployment option",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    ctaHref: "mailto:sales@kenchi.dev?subject=Enterprise Pricing",
  },
];

const Pricing = () => (
  <section id="pricing" aria-label="Pricing" className="py-20 bg-gray-50 dark:bg-gray-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Simple, Transparent Pricing
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Start free, upgrade when you need more. No surprise bills, no hidden fees.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm transition-shadow hover:shadow-lg ${
              tier.highlighted
                ? "ring-2 ring-indigo-500 shadow-lg"
                : "border border-gray-200 dark:border-gray-700"
            }`}
          >
            {tier.highlighted && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
                  Most Popular
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                  {tier.price}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">/ {tier.period}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{tier.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>

            {tier.ctaHref.startsWith("mailto:") ? (
              <a
                href={tier.ctaHref}
                className={`block w-full text-center px-6 py-3 rounded-lg text-sm font-semibold transition-colors ${
                  tier.highlighted
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                    : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                }`}
              >
                {tier.cta}
              </a>
            ) : (
              <Link
                to={tier.ctaHref}
                className={`block w-full text-center px-6 py-3 rounded-lg text-sm font-semibold transition-colors ${
                  tier.highlighted
                    ? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                    : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                }`}
              >
                {tier.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Pricing;
