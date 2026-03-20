/**
 * MessageBubble
 *
 * Individual chat message display with role-based styling.
 * User messages are right-aligned, assistant messages left-aligned.
 * Supports a streaming indicator for in-progress assistant responses.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly isStreaming?: boolean;
}

/**
 * Renders inline code spans within a text segment.
 * Splits on backtick-delimited code and wraps matches in <code>.
 */
const renderInlineCode = (text: string, keyPrefix: string): readonly React.ReactNode[] => {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${keyPrefix}-code-${String(index)}`}
          className="rounded bg-zinc-200 px-1 py-0.5 text-xs font-mono dark:bg-zinc-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}-text-${String(index)}`}>{part}</span>;
  });
};

/**
 * Renders bold segments within text that may also contain inline code.
 * Splits on **bold** markers and recurses into renderInlineCode.
 */
const renderBoldAndCode = (text: string, keyPrefix: string): readonly React.ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const segmentKey = `${keyPrefix}-bold-${String(index)}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={segmentKey}>{renderInlineCode(part.slice(2, -2), segmentKey)}</strong>;
    }
    return <span key={segmentKey}>{renderInlineCode(part, segmentKey)}</span>;
  });
};

/**
 * Simple markdown renderer for assistant messages.
 * Handles: **bold**, `inline code`, code blocks, and line breaks.
 * Intentionally minimal — no heavy markdown library dependency.
 */
const renderMarkdown = (content: string): React.ReactNode => {
  // Split on fenced code blocks first
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return blocks.map((block, blockIndex) => {
    const blockKey = `block-${String(blockIndex)}`;

    // Fenced code block
    if (block.startsWith("```") && block.endsWith("```")) {
      const inner = block.slice(3, -3);
      // Remove optional language identifier on first line
      const newlineIndex = inner.indexOf("\n");
      const code = newlineIndex >= 0 ? inner.slice(newlineIndex + 1) : inner;
      return (
        <pre
          key={blockKey}
          className="my-2 overflow-x-auto rounded-md bg-zinc-200 p-3 text-xs font-mono dark:bg-zinc-800"
        >
          <code>{code}</code>
        </pre>
      );
    }

    // Regular text — split by newlines and render inline formatting
    const lines = block.split("\n");
    return (
      <span key={blockKey}>
        {lines.map((line, lineIndex) => {
          const lineKey = `${blockKey}-line-${String(lineIndex)}`;
          return (
            <span key={lineKey}>
              {lineIndex > 0 && <br />}
              {renderBoldAndCode(line, lineKey)}
            </span>
          );
        })}
      </span>
    );
  });
};

export const MessageBubble = ({ role, content, isStreaming }: MessageBubbleProps) => {
  const isUser = role === "user";
  const showCursor = isStreaming && !isUser && content.length === 0;
  const showPulse = isStreaming && !isUser && content.length > 0;

  const renderedContent = useMemo(
    () => (isUser ? content : renderMarkdown(content)),
    [content, isUser]
  );

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {showCursor ? (
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
        ) : (
          <>
            <span className="whitespace-pre-wrap break-words">{renderedContent}</span>
            {showPulse && (
              <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
            )}
          </>
        )}
      </div>
    </div>
  );
};
