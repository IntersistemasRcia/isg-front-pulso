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

/**
 * Parte el texto del asistente en Markdown y bloques ```chart / ```excel cerrados.
 * Un fence incompleto (streaming) queda como Markdown.
 */
export function parseAssistantBlocks(text: string): AssistantBlock[] {
  const blocks: AssistantBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(new RegExp(FENCE_RE.source, FENCE_RE.flags))) {
    const index = match.index ?? 0;
    const before = text.slice(lastIndex, index);
    if (before.trim()) blocks.push({ kind: "markdown", text: before });

    const lang = (match[1] ?? "").toLowerCase() as FenceKind;
    const parsed = blockFromFence(lang, match[2] ?? "");
    if (parsed) blocks.push(parsed);

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
