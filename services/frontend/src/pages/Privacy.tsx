import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Privacy = () => (
  <>
    <Navbar />
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 mb-10 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to home
      </Link>

      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Privacy Policy</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
        Last updated: February 17, 2026
      </p>

      <div className="prose prose-gray dark:prose-invert max-w-none space-y-6 text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            1. Information We Collect
          </h2>
          <p>
            When you use Kenchi, we collect information necessary to provide the Service, including
            your GitHub account information (name, email, avatar), repository metadata, and CI/CD
            build logs for analysis purposes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            2. How We Use Your Information
          </h2>
          <p>
            We use your information to provide and improve the Service, including analyzing CI/CD
            failure logs, generating root cause reports, and delivering notifications. We do not
            sell your data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            3. Data Security
          </h2>
          <p>
            We implement industry-standard security measures to protect your data. CI/CD logs are
            processed in memory and analysis results are stored encrypted at rest. We never store
            your source code — only CI build logs necessary for failure analysis.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            4. Data Retention
          </h2>
          <p>
            Analysis results are retained for the duration of your subscription. Raw CI logs are
            processed transiently and not stored permanently. You can request deletion of your data
            at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            5. Third-Party Services
          </h2>
          <p>
            Kenchi integrates with third-party services (GitHub, Slack, AI model providers) to
            provide its functionality. Each integration accesses only the minimum data required. AI
            model providers process log data for analysis but do not retain it beyond the request
            lifecycle.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            6. Your Rights
          </h2>
          <p>
            You have the right to access, correct, or delete your personal data. You may revoke
            Kenchi&apos;s access to your GitHub account at any time through your GitHub settings.
            Upon account deletion, all associated data will be permanently removed within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            7. Cookies
          </h2>
          <p>
            We use essential cookies for authentication and session management. We do not use
            tracking cookies or third-party advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            8. Contact
          </h2>
          <p>
            For privacy-related questions or data requests, contact us at{" "}
            <a
              href="mailto:privacy@kenchi.dev"
              className="text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              privacy@kenchi.dev
            </a>
            .
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default Privacy;
