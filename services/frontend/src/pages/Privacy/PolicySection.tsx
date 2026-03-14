interface PolicySectionProps {
  readonly title: string;
  readonly body: string;
}

export const PolicySection = ({ title, body }: PolicySectionProps) => (
  <section>
    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">{title}</h2>
    <p>{body}</p>
  </section>
);
