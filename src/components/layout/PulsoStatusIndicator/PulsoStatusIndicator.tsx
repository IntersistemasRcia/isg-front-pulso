"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredToken } from "@/utils/api";
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
 * Muestra estado simple y tooltip con detalle traducido.
 */
export function PulsoStatusIndicator() {
  const [data, setData] = useState<PulsoStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const res = await fetch("/api/pulso/status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
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
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const isOk = data?.status === "ok";
  const label = loading
    ? "Verificando ERP…"
    : data?.title ?? "ERP desconocido";
  const detail = data?.message ?? "Comprobando isg-api-pulso…";

  return (
    <button
      type="button"
      className={styles.wrap}
      onClick={() => void load()}
      title={detail}
      aria-label={`Estado ERP: ${label}. ${detail}`}
    >
      <span
        className={[
          styles.dot,
          loading ? styles.dotLoading : isOk ? styles.dotOk : styles.dotError,
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
