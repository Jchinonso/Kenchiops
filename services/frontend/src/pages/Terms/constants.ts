/**
 * Terms of service section content.
 * Each entry maps to a numbered section rendered on the page.
 */

interface TermsSectionData {
  readonly title: string;
  readonly body: string;
}

export const TERMS_SECTIONS: readonly TermsSectionData[] = [
  {
    title: "1. Acceptance of Terms",
    body: 'By accessing or using Kenchi ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.',
  },
  {
    title: "2. Description of Service",
    body: "Kenchi provides AI-powered root cause analysis for CI/CD pipeline failures. The Service analyzes CI logs, identifies failure patterns, and delivers actionable diagnostics through integrations with GitHub, Slack, and other developer tools.",
  },
  {
    title: "3. User Accounts",
    body: "You are responsible for maintaining the security of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.",
  },
  {
    title: "4. Acceptable Use",
    body: "You agree not to misuse the Service. This includes attempting to gain unauthorized access to systems, interfering with other users' access, or using the Service for any unlawful purpose.",
  },
  {
    title: "5. Intellectual Property",
    body: "All content, features, and functionality of the Service are owned by Kenchi and are protected by copyright, trademark, and other intellectual property laws. Your CI/CD logs and analysis results remain your property.",
  },
  {
    title: "6. Limitation of Liability",
    body: "The Service is provided \u201cas is\u201d without warranties of any kind. Kenchi shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.",
  },
  {
    title: "7. Changes to Terms",
    body: "We reserve the right to modify these terms at any time. We will notify users of significant changes via email or through the Service. Continued use after changes constitutes acceptance.",
  },
] as const;

export const CONTACT_EMAIL = "legal@kenchi.dev" as const;

export const LAST_UPDATED = "February 17, 2026" as const;
