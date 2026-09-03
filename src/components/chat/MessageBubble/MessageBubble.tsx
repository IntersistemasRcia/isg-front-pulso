"use client";

import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { AssistantRichBody } from "@/components/chat/MessageBubble/AssistantRichBody";
import { translateErrorMessage } from "@/utils/userFacingErrors";
import styles from "./MessageBubble.module.css";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function getToolStatus(message: UIMessage): {
  label: string;
  tone: "info" | "error" | "success";
} | null {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;

    if (part.state === "input-streaming" || part.state === "input-available") {
      return { label: "Consultando datos del ERP…", tone: "info" };
    }

    if (part.state === "output-error") {
      const friendly = translateErrorMessage(
        part.errorText || "Error al consultar el ERP",
        "pulso",
      );
      return { label: friendly.message, tone: "error" };
    }

    if (part.state === "output-available" && part.output && typeof part.output === "object") {
      const out = part.output as { ok?: boolean; message?: string };
      if (out.ok === false && out.message) {
        return {
          label: translateErrorMessage(out.message, "pulso").message,
          tone: "error",
        };
      }
    }
  }

  return null;
}

function getFallbackAssistantText(message: UIMessage): string | null {
  const text = getMessageText(message);
  if (text) return null;

  const toolStatus = getToolStatus(message);
  if (toolStatus?.tone === "error") {
    return toolStatus.label;
  }

  if (toolStatus?.tone === "info") {
    return null;
  }

  return translateErrorMessage(
    "No se generó respuesta del modelo IA",
    "llm",
  ).message;
}

export type MessageBubbleProps = {
  message: UIMessage;
  isStreaming?: boolean;
};

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const text = getMessageText(message);
  const toolStatus = getToolStatus(message);
  const fallbackText = getFallbackAssistantText(message);
  const isUser = message.role === "user";
  const displayText =
    text || (isStreaming && toolStatus?.tone === "info" ? null : fallbackText);

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
          <>
            {toolStatus && !text ? (
              <div
                className={
                  toolStatus.tone === "error"
                    ? styles.toolStatusError
                    : styles.toolStatusInfo
                }
              >
                {toolStatus.label}
              </div>
            ) : null}
            {displayText ? (
              <AssistantRichBody text={displayText} />
            ) : isStreaming ? (
              <span className={styles.pending}>Procesando…</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
