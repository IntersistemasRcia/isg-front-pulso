import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import type { ModelDefinition } from "@/lib/llm/types";
import {
  applyHeadroom,
  DEFAULT_INPUT_HEADROOM_RATIO,
  estimateJsonTokens,
  estimateTokens,
} from "@/lib/llm/tokenBudget";
import {
  buildFollowUpContextHint,
  buildUserQueryContext,
} from "@/lib/chat/buildUserQueryContext";
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
  messageCount: number;
  toolResultsKb: number;
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

function estimatePartTokens(part: UIMessage["parts"][number]): number {
  if (part.type === "text") {
    return estimateTokens(part.text);
  }

  if (isToolUIPart(part)) {
    if (part.state === "output-available" && part.output != null) {
      return estimateJsonTokens(part.output);
    }
    if (part.input != null) {
      return estimateJsonTokens(part.input);
    }
  }

  return estimateJsonTokens(part);
}

function estimateMessagesTokens(messages: UIMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      total += estimatePartTokens(part);
    }
  }
  return total;
}

function estimateToolResultsKb(messages: UIMessage[]): number {
  let bytes = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (isToolUIPart(part) && part.state === "output-available" && part.output != null) {
        try {
          bytes += JSON.stringify(part.output).length;
        } catch {
          bytes += 0;
        }
      }
    }
  }
  return Math.round(bytes / 1024);
}

function buildTruncateOptions(definition?: ModelDefinition) {
  if (!definition?.toolResultMaxBytes && !definition?.toolResultMaxRows) {
    return undefined;
  }
  return {
    maxBytes: definition.toolResultMaxBytes,
    maxRows: definition.toolResultMaxRows,
  };
}

const MODE_ESCALATION: PromptCatalogMode[] = ["full", "compact", "minimal", "tool-only"];

function modesFromPreferred(start: PromptCatalogMode): PromptCatalogMode[] {
  const index = MODE_ESCALATION.indexOf(start);
  return index >= 0 ? MODE_ESCALATION.slice(index) : MODE_ESCALATION;
}

/**
 * Arma system + tools respetando headroom del modelo.
 * - Filtra SPs relevantes (ranking léxico con contexto multi-turn).
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

  const userQueryContext = buildUserQueryContext(messages);
  const followUpContext = buildFollowUpContextHint(messages);
  const spTopK = definition?.relevantSpTopK;
  const relevantCatalog = selectRelevantSps(userQueryContext, catalog, spTopK);
  const messagesTokens = estimateMessagesTokens(messages);
  const historyTokens = estimateTokens(historySummary ?? "");
  const toolResultsKb = estimateToolResultsKb(messages);
  const truncateOptions = buildTruncateOptions(definition);

  const maxInput = definition?.maxInputTokens;
  const budget =
    maxInput != null
      ? applyHeadroom(maxInput, definition?.inputHeadroomRatio ?? DEFAULT_INPUT_HEADROOM_RATIO)
      : undefined;

  const fixedOverhead = messagesTokens + historyTokens + 400; // tools + instrucciones base

  let chosenMode: PromptCatalogMode = definition?.promptMode ?? "full";
  let catalogInPrompt = true;
  let system = "";
  let tools = buildPulsoTools(token, catalog, { truncateOptions });
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
          followUpContext,
          promptMode: mode,
        });
        tools = buildPulsoTools(token, catalog, {
          includeCatalogTool: true,
          truncateOptions,
        });
      } else {
        catalogInPrompt = true;
        system = buildPulsoSystemPrompt({
          companyName,
          clienteId,
          catalog: relevantCatalog,
          historySummary,
          followUpContext,
          promptMode: mode,
        });
        tools = buildPulsoTools(token, catalog, {
          includeCatalogTool: false,
          truncateOptions,
        });
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
      followUpContext,
      promptMode: chosenMode,
    });
    tools = buildPulsoTools(token, catalog, {
      includeCatalogTool: chosenMode === "tool-only",
      truncateOptions,
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
    messageCount: messages.length,
    toolResultsKb,
  };
}
