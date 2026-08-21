"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/utils/ui";
import { getStoredToken } from "@/utils/api";
import styles from "./chat.module.css";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = getMessageText(message);
  const isUser = message.role === "user";

  return (
    <div
      className={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ].join(" ")}
    >
      <div
        className={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ].join(" ")}
      >
        {isUser ? (
          text
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || "…"}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className={styles.typing} role="status" aria-live="polite">
      <span className={styles.typingDots} aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label}
    </div>
  );
}

export default function DashboardChatPage() {
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

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    setInput("");
    await sendMessage({ text });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function autoResize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  return (
    <div className={styles.chat}>
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>¿En qué te ayudo?</div>
            <p>
              Consultá ventas, stock, clientes o KPIs. El asistente consultará la
              base SQL del cliente mediante el agente local.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

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

      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          className={styles.textarea}
          value={input}
          placeholder="Escribí tu consulta…"
          rows={1}
          disabled={isBusy}
          onChange={(e) => {
            setInput(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          className={styles.send}
          disabled={isBusy || !input.trim()}
        >
          Enviar
        </Button>
      </form>
    </div>
  );
}
