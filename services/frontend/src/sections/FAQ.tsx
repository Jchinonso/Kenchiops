import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

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

const FAQ = () => (
  <section
    id="faq"
    aria-label="Frequently asked questions"
    className="py-20 bg-white dark:bg-gray-950"
  >
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Everything you need to know about Kenchi.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`faq-${index}`}>
            <AccordionTrigger className="text-left text-gray-900 dark:text-gray-100">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-gray-600 dark:text-gray-400 leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default FAQ;
