import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart, getToolName } from "ai";
import { Avatar } from "@/components/ui-vinmec/Avatar";
import { ToolCallBadge } from "./ToolCallBadge";
import { ActionButtons } from "./ActionButtons";
import { detectActions } from "@/lib/agent/action-detector";
import { FeedbackButtons } from "./FeedbackButtons";
import { MarkdownText } from "./MarkdownText";
import { DoctorCardList } from "./DoctorCardList";
import { SlotChipList } from "./SlotChipList";

interface MessageBubbleProps {
  message: UIMessage;
  isLast?: boolean;
  isStreaming?: boolean;
  onActionClick?: (value: string) => void;
  onSelectDoctor?: (doctorId: string, doctorName: string) => void;
  onSelectSlot?: (datetime: string) => void;
  // Feedback props
  showFeedback?: boolean;
  query?: string;
  toolsUsed?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderToolOutput(
  toolName: string,
  output: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  onSelectDoctor?: (doctorId: string, doctorName: string) => void,
  onSelectSlot?: (datetime: string) => void
) {
  const normalized = toolName.startsWith("tool-") ? toolName.slice(5) : toolName;

  if (normalized === "list_doctors" && Array.isArray(output)) {
    return <DoctorCardList doctors={output} onSelectDoctor={onSelectDoctor} />;
  }

  if (
    normalized === "check_availability" &&
    output &&
    typeof output === "object" &&
    Array.isArray(output.slots)
  ) {
    return <SlotChipList slots={output.slots} doctorId={output.doctorId ?? ""} onSelectSlot={onSelectSlot} />;
  }

  return null;
}

function BotContent({
  message,
  onSelectDoctor,
  onSelectSlot,
}: {
  message: UIMessage;
  onSelectDoctor?: (doctorId: string, doctorName: string) => void;
  onSelectSlot?: (datetime: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, i) => {
        if (part.type === "step-start" || part.type === "reasoning") {
          return null;
        }

        if (isTextUIPart(part)) {
          if (!part.text) return null;
          return (
            <div
              key={i}
              className="chat-bubble-bot text-sm leading-relaxed"
            >
              <MarkdownText>{part.text}</MarkdownText>
            </div>
          );
        }

        if (isToolUIPart(part)) {
          const name = getToolName(part);
          const s = part.state;
          const badgeState =
            s === "output-available"
              ? "done"
              : s === "output-error"
              ? "error"
              : "running";

          // For done state on specific tools, render rich cards instead of badge
          if (s === "output-available") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const richOutput = renderToolOutput(name, (part as any).output, onSelectDoctor, onSelectSlot);
            if (richOutput) {
              return <div key={i}>{richOutput}</div>;
            }
          }

          return (
            <ToolCallBadge key={i} toolName={name} state={badgeState} />
          );
        }

        return null;
      })}
    </div>
  );
}

function UserContent({ message }: { message: UIMessage }) {
  const texts = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");
  return (
    <div className="chat-bubble-user max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap">
      {texts}
    </div>
  );
}

export function MessageBubble({
  message,
  isLast = false,
  isStreaming = false,
  onActionClick,
  onSelectDoctor,
  onSelectSlot,
  showFeedback = false,
  query = "",
  toolsUsed = [],
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1 animate-fade-in-up">
        <span className="text-xs text-vinmec-text-muted px-1">Bạn</span>
        <UserContent message={message} />
      </div>
    );
  }

  // Extract full text from all text parts for action detection
  const fullText = message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join(" ");

  const actions =
    isLast && !isStreaming && onActionClick ? detectActions(fullText) : [];

  return (
    <div className="flex items-start gap-2 animate-fade-in-up">
      <Avatar name="Trợ lý ảo" size={32} />
      <div className="flex flex-col gap-1 min-w-0 max-w-[85%]">
        <span className="text-xs text-vinmec-text-muted px-1">
          Trợ lý ảo VinmecCare
        </span>
        <BotContent
          message={message}
          onSelectDoctor={onSelectDoctor}
          onSelectSlot={onSelectSlot}
        />
        {actions.length > 0 && onActionClick && (
          <ActionButtons actions={actions} onAction={onActionClick} />
        )}
        {showFeedback && (
          <FeedbackButtons
            messageId={message.id}
            query={query}
            response={fullText}
            toolsUsed={toolsUsed}
          />
        )}
      </div>
    </div>
  );
}
