export const CIAnalysisMockup = () => (
  <div
    role="img"
    aria-label="CI build failure analysis mockup"
    className="w-full max-w-md bg-zinc-100/80 dark:bg-zinc-900/80 rounded-xl shadow-lg dark:shadow-2xl overflow-hidden border border-zinc-200/60 dark:border-zinc-800/60 backdrop-blur-sm"
  >
    <div className="bg-zinc-50 dark:bg-zinc-950 px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5" aria-hidden="true">
        <div className="w-3 h-3 rounded-full bg-red-500/80" />
        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
        <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
      </div>
      <span className="text-zinc-500 text-sm font-mono ml-2">CI Build #4821 — Failed</span>
    </div>
    <div className="p-4 font-mono text-sm space-y-2">
      <div className="text-red-400 bg-red-950/40 border border-red-900/30 p-3 rounded-lg">
        <div className="font-semibold text-red-300">Error: Module not found</div>
        <div className="text-xs text-red-500 mt-1">
          Cannot resolve &apos;@utils/auth&apos; in &apos;src/api/middleware.ts&apos;
        </div>
      </div>
      <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-2" />
      <div className="bg-amber-950/20 border border-amber-900/20 p-3 rounded-lg">
        <div className="font-semibold text-xs uppercase tracking-wider text-amber-500 mb-1.5">
          Kenchi Analysis
        </div>
        <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Path alias &apos;@utils&apos; was removed in commit{" "}
          <span className="font-medium text-amber-400">a3f2c91</span>. Update import to
          &apos;../../utils/auth&apos;.
        </div>
      </div>
    </div>
  </div>
);
