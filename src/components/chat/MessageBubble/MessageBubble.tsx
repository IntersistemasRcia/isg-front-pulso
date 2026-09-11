"use client";

import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { AssistantRichBody } from "@/components/chat/MessageBubble/AssistantRichBody";
import { DataTablePreview } from "@/components/chat/DataTablePreview/DataTablePreview";
import { ExcelExportButton } from "@/components/chat/ExcelExportButton/ExcelExportButton";
import { asObjectRows } from "@/lib/pulso/tablePreview";
import { translateErrorMessage } from "@/utils/userFacingErrors";
import styles from "./MessageBubble.module.css";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

type ExcelToolExport = {
  exportId: string;
  totalRows?: number;
  title?: string;
};

type TableToolPreview = {
  key: string;
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
  caption?: string;
};

function spTitle(nombreSp: unknown): string | undefined {
  if (typeof nombreSp !== "string") return undefined;
  return nombreSp.replace(/^sp_ISG_Vision_/i, "").replace(/_/g, " ");
}

function getExcelExportsFromTools(message: UIMessage): ExcelToolExport[] {
  const out: ExcelToolExport[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.state !== "output-available" || part.output == null) continue;
    if (typeof part.output !== "object") continue;
    const o = part.output as Record<string, unknown>;
    if (typeof o.exportId !== "string") continue;
    out.push({
      exportId: o.exportId,
      totalRows: typeof o.totalRows === "number" ? o.totalRows : undefined,
      title: spTitle(o.nombreSp),
    });
  }
  return out;
}

function getTablePreviewsFromTools(message: UIMessage): TableToolPreview[] {
  const out: TableToolPreview[] = [];
  let idx = 0;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.state !== "output-available" || part.output == null) continue;
    if (typeof part.output !== "object") continue;
    const o = part.output as Record<string, unknown>;
    if (o.ok === false) continue;

    const rawRows = Array.isArray(o.rows)
      ? o.rows
      : Array.isArray(o.previewRows)
        ? o.previewRows
        : null;
    if (!rawRows?.length) continue;

    const rows = asObjectRows(rawRows);
    if (!rows.length) continue;

    out.push({
      key: `tbl-${idx}-${typeof o.exportId === "string" ? o.exportId : idx}`,
      rows,
      totalRows: typeof o.totalRows === "number" ? o.totalRows : rows.length,
      caption: spTitle(o.nombreSp),
    });
    idx += 1;
  }
  return out;
}

function getToolStatus(message: UIMessage): {
  label: string;
  tone: "info" | "error" | "success";
} | null {
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;

    if (part.state === "input-streaming" || part.state === "input-available") {
      return { label: "Consultando datos del ERP…", tone: "info" };
    }

    if (part.state === "output-error") {
      const friendly = translateErrorMessage(
        part.errorText || "Error al consultar el ERP",
        "pulso",
      );
      return { label: friendly.message, tone: "error" };
    }

    if (part.state === "output-available" && part.output && typeof part.output === "object") {
      const out = part.output as { ok?: boolean; message?: string; code?: string };
      if (out.ok === false && out.code === "RESULT_LARGE") {
        return null;
      }
      if (out.ok === false && out.message) {
        return {
          label: translateErrorMessage(out.message, "pulso").message,
          tone: "error",
        };
      }
    }
  }

  return null;
}

function getFallbackAssistantText(message: UIMessage): string | null {
  const text = getMessageText(message);
  if (text) return null;

  const toolStatus = getToolStatus(message);
  if (toolStatus?.tone === "error") {
    return toolStatus.label;
  }

  if (toolStatus?.tone === "info") {
    return null;
  }

  if (getExcelExportsFromTools(message).length > 0) return null;
  if (getTablePreviewsFromTools(message).length > 0) return null;

  return translateErrorMessage(
    "No se generó respuesta del modelo IA",
    "llm",
  ).message;
}

function isUserMessage(message: UIMessage): boolean {
  return message.role === "user";
}

export type MessageBubbleProps = {
  message: UIMessage;
  isStreaming?: boolean;
};

function stripMarkdownTables(text: string): string {
  // Quita bloques de tabla GFM para no duplicar/romper si el LLM igual las inventa.
  return text
    .replace(/(^|\n)(\|[^\n]*\|[ \t]*\n)(\|[\s:|-]+\|[ \t]*\n)(\|[^\n]*\|[ \t]*\n?)+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const textRaw = getMessageText(message);
  const toolStatus = getToolStatus(message);
  const isUser = isUserMessage(message);
  const excelExports = !isUser ? getExcelExportsFromTools(message) : [];
  const tablePreviews = !isUser ? getTablePreviewsFromTools(message) : [];
  const text =
    !isUser && tablePreviews.length > 0 && textRaw
      ? stripMarkdownTables(textRaw)
      : textRaw;
  const fallbackText = getFallbackAssistantText(message);
  const displayText =
    text || (isStreaming && toolStatus?.tone === "info" ? null : fallbackText);
  const hasUiData = excelExports.length > 0 || tablePreviews.length > 0;

  return (
    <div
      className={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ].join(" ")}
    >
      <div
        className={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ].join(" ")}
      >
        {isUser ? (
          text
        ) : (
          <>
            {toolStatus && !text ? (
              <div
                className={
                  toolStatus.tone === "error"
                    ? styles.toolStatusError
                    : styles.toolStatusInfo
                }
              >
                {toolStatus.label}
              </div>
            ) : null}
            {displayText ? (
              <AssistantRichBody text={displayText} />
            ) : isStreaming && !hasUiData ? (
              <span className={styles.pending}>Procesando…</span>
            ) : null}
            {tablePreviews.map((tbl) => (
              <DataTablePreview
                key={tbl.key}
                rows={tbl.rows}
                totalRows={tbl.totalRows}
                caption={tbl.caption}
              />
            ))}
            {excelExports.map((ex) => (
              <ExcelExportButton
                key={ex.exportId}
                exportId={ex.exportId}
                totalRows={ex.totalRows}
                title={ex.title}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
