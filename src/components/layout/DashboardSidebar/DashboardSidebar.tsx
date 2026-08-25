"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MyButtons } from "@/utils/MyButtons";
import { useAuth } from "@/components/providers/AuthProvider";
import styles from "./DashboardSidebar.module.css";

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandLogoBlock}>
          <Image
            src="/logos/InterSistemas.png"
            alt="InterSistemas"
            width={280}
            height={68}
            className={styles.brandLogo}
            priority
          />
        </div>
        <span className={styles.brandTitle}>Pulso</span>
      </div>

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
            <div className={styles.userMeta}>{user?.companyName}</div>
          </div>
        <MyButtons
          color="primary"
          size="small"
          fullWidth
          className={styles.logout}
          onClick={handleLogout}
        >
          Cerrar sesión
        </MyButtons>
      </div>
    </aside>
  );
}
