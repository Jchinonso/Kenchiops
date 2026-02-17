export const CIAnalysisMockup = () => (
  <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
    <div className="bg-gray-900 dark:bg-gray-950 px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
      </div>
      <span className="text-gray-400 text-sm ml-2">CI Build #4821 — Failed</span>
    </div>
    <div className="p-4 font-mono text-sm space-y-2">
      <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-2 rounded">
        <div className="font-semibold">Error: Module not found</div>
        <div className="text-xs text-red-500 dark:text-red-400 mt-1">
          Cannot resolve &apos;@utils/auth&apos; in &apos;src/api/middleware.ts&apos;
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2" />
      <div className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 p-2 rounded">
        <div className="font-semibold text-xs uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">
          Kenchi Analysis
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Path alias &apos;@utils&apos; was removed in commit{" "}
          <span className="font-medium">a3f2c91</span>. Update import to
          &apos;../../utils/auth&apos;.
        </div>
      </div>
    </div>
  </div>
);
