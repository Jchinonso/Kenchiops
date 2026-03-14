import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { PolicySection } from "./PolicySection";
import { TERMS_SECTIONS, CONTACT_EMAIL, LAST_UPDATED } from "./constants";

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
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-gray dark:prose-invert max-w-none space-y-6 text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
        {TERMS_SECTIONS.map((section) => (
          <PolicySection key={section.title} title={section.title} body={section.body} />
        ))}

        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            8. Contact
          </h2>
          <p>
            For questions about these Terms, contact us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              {CONTACT_EMAIL}
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
