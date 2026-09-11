"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { authFetch, getStoredToken } from "@/utils/api";
import styles from "@/components/chat/ExcelDownload/ExcelDownload.module.css";

export type ExcelExportButtonProps = {
  exportId: string;
  totalRows?: number;
  title?: string;
};

/**
 * Descarga Excel generado en servidor (listados grandes).
 * Usa Authorization Bearer (un <a href> no enviaría el JWT).
 */
export function ExcelExportButton({
  exportId,
  totalRows,
  title,
}: ExcelExportButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    const token = getStoredToken();
    if (!token) {
      setError("Sesión expirada. Volvé a iniciar sesión.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/pulso/export/${encodeURIComponent(exportId)}`, {
        token,
        authRetries: 1,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message || "No se pudo descargar el Excel.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "listado-pulso.xls";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar el Excel. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.label}>
        {title
          ? `Listado completo${totalRows != null ? ` (${totalRows} registros)` : ""}: ${title}`
          : totalRows != null
            ? `Listado completo (${totalRows} registros) listo para descargar`
            : "Listado completo listo para descargar"}
      </p>
      <Button
        type="button"
        color="primary"
        variant="contained"
        size="small"
        disabled={busy}
        onClick={() => {
          void handleDownload();
        }}
      >
        {busy ? "Preparando…" : "Descargar Excel"}
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
