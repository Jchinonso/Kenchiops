import { createElement } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { microSpring } from "@/lib/animations";
import type { GitProvider } from "./constants";

interface ProviderButtonProps {
  readonly provider: GitProvider;
  readonly variant: "primary" | "secondary";
  readonly isLoading: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

const PRIMARY_CLASSES =
  "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-lg shadow-amber-500/20 hover:shadow-glow-amber-lg";
const SECONDARY_CLASSES =
  "group bg-zinc-100/80 dark:bg-zinc-800/50 border border-zinc-300/60 dark:border-zinc-700/60 hover:border-amber-500/20 dark:hover:border-amber-500/30 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-100";

export const ProviderButton = ({
  provider,
  variant,
  isLoading,
  disabled,
  onClick,
}: ProviderButtonProps) => {
  const isPrimary = variant === "primary";
  const iconClasses = isPrimary
    ? "w-5 h-5"
    : "w-5 h-5 text-zinc-400 dark:text-zinc-500 group-hover:text-amber-500/70 transition-colors";
  const icon = createElement(provider.iconComponent, { className: iconClasses });

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={microSpring}
      className={cn(
        "w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed",
        isPrimary ? PRIMARY_CLASSES : SECONDARY_CLASSES
      )}
    >
      {isLoading ? (
        <Loader2 className={cn("w-5 h-5 animate-spin", !isPrimary && "text-zinc-500")} />
      ) : (
        icon
      )}
      <span>
        {isLoading
          ? `Connecting to ${provider.name}...`
          : isPrimary
            ? `Continue with ${provider.name}`
            : provider.name}
      </span>
      {isPrimary && !isLoading && <ChevronRight className="w-4 h-4 ml-auto opacity-60" />}
    </motion.button>
  );
};
