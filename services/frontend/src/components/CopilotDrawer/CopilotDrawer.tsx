/**
 * CopilotDrawer
 *
 * Slide-out drawer for the Kenchi Copilot chat interface.
 * Uses shadcn Sheet component for the drawer behavior.
 * Supports switching between active chat and conversation history views.
 */

import { useState, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, History, MessageSquare, AlertTriangle, X } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useCopilotChat } from "@/hooks/useCopilotChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { RAGSourceList } from "./RAGSourceList";
import { ConversationList } from "./ConversationList";
import { InvestigationCard } from "./InvestigationCard";

interface CopilotDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const CopilotDrawer = ({ open, onOpenChange }: CopilotDrawerProps) => {
  const {
    messages,
    isStreaming,
    conversationId,
    error,
    ragSources,
    budgetWarning,
    isCooldown,
    isInvestigating,
    investigationDiagnosis,
    sendMessage,
    clearConversation,
    loadConversation,
  } = useCopilotChat();

  const [showHistory, setShowHistory] = useState(false);
  const [budgetDismissed, setBudgetDismissed] = useState(false);

  const showBudgetWarning = budgetWarning !== null && !budgetDismissed;

  const budgetWarningText = useMemo(() => {
    if (!budgetWarning) {
      return "";
    }
    const pct = Math.round(budgetWarning.ratioUsed * 100);
    return `You have used ${pct}% of your daily chat budget. ${budgetWarning.remaining} tokens remaining.`;
  }, [budgetWarning]);

  const dismissBudgetWarning = useCallback((): void => {
    setBudgetDismissed(true);
  }, []);

  const { length: messageCount } = messages;
  const hasMessages = messageCount > 0;

  const handleSelectConversation = useCallback(
    (id: string): void => {
      loadConversation(id);
      setShowHistory(false);
    },
    [loadConversation]
  );

  const handleNewConversation = useCallback((): void => {
    clearConversation();
    setShowHistory(false);
  }, [clearConversation]);

  const toggleHistory = useCallback((): void => {
    setShowHistory((prev) => !prev);
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[440px] max-w-full flex-col gap-0 p-0 sm:max-w-[440px]"
      >
        {/* Header — pr-10 leaves room for the built-in Sheet close button (absolute top-4 right-4) */}
        <SheetHeader className="flex-row items-center justify-between border-b px-4 py-3 pr-10">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <SheetTitle className="text-base">Kenchi Copilot</SheetTitle>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleHistory}
                  aria-label={showHistory ? "Show chat" : "Show history"}
                >
                  {showHistory ? (
                    <MessageSquare className="size-4" />
                  ) : (
                    <History className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showHistory ? "Back to chat" : "Conversation history"}
              </TooltipContent>
            </Tooltip>
            {hasMessages && !showHistory && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearConversation}
                    aria-label="Clear conversation"
                    disabled={isStreaming}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear conversation</TooltipContent>
              </Tooltip>
            )}
          </div>
        </SheetHeader>

        {/* Hidden description for accessibility */}
        <SheetDescription className="sr-only">
          Chat with Kenchi Copilot about your CI/CD failures, incidents, and codebase.
        </SheetDescription>

        {showHistory ? (
          <ConversationList
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            activeConversationId={conversationId}
          />
        ) : (
          <>
            {/* Error banner */}
            {error && (
              <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Investigation results card */}
            {(isInvestigating || investigationDiagnosis) && (
              <InvestigationCard
                isInvestigating={isInvestigating}
                diagnosis={investigationDiagnosis}
              />
            )}

            {/* Messages */}
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              onSuggestionClick={sendMessage}
            />

            {/* RAG Sources */}
            <RAGSourceList sources={ragSources} />

            {/* Budget warning banner */}
            {showBudgetWarning && (
              <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span className="flex-1">{budgetWarningText}</span>
                <button
                  type="button"
                  onClick={dismissBudgetWarning}
                  className="shrink-0 rounded p-0.5 hover:bg-amber-500/20"
                  aria-label="Dismiss budget warning"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}

            {/* Input */}
            <ChatInput onSend={sendMessage} disabled={isStreaming || isCooldown} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
