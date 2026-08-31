"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { MyButtons } from "@/utils/MyButtons";
import styles from "./ChatInput.module.css";

export type ChatInputProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatInput({ value, disabled, onChange, onSubmit }: ChatInputProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  function autoResize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        value={value}
        placeholder="Escribí tu consulta…"
        rows={1}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          autoResize(e.target);
        }}
        onKeyDown={handleKeyDown}
      />
      <MyButtons
        type="submit"
        color="primary"
        size="medium"
        className={styles.send}
        disabled={disabled || !value.trim()}
      >
        Enviar
      </MyButtons>
    </form>
  );
}
