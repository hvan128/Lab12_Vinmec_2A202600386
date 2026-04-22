"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Square, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface ISpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface ISpeechRecognitionCtor {
  new (): ISpeechRecognition;
}
declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionCtor;
    webkitSpeechRecognition?: ISpeechRecognitionCtor;
  }
}

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = "Hãy nhập câu hỏi!",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  // Text that was already typed before voice started — we append speech on top
  const baseTextRef = useRef("");

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Trình duyệt không hỗ trợ nhập giọng nói");
      return;
    }

    baseTextRef.current = value.trimEnd();

    const recognition = new SR();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;

    // Set state optimistically so UI responds immediately on click
    setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const spoken = final || interim;
      const base = baseTextRef.current;
      setValue(base ? `${base} ${spoken}` : spoken);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      inputRef.current?.focus();
    };

    recognition.onerror = (event: { error?: string }) => {
      setIsListening(false);
      recognitionRef.current = null;
      if (event.error === "not-allowed") {
        toast.error("Vui lòng cho phép truy cập microphone trong cài đặt trình duyệt");
      } else if (event.error !== "aborted") {
        toast.error("Không thể ghi âm. Vui lòng thử lại");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      toast.error("Không thể khởi động microphone");
    }
  }, [value]);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const handleSend = () => {
    if (isListening) stopListening();
    const text = value.trim();
    if (!text || disabled || isStreaming) return;
    onSend(text);
    setValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop?.();
      } else {
        handleSend();
      }
    }
  };

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-chat-input border border-vinmec-border",
        "bg-vinmec-bg shadow-chat-input px-4 py-2.5",
        "focus-within:border-vinmec-primary transition-colors",
        isListening && "border-red-400",
        disabled && "opacity-60"
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isStreaming}
        placeholder={
          isListening
            ? "Đang nghe..."
            : isStreaming
            ? "Đang trả lời..."
            : placeholder
        }
        aria-label="Nhập tin nhắn"
        className={cn(
          "flex-1 bg-transparent text-vinmec-text text-sm outline-none",
          "placeholder:text-vinmec-text-subtle",
          "disabled:cursor-not-allowed"
        )}
      />

      {voiceSupported && !isStreaming && (
        <button
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={isListening ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
          title={isListening ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full shrink-0",
            "transition-all duration-200",
            isListening
              ? "bg-red-500 text-white animate-pulse hover:bg-red-600 active:scale-95"
              : "text-vinmec-text-subtle hover:text-vinmec-primary hover:bg-vinmec-primary/10 active:scale-95"
          )}
        >
          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
      )}

      {isStreaming ? (
        <button
          onClick={onStop}
          aria-label="Dừng phản hồi"
          className="w-8 h-8 flex items-center justify-center rounded-full shrink-0
                     bg-vinmec-text text-white hover:bg-vinmec-text/80 active:scale-95
                     transition-all duration-200"
        >
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Gửi tin nhắn"
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full shrink-0",
            "transition-all duration-200",
            canSend
              ? "bg-vinmec-primary text-white hover:bg-vinmec-primary-dark active:scale-95"
              : "text-vinmec-text-subtle"
          )}
        >
          <Send size={15} />
        </button>
      )}
    </div>
  );
}
