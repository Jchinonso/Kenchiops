import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const Terms = () => (
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

      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Terms of Service</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">
        Last updated: February 17, 2026
      </p>

      <div className="prose prose-gray dark:prose-invert max-w-none space-y-6 text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using Kenchi ("the Service"), you agree to be bound by these Terms of
            Service. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            2. Description of Service
          </h2>
          <p>
            Kenchi provides AI-powered root cause analysis for CI/CD pipeline failures. The Service
            analyzes CI logs, identifies failure patterns, and delivers actionable diagnostics
            through integrations with GitHub, Slack, and other developer tools.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            3. User Accounts
          </h2>
          <p>
            You are responsible for maintaining the security of your account credentials and for all
            activities that occur under your account. You must notify us immediately of any
            unauthorized use of your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            4. Acceptable Use
          </h2>
          <p>
            You agree not to misuse the Service. This includes attempting to gain unauthorized
            access to systems, interfering with other users&apos; access, or using the Service for
            any unlawful purpose.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            5. Intellectual Property
          </h2>
          <p>
            All content, features, and functionality of the Service are owned by Kenchi and are
            protected by copyright, trademark, and other intellectual property laws. Your CI/CD logs
            and analysis results remain your property.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            6. Limitation of Liability
          </h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind. Kenchi shall
            not be liable for any indirect, incidental, or consequential damages arising from your
            use of the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            7. Changes to Terms
          </h2>
          <p>
            We reserve the right to modify these terms at any time. We will notify users of
            significant changes via email or through the Service. Continued use after changes
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            8. Contact
          </h2>
          <p>
            For questions about these Terms, contact us at{" "}
            <a
              href="mailto:legal@kenchi.dev"
              className="text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              legal@kenchi.dev
            </a>
            .
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default Terms;
