"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MyButtons } from "@/utils/MyButtons";
import { useAuth } from "@/components/providers/AuthProvider";
import { useConversation } from "@/components/providers/ConversationProvider";
import styles from "./DashboardSidebar.module.css";

function formatHistoryDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const {
    conversations,
    activeId,
    loadingList,
    historyAvailable,
    selectConversation,
    startNewConversation,
    deleteConversation,
  } = useConversation();

  function handleLogout() {
    logout();
    window.location.assign("/login");
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
        <Link
          href="/dashboard/settings/ia"
          className={[
            styles.navItem,
            pathname.startsWith("/dashboard/settings/ia")
              ? styles.navItemActive
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Configuración IA
        </Link>
      </nav>

      <div className={styles.history}>
        <div className={styles.historyHeader}>
          <div className={styles.historyTitle}>Historial</div>
          <button
            type="button"
            className={styles.historyNewBtn}
            onClick={startNewConversation}
            title="Nueva conversación"
          >
            Nueva
          </button>
        </div>

        {!historyAvailable ? (
          <p className={styles.historyEmpty}>
            Historial no disponible (API Auth no configurada).
          </p>
        ) : loadingList && conversations.length === 0 ? (
          <p className={styles.historyEmpty}>Cargando…</p>
        ) : conversations.length === 0 ? (
          <p className={styles.historyEmpty}>
            Todavía no hay conversaciones guardadas.
          </p>
        ) : (
          <ul className={styles.historyList}>
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id} className={styles.historyItem}>
                  <button
                    type="button"
                    className={[
                      styles.historyItemBtn,
                      isActive ? styles.historyItemActive : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      void selectConversation(c.id);
                    }}
                    title={c.titulo}
                  >
                    <span className={styles.historyItemTitle}>{c.titulo}</span>
                    <span className={styles.historyItemDate}>
                      {formatHistoryDate(c.lastModifiedDate ?? c.createdDate)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.historyDeleteBtn}
                    aria-label={`Eliminar ${c.titulo}`}
                    title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteConversation(c.id).catch(() => {
                        /* ya logueado en provider */
                      });
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
