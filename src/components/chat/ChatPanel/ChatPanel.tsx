"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "@/components/chat/MessageList/MessageList";
import { ChatInput } from "@/components/chat/ChatInput/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator/TypingIndicator";
import { getStoredToken } from "@/utils/api";
import styles from "./ChatPanel.module.css";

/**
 * Panel de chat: cablea useChat + lista/input/indicadores.
 * Las páginas solo montan este componente.
 */
export function ChatPanel() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: (): Record<string, string> => {
          const token = getStoredToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className={styles.chat}>
      <MessageList messages={messages} bottomRef={bottomRef} />

      {isBusy ? (
        <TypingIndicator
          label={
            status === "submitted"
              ? "Consultando base de datos…"
              : "Pensando…"
          }
        />
      ) : null}

      {error ? (
        <div className={styles.errorBanner}>
          {error.message || "Error al procesar el mensaje"}
        </div>
      ) : null}

      <ChatInput
        value={input}
        disabled={isBusy}
        onChange={setInput}
        onSubmit={() => {
          void handleSubmit();
        }}
      />
    </div>
  );
}
