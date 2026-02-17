import { useScrollFadeIn } from "@/hooks/useScrollFadeIn";

interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly color: string;
}

const testimonials: readonly Testimonial[] = [
  {
    quote: "Kenchi cut our CI debugging time by 80%. What used to take an hour now takes minutes.",
    name: "James K.",
    role: "Staff Engineer, Series B Startup",
    initials: "JK",
    color: "bg-indigo-500",
  },
  {
    quote:
      "The confidence scoring is a game-changer. We know exactly when to trust the diagnosis and when to dig deeper.",
    name: "Sarah C.",
    role: "VP Engineering, FastShip",
    initials: "SC",
    color: "bg-cyan-500",
  },
  {
    quote:
      "We went from 3-hour debugging sessions to 5-minute fixes. Kenchi pays for itself in the first week.",
    name: "Marcus W.",
    role: "Platform Lead, DeployHQ",
    initials: "MW",
    color: "bg-violet-500",
  },
];

const Testimonials = () => {
  const { ref, fadeClass } = useScrollFadeIn();

  return (
    <section
      id="testimonials"
      aria-label="Customer testimonials"
      className="py-20 bg-gray-50 dark:bg-gray-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          ref={ref as React.RefObject<HTMLDivElement>}
          className={`text-center mb-16 ${fadeClass}`}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Loved by Engineering Teams
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Hear from teams who stopped wasting hours on CI debugging.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow"
            >
              <blockquote className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 ${testimonial.color} rounded-full flex items-center justify-center`}
                >
                  <span className="text-white text-sm font-bold">{testimonial.initials}</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {testimonial.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
