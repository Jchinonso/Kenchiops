/**
 * MessageList
 *
 * Scrollable container for chat messages with auto-scroll behavior.
 * Shows an empty state prompt when no messages exist.
 */

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { CopilotMessage } from "@/hooks/useCopilotChat";

interface MessageListProps {
  readonly messages: readonly CopilotMessage[];
  readonly isStreaming: boolean;
}

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
      <MessageSquare className="size-6 text-muted-foreground" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">Kenchi Copilot</p>
      <p className="text-xs text-muted-foreground">
        Ask me anything about your CI/CD failures, incidents, or codebase.
      </p>
    </div>
  </div>
);

export const MessageList = ({ messages, isStreaming }: MessageListProps) => {
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
        <EmptyState />
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
