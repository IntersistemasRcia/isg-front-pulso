import styles from "./TypingIndicator.module.css";

export type TypingIndicatorProps = {
  label: string;
};

export function TypingIndicator({ label }: TypingIndicatorProps) {
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
