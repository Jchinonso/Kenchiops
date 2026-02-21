/**
 * New Investigation Form Page
 *
 * Simple form to start a new investigation with structured input fields.
 * Submits to POST /api/v1/investigations and navigates to the detail page.
 */

import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Search, AlertCircle } from "lucide-react";
import { useStartInvestigation } from "@/hooks/useInvestigationData";

// ==================== Constants ====================

const ENVIRONMENT_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "Select environment" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
] as const;

const SYMPTOM_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
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

const INPUT_CLASS =
  "w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-gray-100";

// ==================== Types ====================

interface FormState {
  readonly description: string;
  readonly serviceName: string;
  readonly environment: string;
  readonly symptom: string;
  readonly endpoint: string;
}

// ==================== Main Component ====================

export const NewInvestigation = () => {
  const navigate = useNavigate();
  const { submit, isLoading, error } = useStartInvestigation();
  const [form, setForm] = useState<FormState>({
    description: "",
    serviceName: "",
    environment: "",
    symptom: "",
    endpoint: "",
  });

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      const result = await submit({
        description: form.description.trim(),
        serviceName: form.serviceName.trim() || undefined,
        environment: form.environment || undefined,
        symptom: form.symptom || undefined,
        endpoint: form.endpoint.trim() || undefined,
      });

      if (result) {
        navigate(`/dashboard/incidents/investigations/${result.id}`);
      }
    },
    [form, submit, navigate]
  );

  const isValid = form.description.trim().length > 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <Link
          to="/dashboard/incidents/investigations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Investigations
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          New Investigation
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Describe the problem and Kenchi will gather evidence from your monitoring tools, past
          incidents, and CI analyses to diagnose the issue.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" />
            <CardTitle>Investigation Details</CardTitle>
          </div>
          <CardDescription>
            Provide as much context as you can. Optional fields help narrow the search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Description (required) */}
            <div className="space-y-1.5">
              <label
                htmlFor="investigation-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="investigation-description"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Describe the problem, e.g. 'API response times are slow on /api/orders since this morning'"
                rows={4}
                required
                className={INPUT_CLASS}
              />
            </div>

            {/* Service Name (optional) */}
            <div className="space-y-1.5">
              <label
                htmlFor="investigation-service"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Service Name
              </label>
              <input
                id="investigation-service"
                type="text"
                value={form.serviceName}
                onChange={(event) => updateField("serviceName", event.target.value)}
                placeholder="e.g. api-gateway, payment-service"
                className={INPUT_CLASS}
              />
            </div>

            {/* Two-column row for Environment and Symptom */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Environment (optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="investigation-environment"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Environment
                </label>
                <Select
                  value={form.environment || "none"}
                  onValueChange={(value) =>
                    updateField("environment", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="investigation-environment" className="w-full">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENVIRONMENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "none"} value={option.value || "none"}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Symptom (optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="investigation-symptom"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Symptom
                </label>
                <Select
                  value={form.symptom || "none"}
                  onValueChange={(value) => updateField("symptom", value === "none" ? "" : value)}
                >
                  <SelectTrigger id="investigation-symptom" className="w-full">
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    {SYMPTOM_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "none"} value={option.value || "none"}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Endpoint (optional) */}
            <div className="space-y-1.5">
              <label
                htmlFor="investigation-endpoint"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Endpoint
              </label>
              <input
                id="investigation-endpoint"
                type="text"
                value={form.endpoint}
                onChange={(event) => updateField("endpoint", event.target.value)}
                placeholder="e.g. /api/v1/orders, /health"
                className={INPUT_CLASS}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                to="/dashboard/incidents/investigations"
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={!isValid || isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Start Investigation
                  </>
                )}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
