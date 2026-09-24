"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { MessageList } from "@/components/chat/MessageList/MessageList";
import { ChatInput } from "@/components/chat/ChatInput/ChatInput";
import { TypingIndicator } from "@/components/chat/TypingIndicator/TypingIndicator";
import { ModelSelector } from "@/components/chat/ModelSelector/ModelSelector";
import { ChatFaqModal } from "@/components/chat/ChatFaqModal/ChatFaqModal";
import { useConversation } from "@/components/providers/ConversationProvider";
import { DEFAULT_MODEL_ID, MODEL_STORAGE_KEY, normalizeModelId } from "@/lib/llm/registry";
import {
  parsePulsoChatDebugHeaders,
  type PulsoChatDebugInfo,
} from "@/lib/chat/parsePulsoChatHeaders";
import { extractToolExecutionsFromParts } from "@/lib/chat/extractToolExecutions";
import { stripToolRowsForTransport } from "@/lib/chat/stripToolRowsForTransport";
import {
  appendMessages,
  createConversation,
  extractTextFromUiMessage,
  titleFromUserText,
  uiMessageToPartsJson,
} from "@/lib/chat/conversationApi";
import { syncSpArquitecturaFromApi } from "@/lib/pulso/arquitecturaStorage";
import { useAuth } from "@/components/providers/AuthProvider";
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
 * Panel de chat: useChat + selector de modelo + persistencia historial Auth.
 */
