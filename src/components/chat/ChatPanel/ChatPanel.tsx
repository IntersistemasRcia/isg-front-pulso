"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { MessageList } from "@/components/chat/MessageList/MessageList";
import { ChatInput } from "@/components/chat/ChatInput/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator/TypingIndicator";
import { ModelSelector } from "@/components/chat/ModelSelector/ModelSelector";
import { DEFAULT_MODEL_ID, MODEL_STORAGE_KEY, normalizeModelId } from "@/lib/llm/registry";
import {
  parsePulsoChatDebugHeaders,
  type PulsoChatDebugInfo,
} from "@/lib/chat/parsePulsoChatHeaders";
import { syncSpArquitecturaFromApi } from "@/lib/pulso/arquitecturaStorage";
import { getStoredToken } from "@/utils/api";
import { toUserMessage } from "@/utils/userFacingErrors";
import styles from "./ChatPanel.module.css";

function readStoredModelId(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    return normalizeModelId(stored ?? DEFAULT_MODEL_ID);
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

function readDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Panel de chat: useChat + selector de modelo multi-LLM.
 */
export function ChatPanel() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PulsoChatDebugInfo | null>(null);
  const debugInfoRef = useRef<(info: PulsoChatDebugInfo | null) => void>(() => {});

  useEffect(() => {
    setModelId(readStoredModelId());
    setDebugEnabled(readDebugEnabled());
  }, []);

  useEffect(() => {
    debugInfoRef.current = setDebugInfo;
  }, []);

  /** Cache local de GET /SPs_arquitectura (nombres y tipos de parámetro por SP). */
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    void syncSpArquitecturaFromApi(token).catch(() => {
      // El chat sigue funcionando: el servidor refresca el catálogo en POST /api/chat.
    });
  }, []);

  function handleModelChange(nextId: string) {
    const normalized = normalizeModelId(nextId);
    setModelId(normalized);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, normalized);
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
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (readDebugEnabled()) {
            const info = parsePulsoChatDebugHeaders(response.headers);
            if (info) debugInfoRef.current(info);
          }
          return response;
        },
      }),
    [modelId],
  );

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport,
    onError: (err) => {
      console.error("[ChatPanel]", err);
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  const streamingMessageId =
    isBusy && messages.length > 0 && messages[messages.length - 1]?.role === "assistant"
      ? messages[messages.length - 1].id
      : null;

  function getBusyLabel(): string {
    if (status === "submitted") return "Iniciando consulta…";
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      for (const part of last.parts) {
        if (
          isToolUIPart(part) &&
          (part.state === "input-streaming" || part.state === "input-available")
        ) {
          return "Consultando ERP (isg-api-pulso)…";
        }
      }
    }
    return "Pensando…";
  }

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

      {debugEnabled && debugInfo ? (
        <details className={styles.debugPanel}>
          <summary className={styles.debugSummary}>
            SPs candidatos (debug)
            {debugInfo.promptMode ? ` · ${debugInfo.promptMode}` : ""}
            {debugInfo.spTopK ? ` · topK=${debugInfo.spTopK}` : ""}
          </summary>
          <p className={styles.debugMeta}>
            {debugInfo.modelId ? `model=${debugInfo.modelId}` : null}
            {debugInfo.modelSource ? ` · source=${debugInfo.modelSource}` : null}
            {debugInfo.catalogInPrompt != null
              ? ` · catalogInPrompt=${String(debugInfo.catalogInPrompt)}`
              : null}
          </p>
          <ol className={styles.debugList}>
            {debugInfo.candidates.map((c) => (
              <li key={c.nombre}>
                <code>{c.nombre}</code>
                {c.descripcion ? (
                  <span className={styles.debugDesc}> — {c.descripcion}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      <MessageList
        messages={messages}
        bottomRef={bottomRef}
        streamingMessageId={streamingMessageId}
      />

      {isBusy ? <TypingIndicator label={getBusyLabel()} /> : null}

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <strong className={styles.errorTitle}>No pudimos procesar tu consulta</strong>
          <span>{toUserMessage(error, "chat")}</span>
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
