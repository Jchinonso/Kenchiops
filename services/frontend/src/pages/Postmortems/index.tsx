/**
 * Postmortems List Page
 *
 * Displays a table of postmortem documents with status, linked incident,
 * and creation date. Supports generating new postmortems from resolved incidents.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  FileText,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  FileEdit,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  usePostmortems,
  useGeneratePostmortem,
  type PostmortemRecord,
} from "@/hooks/usePostmortemData";
import { useIncidents } from "@/hooks/useIncidentData";
import { cn } from "@/lib/utils";

// ==================== Constants ====================

const PAGE_SIZE = 20;

// ==================== Helpers ====================

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getStatusBadge = (status: string): React.ReactNode => {
  const isDraft = status === "draft";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
        isDraft
          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
          : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
      )}
    >
      {isDraft ? <FileEdit className="w-3 h-3" /> : <Check className="w-3 h-3" />}
      {isDraft ? "Draft" : "Published"}
    </span>
  );
};

// ==================== Sub-components ====================

interface GenerateDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onGenerate: (alertId: string) => void;
  readonly isGenerating: boolean;
  readonly tenantId: string;
}

const GenerateDialog = ({
  open,
  onClose,
  onGenerate,
  isGenerating,
  tenantId,
}: GenerateDialogProps) => {
  const { data: incidentsData } = useIncidents({
    tenantId,
    limit: 50,
    offset: 0,
    status: "resolved",
  });
  const resolvedIncidents = useMemo(() => incidentsData?.items ?? [], [incidentsData?.items]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-lg mx-4 border border-zinc-200 dark:border-zinc-800">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Generate Postmortem
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Select a resolved incident to generate an AI-drafted postmortem.
          </p>
        </div>
        <div className="p-6 max-h-80 overflow-y-auto">
          {resolvedIncidents.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
              No resolved incidents found. Resolve an incident first to generate a postmortem.
            </p>
          ) : (
            <div className="space-y-2">
              {resolvedIncidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => onGenerate(incident.id)}
                  className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
                    {incident.title}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {incident.source} &middot; {incident.severity} &middot;{" "}
                    {formatDate(incident.receivedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

interface PostmortemRowProps {
  readonly postmortem: PostmortemRecord;
  readonly onClick: () => void;
}

const PostmortemRow = ({ postmortem, onClick }: PostmortemRowProps) => (
  <tr
    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
    onClick={onClick}
  >
    <td className="px-4 py-3">
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
        {postmortem.title}
      </div>
    </td>
    <td className="px-4 py-3">{getStatusBadge(postmortem.status)}</td>
    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      {postmortem.alertId ? (
        <span className="font-mono">{postmortem.alertId.slice(0, 12)}...</span>
      ) : (
        <span className="italic">Manual</span>
      )}
    </td>
    <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      {formatDate(postmortem.createdAt)}
    </td>
  </tr>
);

// ==================== Main Component ====================

export const Postmortems = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const { data, isLoading, error } = usePostmortems(PAGE_SIZE, offset);
  const { generate, isLoading: isGenerating } = useGeneratePostmortem();

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const handleGenerate = useCallback(
    async (alertId: string) => {
      const result = await generate(alertId);
      if (result) {
        setShowGenerateDialog(false);
        navigate(`/dashboard/incidents/postmortems/${result.id}`);
      }
    },
    [generate, navigate]
  );

  const handleRowClick = useCallback(
    (id: string) => {
      navigate(`/dashboard/incidents/postmortems/${id}`);
    },
    [navigate]
  );

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            Postmortems
          </h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No tenant configured</EmptyTitle>
                <EmptyDescription>
                  Connect your organization in Settings to manage postmortems.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            Postmortems
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            AI-generated postmortem drafts from resolved incidents. Review, edit, and publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGenerateDialog(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          Generate from Incident
        </button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <CardTitle>Postmortems</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} postmortem${total > 1 ? "s" : ""}`
              : "No postmortems created yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-sm text-red-500">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Failed to load postmortems
            </div>
          ) : items.length === 0 ? (
            <div className="py-12">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileText className="w-6 h-6" />
                  </EmptyMedia>
                  <EmptyTitle>No postmortems yet</EmptyTitle>
                  <EmptyDescription>
                    Generate your first postmortem from a resolved incident using the button above.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Incident
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {items.map((postmortem) => (
                      <PostmortemRow
                        key={postmortem.id}
                        postmortem={postmortem}
                        onClick={() => handleRowClick(postmortem.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!hasPrev}
                      onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!hasNext}
                      onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <GenerateDialog
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        tenantId={tenantId}
      />
    </div>
  );
};
