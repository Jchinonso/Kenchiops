/**
 * ConversationList
 *
 * Panel that displays past chat conversations with the ability
 * to load or delete them. Shown when the user toggles history view.
 */

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, MessageSquare, Plus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useConversationList, type ConversationSummary } from "@/hooks/useConversationList";

interface ConversationListProps {
  readonly onSelectConversation: (id: string) => void;
  readonly onNewConversation: () => void;
  readonly activeConversationId: string | null;
}

// ==================== Helpers ====================

/** Parse the pageType from a JSON pageContext string. Returns null on failure. */
const parsePageType = (pageContext: string | null): string | null => {
  if (!pageContext) {
    return null;
  }
  try {
    const parsed = JSON.parse(pageContext) as { readonly pageType?: string };
    return parsed.pageType ?? null;
  } catch {
    return null;
  }
};

/** Format an ISO date string as a relative time (e.g., "2 hours ago"). */
const formatRelativeTime = (isoDate: string): string => {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${String(diffMinutes)}m ago`;
  }
  if (diffHours < 24) {
    return `${String(diffHours)}h ago`;
  }
  if (diffDays < 30) {
    return `${String(diffDays)}d ago`;
  }
  return new Date(isoDate).toLocaleDateString();
};

// ==================== Sub-Components ====================

const EmptyState = ({ onNewConversation }: { readonly onNewConversation: () => void }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
      <MessageSquare className="size-6 text-muted-foreground" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">No conversations yet</p>
      <p className="text-xs text-muted-foreground">Start a new conversation with Kenchi Copilot.</p>
    </div>
    <Button variant="outline" size="sm" onClick={onNewConversation} className="mt-2">
      <Plus className="mr-1.5 size-3.5" />
      New conversation
    </Button>
  </div>
);

interface ConversationItemProps {
  readonly conversation: ConversationSummary;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
  readonly isDeleting: boolean;
}

const ConversationItem = ({
  conversation,
  isActive,
  onSelect,
  onDelete,
  isDeleting,
}: ConversationItemProps) => {
  const pageType = useMemo(
    () => parsePageType(conversation.pageContext),
    [conversation.pageContext]
  );

  const relativeTime = useMemo(
    () => formatRelativeTime(conversation.updatedAt),
    [conversation.updatedAt]
  );

  const title = conversation.title ?? "Untitled conversation";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
        isActive ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-muted/50"
      )}
    >
      <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-1.5">
          {pageType && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {pageType}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{relativeTime}</span>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
            aria-label="Delete conversation"
          >
            <Trash2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete conversation</TooltipContent>
      </Tooltip>
    </button>
  );
};

// ==================== Main Component ====================

export const ConversationList = ({
  onSelectConversation,
  onNewConversation,
  activeConversationId,
}: ConversationListProps) => {
  const { conversations, isLoading, deleteConversation, isDeleting } = useConversationList();

  const { length: conversationCount } = conversations;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading conversations...</p>
      </div>
    );
  }

  if (conversationCount === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        <EmptyState onNewConversation={onNewConversation} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {conversationCount} conversation{conversationCount !== 1 ? "s" : ""}
        </span>
        <Button variant="ghost" size="sm" onClick={onNewConversation} className="h-7 text-xs">
          <Plus className="mr-1 size-3" />
          New
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeConversationId}
              onSelect={() => onSelectConversation(conversation.id)}
              onDelete={() => deleteConversation(conversation.id)}
              isDeleting={isDeleting}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
