/**
 * Postmortem Editor Page
 *
 * Editable sections for a postmortem document:
 * Summary, Timeline, Root Cause, Impact, Action Items, Lessons Learned, Notes.
 * Supports saving drafts and publishing.
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  FileText,
  Save,
  Send,
  ArrowLeft,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  usePostmortemDetail,
  useUpdatePostmortem,
  usePublishPostmortem,
  type PostmortemContent,
  type PostmortemActionItem,
} from "@/hooks/usePostmortemData";
import { PageLoader } from "@/components/PageLoader";

// ==================== Types ====================

interface PostmortemEditorProps {
  readonly postmortemId: string;
}

// ==================== Sub-components ====================

interface SectionEditorProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
}

const SectionEditor = ({ label, value, onChange, rows = 4 }: SectionEditorProps) => (
  <div>
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
      {label}
    </label>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-y"
    />
  </div>
);

interface ActionItemEditorProps {
  readonly items: readonly PostmortemActionItem[];
  readonly onChange: (items: readonly PostmortemActionItem[]) => void;
}

const ActionItemEditor = ({ items, onChange }: ActionItemEditorProps) => {
  const handleItemChange = useCallback(
    (index: number, field: keyof PostmortemActionItem, value: string) => {
      const updated = items.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      );
      onChange(updated);
    },
    [items, onChange]
  );

  const handleAddItem = useCallback(() => {
    onChange([...items, { action: "", owner: "", dueDate: null, status: "pending" }]);
  }, [items, onChange]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, idx) => idx !== index));
    },
    [items, onChange]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Action Items</label>
        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          <Plus className="w-3 h-3" />
          Add Item
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 italic py-2">
          No action items yet. Click "Add Item" to create one.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Action"
                  value={item.action}
                  onChange={(event) => handleItemChange(index, "action", event.target.value)}
                  className="col-span-1 sm:col-span-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                <input
                  type="text"
                  placeholder="Owner"
                  value={item.owner}
                  onChange={(event) => handleItemChange(index, "owner", event.target.value)}
                  className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <select
                value={item.status}
                onChange={(event) => handleItemChange(index, "status", event.target.value)}
                className="text-xs rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemoveItem(index)}
                className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                aria-label="Remove action item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== Main Component ====================

export const PostmortemEditor = ({ postmortemId }: PostmortemEditorProps) => {
  const navigate = useNavigate();
  const { data: postmortem, isLoading, error } = usePostmortemDetail(postmortemId);
  const { update, isLoading: isSaving } = useUpdatePostmortem();
  const { publish, isLoading: isPublishing } = usePublishPostmortem();

  const [content, setContent] = useState<PostmortemContent | null>(null);
  const [title, setTitle] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Initialize form state when data loads
  useEffect(() => {
    if (postmortem && !content) {
      setContent(postmortem.content);
      setTitle(postmortem.title);
    }
  }, [postmortem, content]);

  const handleContentChange = useCallback(
    (field: keyof PostmortemContent, value: string | readonly PostmortemActionItem[]) => {
      setContent((prev) => (prev ? { ...prev, [field]: value } : null));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!content) {
      return;
    }
    const result = await update(postmortemId, { title, content });
    if (result) {
      setSaveMessage("Draft saved");
      setTimeout(() => setSaveMessage(null), 2000);
    }
  }, [postmortemId, title, content, update]);

  const handlePublish = useCallback(async () => {
    if (!content) {
      return;
    }
    // Save first, then publish
    await update(postmortemId, { title, content });
    const result = await publish(postmortemId);
    if (result) {
      setSaveMessage("Published");
      setTimeout(() => setSaveMessage(null), 2000);
    }
  }, [postmortemId, title, content, update, publish]);

  if (isLoading) {
    return <PageLoader />;
  }

  if (error || !postmortem) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate("/dashboard/incidents/postmortems")}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Postmortems
        </button>
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center text-sm text-red-500">
              <AlertTriangle className="w-4 h-4 mr-2" />
              {error ? "Failed to load postmortem" : "Postmortem not found"}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAiGenerated = postmortem.alertId !== null;
  const isPublished = postmortem.status === "published";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard/incidents/postmortems")}
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Back to postmortems"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100">
              Edit Postmortem
            </h1>
            {isAiGenerated && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  AI-generated draft -- review before publishing
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveMessage && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              {saveMessage}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isPublishing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          {!isPublished && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSaving || isPublishing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <Card>
        <CardContent className="pt-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </CardContent>
      </Card>

      {/* Content Sections */}
      {content && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              <CardTitle>Postmortem Sections</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <SectionEditor
              label="Summary"
              value={content.summary}
              onChange={(value) => handleContentChange("summary", value)}
              rows={3}
            />
            <SectionEditor
              label="Timeline"
              value={content.timeline}
              onChange={(value) => handleContentChange("timeline", value)}
              rows={5}
            />
            <SectionEditor
              label="Root Cause"
              value={content.rootCause}
              onChange={(value) => handleContentChange("rootCause", value)}
            />
            <SectionEditor
              label="Impact"
              value={content.impact}
              onChange={(value) => handleContentChange("impact", value)}
            />
            <ActionItemEditor
              items={content.actionItems}
              onChange={(items) => handleContentChange("actionItems", items)}
            />
            <SectionEditor
              label="Lessons Learned"
              value={content.lessonsLearned}
              onChange={(value) => handleContentChange("lessonsLearned", value)}
            />
            <SectionEditor
              label="Additional Notes"
              value={content.additionalNotes}
              onChange={(value) => handleContentChange("additionalNotes", value)}
              rows={3}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
