"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import ChatBubbleOutline from "@mui/icons-material/ChatBubbleOutline";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import History from "@mui/icons-material/History";
import ShowChart from "@mui/icons-material/ShowChart";
import Tune from "@mui/icons-material/Tune";
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

function NavLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className={styles.navLabel}>
      <span className={styles.navIcon} aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </span>
  );
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
  const [historyOpen, setHistoryOpen] = useState(false);

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
        <nav className={styles.nav} aria-label="Dashboard">
          <p className={styles.groupLabel}>Dashboard</p>
          <Link
            href="/dashboard/comercial"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/comercial") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <NavLabel icon={<ShowChart fontSize="inherit" />}>Ventas</NavLabel>
          </Link>
          <Link
            href="/dashboard/finanzas"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/finanzas") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <NavLabel icon={<AccountBalanceOutlined fontSize="inherit" />}>Finanzas</NavLabel>
          </Link>
        </nav>

        <nav className={styles.nav} aria-label="CRM">
          <p className={styles.groupLabel}>CRM</p>
          <Link
            href="/dashboard/crm"
            className={[
              styles.navItem,
              pathname.startsWith("/dashboard/crm") ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <NavLabel icon={<HandshakeOutlined fontSize="inherit" />}>CRM</NavLabel>
          </Link>
        </nav>

        <nav className={styles.nav} aria-label="Chat">
          <p className={styles.groupLabel}>Chat</p>
          <Link
            href="/dashboard"
            className={[
              styles.navItem,
              pathname === "/dashboard" ? styles.navItemActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <NavLabel icon={<ChatBubbleOutline fontSize="inherit" />}>Chat</NavLabel>
          </Link>

          <button
            type="button"
            className={styles.navItem}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <NavLabel icon={<History fontSize="inherit" />}>Historial</NavLabel>
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
            <NavLabel icon={<Tune fontSize="inherit" />}>Configuración IA</NavLabel>
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
