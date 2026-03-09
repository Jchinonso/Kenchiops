import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  sectionContainerVariants,
  itemVariants,
  scaleInVariants,
  microSpring,
} from "@/lib/animations";

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
      "Real-time analytics dashboard",
      "API access",
      "Priority support",
    ],
    cta: "Start 14-Day Trial",
    ctaHref: "/login",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$149",
    period: "per month / 25 seats",
    description: "For larger teams with advanced collaboration needs.",
    features: [
      "Everything in Pro",
      "Up to 50 team members",
      "Unlimited integrations",
      "Role-based access (4 roles)",
      "Data export (GDPR compliant)",
      "Audit log",
      "Advanced API (scopes & keys)",
    ],
    cta: "Start 14-Day Trial",
    ctaHref: "/login",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For organizations with advanced security and compliance needs.",
    features: [
      "Everything in Team",
      "Unlimited team members",
      "SSO / SAML authentication",
      "Custom model fine-tuning",
      "Multi-organization support",
      "GDPR data export",
      "SLA & uptime guarantee",
      "Dedicated support engineer",
    ],
    cta: "Contact Sales",
    ctaHref: "mailto:sales@kenchi.dev?subject=Enterprise Pricing",
  },
];

const PricingCTA = ({ tier }: { readonly tier: PricingTier }) => {
  const className = tier.highlighted
    ? "block w-full text-center px-6 py-3 rounded-xl text-sm font-bold transition-all bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20 hover:shadow-glow-amber"
    : "block w-full text-center px-6 py-3 rounded-xl text-sm font-semibold transition-all bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700";

  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={microSpring}>
      {tier.ctaHref.startsWith("mailto:") ? (
        <a href={tier.ctaHref} className={className}>
          {tier.cta}
        </a>
      ) : (
        <Link to={tier.ctaHref} className={className}>
          {tier.cta}
        </Link>
      )}
    </motion.div>
  );
};

const Pricing = () => (
  <section id="pricing" aria-label="Pricing" className="py-24 bg-white dark:bg-zinc-950">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        className="text-center mb-16"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={sectionContainerVariants}
      >
        <motion.span
          variants={itemVariants}
          className="text-amber-500 text-sm font-mono font-medium uppercase tracking-widest mb-4 block"
        >
          Pricing
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-900 dark:text-zinc-100 mb-5"
        >
          Simple, Transparent Pricing
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Start free, upgrade when you need more. No surprise bills, no hidden fees.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid lg:grid-cols-4 md:grid-cols-2 gap-6 max-w-6xl mx-auto"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        variants={sectionContainerVariants}
      >
        {tiers.map((tier) => (
          <motion.div
            key={tier.name}
            variants={itemVariants}
            whileHover={{ y: tier.highlighted ? -8 : -4, transition: microSpring }}
            className={`relative rounded-2xl p-8 transition-all duration-300 ${
              tier.highlighted
                ? "bg-zinc-100/80 dark:bg-zinc-900/80 border-2 border-amber-500/40 shadow-glow-amber"
                : "bg-zinc-100/50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            {tier.highlighted && (
              <motion.div
                variants={scaleInVariants}
                className="absolute -top-4 left-1/2 -translate-x-1/2"
              >
                <span className="bg-amber-500 text-zinc-950 text-xs font-bold px-4 py-1.5 rounded-full">
                  Most Popular
                </span>
              </motion.div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                {tier.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-display font-extrabold text-zinc-900 dark:text-zinc-100">
                  {tier.price}
                </span>
                <span className="text-sm text-zinc-400 dark:text-zinc-600">/ {tier.period}</span>
              </div>
              <p className="text-sm text-zinc-500 mt-3 leading-relaxed">{tier.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-amber-500" />
                  </div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{feature}</span>
                </li>
              ))}
            </ul>

            <PricingCTA tier={tier} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Pricing;
