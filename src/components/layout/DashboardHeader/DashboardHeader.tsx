import styles from "./DashboardHeader.module.css";

export type DashboardHeaderProps = {
  title: string;
};

export function DashboardHeader({ title }: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.headerTitle}>{title}</h1>
      <div className={styles.status}>
        <span className={styles.statusDot} aria-hidden />
        Conectado
      </div>
    </header>
  );
}