export function ChatPanel() {
  const { token: authToken, sessionReady } = useAuth();
  const {
    activeId,
    setActiveId,
    pendingMessages,
    clearPendingMessages,
    notifyConversationUpdated,
    historyAvailable,
    loadingActive,
    selectConversation,
  } = useConversation();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PulsoChatDebugInfo | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const debugInfoRef = useRef<(info: PulsoChatDebugInfo | null) => void>(() => {});

  const activeIdRef = useRef<string | null>(activeId);
  const persistedCountRef = useRef(0);
  const nextOrdenRef = useRef(1);
  const persistingRef = useRef(false);
  const lastStatusRef = useRef<string>("ready");
  const effectiveModelIdRef = useRef(modelId);

  useEffect(() => {
    setModelId(readStoredModelId());
    setDebugEnabled(readDebugEnabled());
  }, []);

  useEffect(() => {
    debugInfoRef.current = setDebugInfo;
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    effectiveModelIdRef.current = modelId;
  }, [modelId]);

  /** Cache local de GET /SPs_arquitectura (nombres y tipos de parámetro por SP). */
  useEffect(() => {
    if (!sessionReady) return;
    const token = authToken ?? getStoredToken();
    if (!token) return;
    void syncSpArquitecturaFromApi(token).catch(() => {
      // El chat sigue funcionando: el servidor refresca el catálogo en POST /api/chat.
    });
  }, [authToken, sessionReady]);

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
          const token = authToken ?? getStoredToken();
          if (!token) return {};
          return {
            Authorization: `Bearer ${token}`,
            "x-pulso-token": token,
          };
        },
        body: { modelId },
        prepareSendMessagesRequest: ({ messages, body, headers, credentials, api }) => ({
          api,
          headers,
          credentials,
          body: {
            ...(body ?? {}),
            messages: stripToolRowsForTransport(messages),
          },
        }),
        fetch: async (input, init) => {
          const token = authToken ?? getStoredToken();
          const headers = new Headers(init?.headers);
          if (token) {
            if (!headers.has("Authorization")) {
              headers.set("Authorization", `Bearer ${token}`);
            }
            if (!headers.has("x-pulso-token")) {
              headers.set("x-pulso-token", token);
            }
          }
          const response = await fetch(input, {
            ...init,
            headers,
            credentials: "same-origin",
          });
          const info = parsePulsoChatDebugHeaders(response.headers);
          if (info) {
            if (readDebugEnabled()) debugInfoRef.current(info);
            if (info.modelId) {
              effectiveModelIdRef.current = normalizeModelId(info.modelId);
            }
          } else {
            const mid = response.headers.get("X-Pulso-Model-Id");
            if (mid?.trim()) {
              effectiveModelIdRef.current = normalizeModelId(mid.trim());
            }
          }
          return response;
        },
      }),
    [modelId, authToken],
  );

  const { messages, setMessages, sendMessage, status, error, clearError } =
    useChat({
      transport,
      onError: (err) => {
        console.error("[ChatPanel]", err);
      },
    });

  /** Aplicar conversación cargada desde el sidebar. */
  useEffect(() => {
    if (pendingMessages == null) return;
    setMessages(pendingMessages);
    persistedCountRef.current = pendingMessages.length;
    nextOrdenRef.current = pendingMessages.length + 1;
    clearPendingMessages();
  }, [pendingMessages, setMessages, clearPendingMessages]);

  /** Si volvemos al chat con una conversación activa, recargar desde Auth. */
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (activeId && messages.length === 0 && pendingMessages == null) {
      void selectConversation(activeId);
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = status === "submitted" || status === "streaming";

  const streamingMessageId =
    isBusy && messages.length > 0 && messages[messages.length - 1]?.role === "assistant"
      ? messages[messages.length - 1].id
      : null;

  const toolExecutions = useMemo(() => {
    if (!debugEnabled) return [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      return extractToolExecutionsFromParts(msg.parts);
    }
    return [];
  }, [debugEnabled, messages]);

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

  /** Persistir el último turno user+assistant cuando el stream termina. */
  useEffect(() => {
    const prev = lastStatusRef.current;
    lastStatusRef.current = status;

    const finishedTurn =
      (prev === "streaming" || prev === "submitted") && status === "ready";
    if (!finishedTurn || !historyAvailable) return;
    if (persistingRef.current) return;

    const token = authToken ?? getStoredToken();
    if (!token) return;

    const toPersist = messages.slice(persistedCountRef.current);
    if (toPersist.length === 0) return;

    const last = toPersist[toPersist.length - 1];
    if (last?.role !== "assistant") return;

    void (async () => {
      persistingRef.current = true;
      try {
        let convId = activeIdRef.current;
        if (!convId) {
          const firstUser = toPersist.find((m) => m.role === "user");
          const title = titleFromUserText(
            firstUser ? extractTextFromUiMessage(firstUser) : "Nueva consulta",
          );
          convId = await createConversation(title, token);
          activeIdRef.current = convId;
          setActiveId(convId);
        }

        const modelForAssistant =
          effectiveModelIdRef.current || modelId || DEFAULT_MODEL_ID;

        let orden = nextOrdenRef.current;
        const payload = toPersist.map((msg: UIMessage) => {
          const role = msg.role === "user" ? "user" : "assistant";
          const item = {
            role: role as "user" | "assistant",
            partsJson: uiMessageToPartsJson(msg),
            modelId: role === "assistant" ? modelForAssistant : null,
            orden,
          };
          orden += 1;
          return item;
        });

        await appendMessages(convId, payload, token);
        nextOrdenRef.current = orden;
        persistedCountRef.current = messages.length;
        notifyConversationUpdated();
      } catch (err) {
        console.warn("[ChatPanel] persist failed", err);
      } finally {
        persistingRef.current = false;
      }
    })();
  }, [
    status,
    messages,
    historyAvailable,
    authToken,
    modelId,
    setActiveId,
    notifyConversationUpdated,
  ]);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  async function handleFaqSelect(question: string) {
    const text = question.trim();
    if (!text || isBusy) return;
    setFaqOpen(false);
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  const showDebug = debugEnabled && (debugInfo || toolExecutions.length > 0);

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.helpBtn}
          onClick={() => setFaqOpen(true)}
          disabled={isBusy}
        >
          Ayuda
        </button>
        <ModelSelector
          value={modelId}
          onChange={handleModelChange}
          disabled={isBusy}
        />
      </header>

      {loadingActive ? (
        <p className={styles.loadingHistory}>Cargando conversación…</p>
      ) : null}

      {showDebug ? (
        <details className={styles.debugPanel} open>
          <summary className={styles.debugSummary}>
            Debug Pulso
            {debugInfo?.promptMode ? ` · ${debugInfo.promptMode}` : ""}
            {debugInfo?.spTopK ? ` · topK=${debugInfo.spTopK}` : ""}
          </summary>
          {debugInfo ? (
            <>
              <p className={styles.debugMeta}>
                {debugInfo.modelId ? `model=${debugInfo.modelId}` : null}
                {debugInfo.modelSource ? ` · source=${debugInfo.modelSource}` : null}
                {debugInfo.catalogInPrompt != null
                  ? ` · catalogInPrompt=${String(debugInfo.catalogInPrompt)}`
                  : null}
              </p>
              <p className={styles.debugSectionTitle}>SPs candidatos (ranking)</p>
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
            </>
          ) : null}

          {toolExecutions.length > 0 ? (
            <>
              <p className={styles.debugSectionTitle}>SP ejecutado / intentado</p>
              <ol className={styles.debugList}>
                {toolExecutions.map((exec, idx) => (
                  <li key={`${exec.nombreSp}-${idx}`}>
                    <code>{exec.nombreSp}</code>
                    {exec.ok === true ? (
                      <span className={styles.debugOk}> — ok</span>
                    ) : null}
                    {exec.ok === false ? (
                      <span className={styles.debugFail}>
                        {" "}
                        — fail
                        {exec.code ? ` (${exec.code})` : ""}
                        {exec.missingRequired?.length
                          ? ` missing=${exec.missingRequired.join(",")}`
                          : ""}
                        {exec.message ? ` · ${exec.message}` : ""}
                      </span>
                    ) : null}
                    {exec.ok == null ? (
                      <span className={styles.debugDesc}> — {exec.state}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </details>
      ) : null}

      <MessageList
        messages={messages}
        bottomRef={bottomRef}
        streamingMessageId={streamingMessageId}
        onOpenFaq={() => setFaqOpen(true)}
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
        disabled={isBusy || loadingActive}
        onChange={setInput}
        onSubmit={() => {
          void handleSubmit();
        }}
      />

      <ChatFaqModal
        open={faqOpen}
        onClose={() => setFaqOpen(false)}
        onSelect={(q) => {
          void handleFaqSelect(q);
        }}
        disabled={isBusy}
      />
    </div>
  );
}
