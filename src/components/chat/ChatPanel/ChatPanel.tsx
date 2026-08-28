"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "@/components/chat/MessageList/MessageList";
import { ChatInput } from "@/components/chat/ChatInput/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator/TypingIndicator";
import { ModelSelector } from "@/components/chat/ModelSelector/ModelSelector";
import { DEFAULT_MODEL_ID, MODEL_STORAGE_KEY } from "@/lib/llm/registry";
import { getStoredToken } from "@/utils/api";
import styles from "./ChatPanel.module.css";

function readStoredModelId(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

/**
 * Panel de chat: useChat + selector de modelo multi-LLM.
 */
export function ChatPanel() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);

  useEffect(() => {
    setModelId(readStoredModelId());
  }, []);

  function handleModelChange(nextId: string) {
    setModelId(nextId);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, nextId);
    } catch {
      // ignore quota errors
    }
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: (): Record<string, string> => {
          const token = getStoredToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: { modelId },
      }),
    [modelId],
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
      <header className={styles.header}>
        <ModelSelector
          value={modelId}
          onChange={handleModelChange}
          disabled={isBusy}
        />
      </header>

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