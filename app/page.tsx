"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/utils/AuthProvider";
import styles from "./page.module.css";

/**
 * Raíz: redirige a /dashboard si hay sesión, o a /login.
 */
export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [isAuthenticated, isLoading, router]);

  return <div className={styles.loading}>Cargando…</div>;
}
