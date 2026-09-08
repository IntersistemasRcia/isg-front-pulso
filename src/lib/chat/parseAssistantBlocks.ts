import {
  parseChartSpec,
  parseExcelSpec,
  type ChartSpec,
  type ExcelSpec,
} from "@/lib/chat/tabularSpec";

export type AssistantBlock =
  | { kind: "markdown"; text: string }
  | { kind: "chart"; spec: ChartSpec }
  | { kind: "excel"; spec: ExcelSpec };

type FenceKind = "chart" | "excel";

const FENCE_RE = /```(chart|excel)[^\n]*\n([\s\S]*?)```/gi;

const CHART_PARSE_FAIL_HINT =
  "_No pude mostrar el gráfico: el bloque vino con formato inválido. Pedime de nuevo el comparativo (meses/semanas/días)._\n\n";

const EXCEL_PARSE_FAIL_HINT =
  "_No pude armar la descarga Excel: el bloque vino con formato inválido. Pedime de nuevo exportar los datos._\n\n";

function blockFromFence(lang: string, payload: string): AssistantBlock | null {
  if (lang === "chart") {
    const spec = parseChartSpec(payload);
    return spec ? { kind: "chart", spec } : null;
  }
  if (lang === "excel") {
    const spec = parseExcelSpec(payload);
    return spec ? { kind: "excel", spec } : null;
  }
  return null;
}

function fallbackMarkdownForInvalidFence(lang: FenceKind, payload: string): AssistantBlock {
  const hint = lang === "chart" ? CHART_PARSE_FAIL_HINT : EXCEL_PARSE_FAIL_HINT;
  const trimmed = payload.trim();
  const preview = trimmed
    ? `\n\`\`\`json\n${trimmed.slice(0, 800)}${trimmed.length > 800 ? "\n…" : ""}\n\`\`\`\n`
    : "";
  return { kind: "markdown", text: `${hint}${preview}` };
}

/**
 * Parte el texto del asistente en Markdown y bloques ```chart / ```excel cerrados.
 * Un fence incompleto (streaming) queda como Markdown.
 * Un fence cerrado inválido no se traga: se muestra aviso + preview del JSON.
 */
export function parseAssistantBlocks(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(new RegExp(FENCE_RE.source, FENCE_RE.flags))) {
    const index = match.index ?? 0;
    const before = text.slice(lastIndex, index);
    if (before.trim()) blocks.push({ kind: "markdown", text: before });

    const lang = (match[1] ?? "").toLowerCase() as FenceKind;
    const payload = match[2] ?? "";
    const parsed = blockFromFence(lang, payload);
    if (parsed) {
      blocks.push(parsed);
    } else if (lang === "chart" || lang === "excel") {
      blocks.push(fallbackMarkdownForInvalidFence(lang, payload));
    }

    lastIndex = index + match[0].length;
  }

  const rest = text.slice(lastIndex);
  if (rest) blocks.push({ kind: "markdown", text: rest });
  if (blocks.length === 0 && text) blocks.push({ kind: "markdown", text });

  return mergeAdjacentMarkdown(blocks);
}

function mergeAdjacentMarkdown(blocks: AssistantBlock[]): AssistantBlock[] {
  const out: AssistantBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (block.kind === "markdown" && prev?.kind === "markdown") {
      prev.text += block.text;
    } else {
      out.push(block);
    }
  }
  return out;
}
