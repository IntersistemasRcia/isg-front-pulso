"use client";

import { ChatPanel } from "@/components/chat/ChatPanel/ChatPanel";
import styles from "./page.module.css";

/** Dashboard chat: solo composición. */
export default function DashboardPage() {
  return (
    <div className={styles.page}>
      <ChatPanel />
    </div>
  );
}
