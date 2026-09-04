"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { downloadExcelSpec } from "@/lib/chat/buildSpreadsheetXml";
import type { ExcelSpec } from "@/lib/chat/tabularSpec";
import styles from "./ExcelDownload.module.css";

export type ExcelDownloadProps = {
  spec: ExcelSpec;
};

export function ExcelDownload({ spec }: ExcelDownloadProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.wrap}>
      <p className={styles.label}>
        {spec.title ? `Planilla: ${spec.title}` : "Planilla lista para descargar"}
      </p>
      <Button
        type="button"
        color="primary"
        variant="contained"
        size="small"
        onClick={() => {
          try {
            setError(null);
            downloadExcelSpec(spec);
          } catch {
            setError("No se pudo generar el Excel. Intentá de nuevo.");
          }
        }}
      >
        Descargar Excel
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
