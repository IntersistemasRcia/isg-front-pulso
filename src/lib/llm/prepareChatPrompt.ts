import type { UIMessage } from "ai";
import type { ModelDefinition } from "@/lib/llm/types";
import {
  applyHeadroom,
  DEFAULT_INPUT_HEADROOM_RATIO,
  estimateJsonTokens,
  estimateTokens,
} from "@/lib/llm/tokenBudget";
import { buildPulsoSystemPrompt } from "@/lib/pulso/systemPrompt";
import { buildPulsoTools } from "@/lib/pulso/tools";
import type { PromptCatalogMode } from "@/lib/pulso/catalog";
import { selectRelevantSps } from "@/lib/pulso/selectRelevantSps";
import type { SpArquitectura } from "@/lib/pulso/types";

export type PreparedChatPrompt = {
  system: string;
  tools: ReturnType<typeof buildPulsoTools>;
  promptMode: PromptCatalogMode;
  catalogInPrompt: boolean;
  estimatedTokens: number;
  tokenBudget?: number;
};

type PrepareOptions = {
  definition?: ModelDefinition;
  token: string;
  catalog: SpArquitectura[];
  messages: UIMessage[];
  historySummary?: string;
  companyName?: string;
  clienteId?: string;
};

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
  }
  return "";
}

function estimateMessagesTokens(messages: UIMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") total += estimateTokens(part.text);
    }
  }
  return total;
}

const MODE_ESCALATION: PromptCatalogMode[] = ["full", "compact", "minimal", "tool-only"];

function modesFromPreferred(start: PromptCatalogMode): PromptCatalogMode[] {
  const index = MODE_ESCALATION.indexOf(start);
  return index >= 0 ? MODE_ESCALATION.slice(index) : MODE_ESCALATION;
}

/**
 * Arma system + tools respetando headroom del modelo.
 * - Filtra SPs relevantes (ranking léxico).
 * - Escala modo de catálogo hasta entrar en presupuesto.
 * - En tool-only el catálogo vive en el servidor (dependencia de confianza).
 */
export function prepareChatPrompt(options: PrepareOptions): PreparedChatPrompt {
  const {
    definition,
    token,
    catalog,
    messages,
    historySummary,
    companyName,
    clienteId,
  } = options;

  const userText = extractLastUserText(messages);
  const relevantCatalog = selectRelevantSps(userText, catalog);
  const messagesTokens = estimateMessagesTokens(messages);
  const historyTokens = estimateTokens(historySummary ?? "");

  const maxInput = definition?.maxInputTokens;
  const budget =
    maxInput != null
      ? applyHeadroom(maxInput, definition?.inputHeadroomRatio ?? DEFAULT_INPUT_HEADROOM_RATIO)
      : undefined;

  const fixedOverhead = messagesTokens + historyTokens + 400; // tools + instrucciones base

  let chosenMode: PromptCatalogMode = definition?.promptMode ?? "full";
  let catalogInPrompt = true;
  let system = "";
  let tools = buildPulsoTools(token, catalog);
  let estimatedTokens = 0;

  if (budget != null) {
    const preferredMode = definition?.promptMode ?? "full";
    for (const mode of modesFromPreferred(preferredMode)) {
      if (mode === "tool-only" || mode === "minimal") {
        catalogInPrompt = mode !== "tool-only";
        system = buildPulsoSystemPrompt({
          companyName,
          clienteId,
          catalog: mode === "tool-only" ? [] : relevantCatalog,
          historySummary,
          promptMode: mode,
        });
        tools = buildPulsoTools(token, catalog, { includeCatalogTool: true });
      } else {
        catalogInPrompt = true;
        system = buildPulsoSystemPrompt({
          companyName,
          clienteId,
          catalog: relevantCatalog,
          historySummary,
          promptMode: mode,
        });
        tools = buildPulsoTools(token, catalog, { includeCatalogTool: false });
      }

      estimatedTokens =
        estimateTokens(system) + fixedOverhead + estimateJsonTokens(tools);

      if (estimatedTokens <= budget) {
        chosenMode = mode;
        break;
      }

      chosenMode = mode;
    }
  } else {
    chosenMode = definition?.promptMode ?? "full";
    catalogInPrompt = chosenMode !== "tool-only";
    system = buildPulsoSystemPrompt({
      companyName,
      clienteId,
      catalog: catalogInPrompt ? relevantCatalog : [],
      historySummary,
      promptMode: chosenMode,
    });
    tools = buildPulsoTools(token, catalog, {
      includeCatalogTool: chosenMode === "tool-only",
    });
    estimatedTokens =
      estimateTokens(system) + fixedOverhead + estimateJsonTokens(tools);
  }

  return {
    system,
    tools,
    promptMode: chosenMode,
    catalogInPrompt,
    estimatedTokens,
    tokenBudget: budget,
  };
}
