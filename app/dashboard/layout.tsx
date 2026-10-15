"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar/DashboardSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader/DashboardHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { ConversationProvider } from "@/components/providers/ConversationProvider";
import styles from "./dashboard.module.css";

function moduleTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/comercial")) return "Dashboard Comercial";
  if (pathname.startsWith("/dashboard/crm")) return "Resumen CRM Comercial";
  if (pathname.startsWith("/dashboard/settings/ia")) return "Configuración IA";
  return "Chat";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isAuthenticated, isLoading, sessionReady } = useAuth();

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
          <DashboardHeader title={moduleTitle(pathname)} />
          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </ConversationProvider>
  );
}
