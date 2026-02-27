/**
 * Shared Motion animation variants used across the application.
 */

/** Stagger container — wraps a group of items that fade in sequentially */
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
} as const;

/** Individual item — fades up with spring physics */
export const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 28,
    },
  },
} as const;

/** Directional page transition for wizard steps */
export const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
} as const;

/** Spring transition for page slides */
export const pageTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
} as const;

/** Snappy spring for hover/tap micro-interactions */
export const microSpring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
} as const;

/** Hero-scale entrance — larger offset for dramatic first impression */
export const heroVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 180,
      damping: 22,
    },
  },
} as const;

/** Scale-in for stats, badges, and icons */
export const scaleInVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 200,
      damping: 20,
    },
  },
} as const;

/** Wider stagger for landing page sections (more dramatic) */
export const sectionContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.12,
    },
  },
} as const;

/** Slow fade for ambient elements */
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: "easeOut" as const,
    },
  },
} as const;

/** Slide from left */
export const slideLeftVariants = {
  hidden: { opacity: 0, x: -40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring" as const,
      stiffness: 200,
      damping: 25,
    },
  },
} as const;

/** Slide from right */
export const slideRightVariants = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring" as const,
      stiffness: 200,
      damping: 25,
    },
  },
} as const;
