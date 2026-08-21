"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/utils/ui";
import { useAuth } from "@/utils/AuthProvider";
import styles from "./dashboard.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (isLoading) {
    return <div className={styles.content}>Cargando sesión…</div>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Pulso</div>

        <nav className={styles.nav} aria-label="Principal">
          <Link
            href="/dashboard"
            className={[
              styles.navItem,
              pathname === "/dashboard" ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            Chat
          </Link>
        </nav>

        <div className={styles.history}>
          <div className={styles.historyTitle}>Historial</div>
          <p className={styles.historyEmpty}>
            Las conversaciones se mantienen en esta sesión.
          </p>
        </div>

        <div className={styles.userBlock}>
          <div>
            <div className={styles.userName}>{user?.displayName ?? "Usuario"}</div>
            <div className={styles.userMeta}>{user?.username}</div>
          </div>
          <Button
            variant="outlined"
            size="small"
            className={styles.logout}
            onClick={handleLogout}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>
            {user?.companyName || "Dashboard"}
          </h1>
          <div className={styles.status}>
            <span className={styles.statusDot} aria-hidden />
            Conectado
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
