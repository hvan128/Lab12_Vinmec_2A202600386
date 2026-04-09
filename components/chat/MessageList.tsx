"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { UIMessage } from "ai";
import { isTextUIPart } from "ai";
import { ChevronDown } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { TypingDots } from "@/components/ui-vinmec/TypingDots";
import { Avatar } from "@/components/ui-vinmec/Avatar";
import {
  EMPTY_STATE_SUGGESTIONS,
  pickFollowups,
} from "@/lib/agent/suggested-questions";
import {
  extractText,
  extractToolNames,
} from "@/lib/agent/extract-message";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  onSuggestionPick: (q: string) => void;
  onActionClick: (value: string) => void;
  onSelectDoctor?: (doctorId: string, doctorName: string) => void;
  onSelectSlot?: (datetime: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export function MessageList({
  messages,
  isStreaming = false,
  onSuggestionPick,
  onActionClick,
  onSelectDoctor,
  onSelectSlot,
  scrollContainerRef,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Only show visible messages (skip system)
  const visible = messages.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  // Last assistant message id for memoization — computed before any early return
  const assistantMessages = visible.filter((m) => m.role === "assistant");
  const lastAssistantMsg =
    assistantMessages[assistantMessages.length - 1] ?? null;
  const lastAssistantId = lastAssistantMsg?.id ?? "";

  // Last user message text for filtering followups
  const userMessages = visible.filter((m) => m.role === "user");
  const lastUserMsg = userMessages[userMessages.length - 1];
  const lastUserText = lastUserMsg
    ? lastUserMsg.parts.filter(isTextUIPart).map((p) => p.text).join("")
    : "";

  // Memoized followup suggestions — only recompute when a new assistant message arrives
  const followups = useMemo(
    () => pickFollowups(lastUserText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastAssistantId]
  );

  // Track if the scroll container is at the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef?.current;
    if (!el) return;
    const threshold = 80; // px from bottom
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessage(false);
  }, [scrollContainerRef]);

  // Attach scroll listener to the parent container
  useEffect(() => {
    const el = scrollContainerRef?.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, scrollContainerRef]);

  // Auto-scroll logic: scroll to bottom only if user is already at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setHasNewMessage(false);
    } else {
      // User has scrolled up — show new message indicator
      setHasNewMessage(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessage(false);
  };

  // Empty state: show suggestion cards
  if (visible.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
        <SuggestedQuestions
          questions={EMPTY_STATE_SUGGESTIONS}
          onPick={onSuggestionPick}
          variant="empty"
        />
      </div>
    );
  }

  // Show TypingDots when submitted but no assistant reply yet
  const lastMsg = visible[visible.length - 1];
  const showTyping = isStreaming && lastMsg?.role === "user";

  const showFollowups =
    !isStreaming && lastAssistantMsg !== null && followups.length > 0;

  return (
    <div className="relative flex flex-col gap-4 py-2">
      {visible.map((msg, idx) => {
        const isLast = idx === visible.length - 1;

        // --- Feedback context for assistant messages ---
        let showFeedback = false;
        let feedbackQuery = "";
        let feedbackToolsUsed: string[] = [];

        if (msg.role === "assistant") {
          // Must have at least one text part and not be the actively-streaming last message
          const hasText = msg.parts.some(
            (p) => p.type === "text" && !!(p as { type: string; text?: string }).text
          );
          const isStreamingLast = isLast && isStreaming;
          showFeedback = hasText && !isStreamingLast;

          if (showFeedback) {
            // user message immediately before this one
            const prevMsg = visible[idx - 1];
            feedbackQuery =
              prevMsg && prevMsg.role === "user"
                ? extractText(prevMsg)
                : "";
            feedbackToolsUsed = extractToolNames(msg);
          }
        }

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={isLast}
            isStreaming={isStreaming}
            onActionClick={
              msg.role === "assistant" && isLast ? onActionClick : undefined
            }
            onSelectDoctor={msg.role === "assistant" ? onSelectDoctor : undefined}
            onSelectSlot={msg.role === "assistant" ? onSelectSlot : undefined}
            showFeedback={showFeedback}
            query={feedbackQuery}
            toolsUsed={feedbackToolsUsed}
          />
        );
      })}
      {showTyping && (
        <div className="flex items-start gap-2">
          <Avatar name="Trợ lý ảo" size={32} />
          <div className="chat-bubble-bot">
            <TypingDots />
          </div>
        </div>
      )}
      {showFollowups && (
        <div className="pl-10">
          <SuggestedQuestions
            questions={followups}
            onPick={onSuggestionPick}
            variant="inline"
          />
        </div>
      )}
      <div ref={bottomRef} />

      {/* Scroll-to-bottom floating button */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          aria-label="Cuộn xuống cuối"
          className="sticky bottom-2 mt-1 ml-auto mr-0 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-vinmec-border shadow-card-soft hover:shadow-chat-bubble text-vinmec-primary transition-all duration-200 hover:-translate-y-0.5 z-10"
        >
          {hasNewMessage && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-vinmec-primary rounded-full border-2 border-white" />
          )}
          <ChevronDown size={16} />
        </button>
      )}
    </div>
  );
}
