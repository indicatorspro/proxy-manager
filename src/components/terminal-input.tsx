import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type ManagedBackend } from "@/lib/api";
import { isProcessAlive } from "./proxy-card";
import { Send, Loader2 } from "lucide-react";

interface TerminalInputProps {
  selected: ManagedBackend | null;
  onSend: (input: string) => void;
  disabled?: boolean;
}

export function TerminalInput({ selected, onSend, disabled }: TerminalInputProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (text?: string) => {
    if (sending) return;
    const value = text !== undefined ? text : input;
    setSending(true);
    try {
      onSend(value);
      setInput("");
    } finally {
      setTimeout(() => setSending(false), 300);
    }
  };

  const isDisabled = !selected || !isProcessAlive(selected) || disabled || sending;

  return (
    <div className="flex gap-2">
      <Input
        value={input}
        disabled={isDisabled}
        placeholder="Send text or press Enter for empty line"
        className="font-mono text-xs"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend(input);
          }
        }}
      />
      <Button
        disabled={isDisabled}
        onClick={() => void handleSend(input)}
      >
        {sending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="mr-1.5 h-3.5 w-3.5" />
        )}
        {sending ? "Sending..." : "Send"}
      </Button>
    </div>
  );
}
