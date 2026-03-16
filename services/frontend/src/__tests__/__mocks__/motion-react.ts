/**
 * Global mock for the motion/react library.
 *
 * The motion library's MotionConfig context provider is not initialized
 * in jsdom, causing "Cannot read properties of null (reading 'useContext')"
 * errors. This mock replaces motion.* components with plain HTML elements
 * and stubs out AnimatePresence / MotionConfig as passthroughs.
 *
 * Framer-motion-specific props (animate, initial, exit, variants, etc.)
 * are filtered out so they don't leak into the DOM and cause React warnings.
 */

import { vi } from "vitest";
import React from "react";

/** Props that are specific to motion and should not be forwarded to the DOM. */
const MOTION_PROP_PREFIXES = [
  "while",
  "animate",
  "initial",
  "exit",
  "transition",
  "variants",
  "drag",
  "onDrag",
  "onAnimation",
  "onPan",
  "onTap",
  "onHover",
  "style", // motion uses a special MotionStyle type; pass-through causes issues
] as const;

const MOTION_EXACT_PROPS = new Set([
  "layout",
  "layoutId",
  "layoutDependency",
  "layoutScroll",
  "inherit",
  "custom",
  "onLayoutAnimationStart",
  "onLayoutAnimationComplete",
  "onBeforeLayoutMeasure",
]);

const isMotionProp = (key: string): boolean =>
  MOTION_EXACT_PROPS.has(key) || MOTION_PROP_PREFIXES.some((prefix) => key.startsWith(prefix));

const filterMotionProps = (props: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(props).filter(([key]) => !isMotionProp(key)));

/**
 * Proxy that creates a forwarded-ref component for any `motion.<tag>` access.
 * e.g., `motion.div` returns a component that renders a plain `<div>`.
 */
const motionProxy = new Proxy(
  {},
  {
    get: (_target, prop: string) =>
      React.forwardRef(
        (
          props: Record<string, unknown> & { readonly children?: React.ReactNode },
          ref: React.Ref<HTMLElement>
        ) => {
          const { children, ...rest } = props;
          return React.createElement(prop, { ...filterMotionProps(rest), ref }, children);
        }
      ),
  }
);

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("motion/react");

  return {
    ...actual,
    motion: motionProxy,
    AnimatePresence: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    MotionConfig: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
    useInView: () => true,
    useAnimation: () => ({
      start: () => Promise.resolve(),
      stop: () => undefined,
      set: () => undefined,
    }),
    useMotionValue: (initial: number) => ({
      get: () => initial,
      set: () => undefined,
      onChange: () => () => undefined,
    }),
    useTransform: (value: unknown) => value,
    useSpring: (value: unknown) => value,
    useScroll: () => ({
      scrollX: { get: () => 0, onChange: () => () => undefined },
      scrollY: { get: () => 0, onChange: () => () => undefined },
      scrollXProgress: { get: () => 0, onChange: () => () => undefined },
      scrollYProgress: { get: () => 0, onChange: () => () => undefined },
    }),
  };
});

export {};
