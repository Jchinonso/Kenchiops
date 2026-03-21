/**
 * ChatInput
 *
 * Text input area with send button for the Copilot Drawer.
 * Supports Enter to send, Shift+Enter for newline.
 * Auto-grows up to 4 lines.
 */

import { useState, useCallback, useRef, type KeyboardEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  readonly onSend: (text: string) => void;
  readonly disabled: boolean;
}

export const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) {
      return;
    }
    onSend(trimmed);
    setValue("");
    // Refocus the textarea after sending
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  }, []);

  const isEmpty = value.trim().length === 0;

  return (
    <div className="border-t bg-background p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Kenchi..."
          disabled={disabled}
          rows={1}
          className={cn(
            "min-h-[40px] max-h-[120px] resize-none",
            "border-input bg-transparent text-sm"
          )}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || isEmpty}
          aria-label="Send message"
          className="shrink-0"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
};
