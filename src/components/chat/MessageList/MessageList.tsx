import type { RefObject } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "@/components/chat/MessageBubble/MessageBubble";
import styles from "./MessageList.module.css";

export type MessageListProps = {
  messages: UIMessage[];
  bottomRef?: RefObject<HTMLDivElement | null>;
  streamingMessageId?: string | null;
  /** Abre el popup de preguntas sugeridas (empty state). */
  onOpenFaq?: () => void;
};

export function MessageList({
  messages,
  bottomRef,
  streamingMessageId,
  onOpenFaq,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={styles.messages}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>¿En qué te ayudo?</div>
          <p>
            Consultá ventas, stock, clientes o KPIs. El asistente consultará la
            base SQL del cliente mediante el agente local.
          </p>
          {onOpenFaq ? (
            <button
              type="button"
              className={styles.faqCta}
              onClick={onOpenFaq}
            >
              ¿Qué puedo preguntar?
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messages}>
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id === streamingMessageId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
