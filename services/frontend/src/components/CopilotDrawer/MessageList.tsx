/**
 * MessageList
 *
 * Scrollable container for chat messages with auto-scroll behavior.
 * Shows an empty state prompt when no messages exist.
 */

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Zap, Search, Bug } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { CopilotMessage } from "@/hooks/useCopilotChat";

interface MessageListProps {
  readonly messages: readonly CopilotMessage[];
  readonly isStreaming: boolean;
  readonly onSuggestionClick?: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: Bug, text: "Why did this CI build fail?" },
  { icon: Search, text: "How did we fix this issue before?" },
  { icon: Zap, text: "What should I try to resolve this?" },
] as const;

interface EmptyStateProps {
  readonly onSuggestionClick?: (text: string) => void;
}

const EmptyState = ({ onSuggestionClick }: EmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
      <Sparkles className="size-6 text-primary" />
    </div>
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">Kenchi Copilot</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Your AI assistant for CI/CD failures, incidents, and past resolutions. Ask a question or try
        one of these:
      </p>
    </div>
    <div className="flex w-full flex-col gap-2">
      {SUGGESTIONS.map(({ icon: Icon, text }) => (
        <button
          key={text}
          type="button"
          onClick={() => onSuggestionClick?.(text)}
          className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
        >
          <Icon className="size-3.5 shrink-0" />
          <span>{text}</span>
        </button>
      ))}
    </div>
  </div>
);

export const MessageList = ({ messages, isStreaming, onSuggestionClick }: MessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { length: messageCount } = messages;

  // Auto-scroll to bottom on new messages only (not every streaming token)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // During streaming, scroll on an interval to keep up without per-token jank
  useEffect(() => {
    if (!isStreaming) {
      return;
    }
    const interval = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 300);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (messageCount === 0) {
    return (
      <div className="flex-1 overflow-hidden">
        <EmptyState onSuggestionClick={onSuggestionClick} />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <div className="flex flex-col gap-3 p-4">
        {messages.map((message, index) => {
          const isLastMessage = index === messageCount - 1;
          const isStreamingThis = isStreaming && isLastMessage && message.role === "assistant";

          return (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              isStreaming={isStreamingThis}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
};
