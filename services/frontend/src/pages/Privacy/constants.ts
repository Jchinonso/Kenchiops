/**
 * Privacy policy section content.
 * Each entry maps to a numbered section rendered on the page.
 */

interface PolicySectionData {
  readonly title: string;
  readonly body: string;
}

export const PRIVACY_SECTIONS: readonly PolicySectionData[] = [
  {
    title: "1. Information We Collect",
    body: "When you use Kenchi, we collect information necessary to provide the Service, including your GitHub account information (name, email, avatar), repository metadata, and CI/CD build logs for analysis purposes.",
  },
  {
    title: "2. How We Use Your Information",
    body: "We use your information to provide and improve the Service, including analyzing CI/CD failure logs, generating root cause reports, and delivering notifications. We do not sell your data to third parties.",
  },
  {
    title: "3. Data Security",
    body: "We implement industry-standard security measures to protect your data. CI/CD logs are processed in memory and analysis results are stored encrypted at rest. We never store your source code \u2014 only CI build logs necessary for failure analysis.",
  },
  {
    title: "4. Data Retention",
    body: "Analysis results are retained for the duration of your subscription. Raw CI logs are processed transiently and not stored permanently. You can request deletion of your data at any time by contacting us.",
  },
  {
    title: "5. Third-Party Services",
    body: "Kenchi integrates with third-party services (GitHub, Slack, AI model providers) to provide its functionality. Each integration accesses only the minimum data required. AI model providers process log data for analysis but do not retain it beyond the request lifecycle.",
  },
  {
    title: "6. Your Rights",
    body: "You have the right to access, correct, or delete your personal data. You may revoke Kenchi\u0027s access to your GitHub account at any time through your GitHub settings. Upon account deletion, all associated data will be permanently removed within 30 days.",
  },
  {
    title: "7. Cookies",
    body: "We use essential cookies for authentication and session management. We do not use tracking cookies or third-party advertising cookies.",
  },
] as const;

export const CONTACT_EMAIL = "privacy@kenchi.dev" as const;

export const LAST_UPDATED = "February 17, 2026" as const;
