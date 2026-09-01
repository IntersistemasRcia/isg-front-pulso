"use client";

import { DashboardSidebar } from "@/components/layout/DashboardSidebar/DashboardSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader/DashboardHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import styles from "./dashboard.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className={styles.loading}>Cargando sesión…</div>;
  }

  return (
    <div className={styles.shell}>
      <DashboardSidebar />
      <div className={styles.mainColumn}>
        <DashboardHeader title={user?.companyName || "Dashboard"} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
