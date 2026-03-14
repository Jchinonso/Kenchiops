export const PLAN_FEATURES: Readonly<Record<string, readonly string[]>> = {
  free: [
    "Up to 3 repositories",
    "50 analyses per month",
    "1 integration",
    "GitHub PR comments",
    "Community support",
  ],
  pro: [
    "Everything in Free",
    "Unlimited repositories",
    "Unlimited analyses",
    "Up to 5 integrations",
    "Up to 10 team members",
    "Slack integration",
    "Custom analysis rules",
    "Priority support",
  ],
  team: [
    "Everything in Pro",
    "Up to 50 team members",
    "Unlimited integrations",
    "Audit log",
    "Advanced team analytics",
    "API access",
  ],
  enterprise: [
    "Everything in Team",
    "Unlimited team members",
    "SSO / SAML authentication",
    "Dedicated support engineer",
    "Self-hosted deployment option",
    "Custom integrations",
  ],
};

export const ENTERPRISE_MAILTO = "mailto:sales@kenchi.dev?subject=Enterprise%20Pricing";
