"use client";

import { Modal } from "@/components/ui";
import { CHAT_FAQ_SUGGESTIONS } from "@/lib/chat/faqSuggestions";
import styles from "./ChatFaqModal.module.css";

export type ChatFaqModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (question: string) => void;
  disabled?: boolean;
};

/**
 * Popup de preguntas frecuentes: al elegir una se envía al chat.
 */
export function ChatFaqModal({
  open,
  onClose,
  onSelect,
  disabled = false,
}: ChatFaqModalProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={520} aria-labelledby="pulso-faq-title">
      <div className={styles.content}>
        <header className={styles.header}>
          <h2 id="pulso-faq-title" className={styles.title}>
            ¿Qué puedo preguntar?
          </h2>
          <p className={styles.lead}>
            Elegí una pregunta de ejemplo. Se envía al asistente y consulta los
            datos de tu ERP según lo que pidas.
          </p>
        </header>

        <ul className={styles.list}>
          {CHAT_FAQ_SUGGESTIONS.map((question) => (
            <li key={question}>
              <button
                type="button"
                className={styles.item}
                disabled={disabled}
                onClick={() => onSelect(question)}
              >
                {question}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
