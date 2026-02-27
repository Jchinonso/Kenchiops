import { motion } from "motion/react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { sectionContainerVariants, itemVariants } from "@/lib/animations";

const faqs = [
  {
    question: "What CI/CD tools does Kenchi support?",
    answer:
      "Kenchi currently supports GitHub Actions natively. Support for CircleCI, GitLab CI, Buildkite, and other providers is coming soon. Any CI system that reports to GitHub check runs works out of the box.",
  },
  {
    question: "How does Kenchi analyze CI failures?",
    answer:
      "When a CI build fails, Kenchi fetches the build logs and runs them through a multi-model AI pipeline. Logs are intelligently chunked, key signals are extracted, and a final analysis produces a confidence-scored root cause diagnosis with recommended fixes.",
  },
  {
    question: "Is my code data secure?",
    answer:
      "Kenchi never stores your source code. We only process CI build logs, which are analyzed transiently and not retained beyond the analysis lifecycle. Analysis results are encrypted at rest. AI model providers do not retain your data.",
  },
  {
    question: "How long does an analysis take?",
    answer:
      "Most analyses complete in under 2 minutes. The result is posted directly as a comment on your pull request and optionally sent to your Slack channel.",
  },
  {
    question: "Can I use Kenchi with a self-hosted GitHub instance?",
    answer:
      "Yes. Kenchi supports GitHub Enterprise Server. During setup, you can provide your instance URL and Kenchi will connect to your self-hosted environment.",
  },
  {
    question: "What happens after the 14-day trial?",
    answer:
      "After your trial ends, you can continue using Kenchi on the Free plan (3 repos, 50 analyses/month) at no cost. Upgrade to Pro anytime for unlimited repositories and analyses.",
  },
] as const;

const faqSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

const FAQ = () => (
  <section id="faq" aria-label="Frequently asked questions" className="py-24 bg-zinc-900/50">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqSchema }} />
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
          FAQ
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-100 mb-5"
        >
          Frequently Asked Questions
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500">
          Everything you need to know about Kenchi.
        </motion.p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        <motion.div variants={itemVariants}>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question} className="border-zinc-800/60">
                <AccordionTrigger className="text-left text-zinc-200 hover:text-amber-400 transition-colors font-display">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-zinc-500 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </motion.div>
    </div>
  </section>
);

export default FAQ;
