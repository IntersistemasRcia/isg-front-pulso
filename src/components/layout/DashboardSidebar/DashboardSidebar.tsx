"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
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
  const [historyOpen, setHistoryOpen] = useState(pathname === "/dashboard");

  function handleLogout() {
    logout();
    window.location.assign("/login");
  }

  function openChat() {
    if (pathname !== "/dashboard") router.push("/dashboard");
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Image
          src="/logos/pulso-icon.svg"
          alt=""
          width={40}
          height={40}
          priority
          unoptimized
          className={styles.brandLogo}
        />
        <span className={styles.brandTitle}>ISG Pulso</span>
      </div>

      <div className={styles.menu}>
        <nav className={styles.nav} aria-label="Chat">
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

          <button
            type="button"
            className={styles.navItem}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <span>Historial</span>
            <span className={historyOpen ? styles.chevronOpen : styles.chevron} aria-hidden>
              ▾
            </span>
          </button>

          {historyOpen ? (
            <div className={styles.history}>
              <div className={styles.historyHeader}>
                <button
                  type="button"
                  className={styles.historyNewBtn}
                  onClick={() => {
                    startNewConversation();
                    openChat();
                  }}
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
                    const isActive = c.id === activeId && pathname === "/dashboard";
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
                            openChat();
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
          ) : null}

          <Link
            href="/dashboard/settings/ia"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/settings/ia") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            Configuración IA
          </Link>
        </nav>

        <div className={styles.segmentLine} />

        <nav className={styles.nav} aria-label="Módulos">
          <Link
            href="/dashboard/comercial"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/comercial") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            Comercial
          </Link>
          <Link
            href="/dashboard/crm"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/crm") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            CRM
          </Link>
        </nav>
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
