import { motion } from "motion/react";
import { sectionContainerVariants, itemVariants, microSpring } from "@/lib/animations";

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
    color: "bg-amber-500",
  },
  {
    quote:
      "The confidence scoring is a game-changer. We know exactly when to trust the diagnosis and when to dig deeper.",
    name: "Sarah C.",
    role: "VP Engineering, FastShip",
    initials: "SC",
    color: "bg-violet-500",
  },
  {
    quote:
      "We went from 3-hour debugging sessions to 5-minute fixes. Kenchi pays for itself in the first week.",
    name: "Marcus W.",
    role: "Platform Lead, DeployHQ",
    initials: "MW",
    color: "bg-emerald-500",
  },
];

const Testimonials = () => (
  <section id="testimonials" aria-label="Customer testimonials" className="py-24 bg-zinc-950">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
          Testimonials
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-100 mb-5"
        >
          Loved by Engineering Teams
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Hear from teams who stopped wasting hours on CI debugging.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid md:grid-cols-3 gap-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {testimonials.map((testimonial) => (
          <motion.div
            key={testimonial.name}
            variants={itemVariants}
            whileHover={{ y: -4, transition: microSpring }}
            className="relative bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-8 hover:border-amber-500/15 transition-all duration-300"
          >
            {/* Decorative quote mark */}
            <span
              className="absolute top-5 left-6 text-5xl font-serif text-zinc-800/60 leading-none select-none"
              aria-hidden="true"
            >
              &ldquo;
            </span>

            <blockquote className="relative text-zinc-300 leading-relaxed mb-8 pt-6">
              {testimonial.quote}
            </blockquote>
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={microSpring}
                className={`w-10 h-10 ${testimonial.color} rounded-full flex items-center justify-center`}
              >
                <span className="text-white text-sm font-bold">{testimonial.initials}</span>
              </motion.div>
              <div>
                <div className="font-medium text-zinc-200 text-sm">{testimonial.name}</div>
                <div className="text-xs text-zinc-600">{testimonial.role}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Testimonials;
