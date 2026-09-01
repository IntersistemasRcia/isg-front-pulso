import type { RefObject } from "react";
import type { UIMessage } from "ai";
import { MessageBubble } from "@/components/chat/MessageBubble/MessageBubble";
import styles from "./MessageList.module.css";

export type MessageListProps = {
  messages: UIMessage[];
  bottomRef?: RefObject<HTMLDivElement | null>;
  streamingMessageId?: string | null;
};

export function MessageList({ messages, bottomRef, streamingMessageId }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={styles.messages}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>¿En qué te ayudo?</div>
          <p>
            Consultá ventas, stock, clientes o KPIs. El asistente consultará la
            base SQL del cliente mediante el agente local.
          </p>
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
