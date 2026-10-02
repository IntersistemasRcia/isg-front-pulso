"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar/DashboardSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader/DashboardHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { ConversationProvider } from "@/components/providers/ConversationProvider";
import styles from "./dashboard.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading, sessionReady } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !token || !sessionReady) {
    return <div className={styles.loading}>Cargando sesión…</div>;
  }

  return (
    <ConversationProvider>
      <div className={styles.shell}>
        <DashboardSidebar />
        <div className={styles.mainColumn}>
          <DashboardHeader title={user?.companyName || "Dashboard"} />
          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </ConversationProvider>
  );
}
