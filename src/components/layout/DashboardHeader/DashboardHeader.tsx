import { PulsoStatusIndicator } from "@/components/layout/PulsoStatusIndicator/PulsoStatusIndicator";
import styles from "./DashboardHeader.module.css";

export type DashboardHeaderProps = {
  title: string;
};

export function DashboardHeader({ title }: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.headerTitle}>{title}</h1>
      <div className={styles.statusGroup}>
        <div className={styles.status} title="Sesión activa en Pulso">
          <span className={styles.statusDotSession} aria-hidden />
          Sesión activa
        </div>
        <PulsoStatusIndicator />
      </div>
    </header>
  );
}
