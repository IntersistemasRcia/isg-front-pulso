"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { authFetch } from "@/utils/api";
import styles from "./PulsoStatusIndicator.module.css";

type PulsoStatusPayload = {
  status: "ok" | "error";
  spCount?: number;
  title: string;
  message: string;
  code?: string;
  httpStatus?: number;
};

const POLL_MS = 60_000;

/**
 * Indicador de conectividad con isg-api-pulso (ERP).
 * Espera token de AuthProvider antes de consultar (evita 401 post-login).
 */
export function PulsoStatusIndicator() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<PulsoStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sessionToken: string) => {
    setLoading(true);
    try {
      const res = await authFetch("/api/pulso/status", {
        token: sessionToken,
        authRetries: 2,
      });
      const json = (await res.json()) as PulsoStatusPayload;
      setData(json);
    } catch {
      setData({
        status: "error",
        title: "ERP no disponible",
        message: "No se pudo verificar la conexión con el servidor de datos.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !token) {
      setLoading(false);
      setData({
        status: "error",
        title: "Sin sesión",
        message: "Iniciá sesión para conectar el ERP.",
      });
      return;
    }

    void load(token);
    const id = window.setInterval(() => void load(token), POLL_MS);
    return () => window.clearInterval(id);
  }, [authLoading, isAuthenticated, token, load]);

  const isOk = data?.status === "ok";
  const label = loading || authLoading
    ? "Verificando ERP…"
    : data?.title ?? "ERP desconocido";
  const detail = data?.message ?? "Comprobando isg-api-pulso…";

  return (
    <button
      type="button"
      className={styles.wrap}
      onClick={() => {
        if (token) void load(token);
      }}
      title={detail}
      aria-label={`Estado ERP: ${label}. ${detail}`}
    >
      <span
        className={[
          styles.dot,
          loading || authLoading
            ? styles.dotLoading
            : isOk
              ? styles.dotOk
              : styles.dotError,
        ].join(" ")}
        aria-hidden
      />
      <span className={styles.label}>{label}</span>
      {isOk && data?.spCount != null ? (
        <span className={styles.meta}>{data.spCount} SPs</span>
      ) : null}
    </button>
  );
}
