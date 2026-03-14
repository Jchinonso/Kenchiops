export const ENVIRONMENT_OPTIONS: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
}> = [
  { value: "", label: "Select environment" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
] as const;

export const SYMPTOM_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "Auto-detect" },
  { value: "slow_response", label: "Slow Response" },
  { value: "errors", label: "Errors" },
  { value: "downtime", label: "Downtime" },
  { value: "high_latency", label: "High Latency" },
  { value: "memory_leak", label: "Memory Leak" },
  { value: "cpu_spike", label: "CPU Spike" },
  { value: "deployment_failure", label: "Deployment Failure" },
  { value: "data_inconsistency", label: "Data Inconsistency" },
] as const;

export const INPUT_CLASS =
  "w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-100";
