import { listByokConfigured } from "./byokStorage";
import { isGoogleFreeKeyConfigured } from "./googleApiKey";
import { MODEL_CATALOG } from "./registry";
import { companyEnvConfigured, isModelConfigured } from "./resolveModel";
import type { ProviderAvailability } from "./types";

function readEnv(key: string): string | null {
  const value = process.env[key]?.trim();
  return value || null;
}

let warnedInvalidGoogleKey = false;

/** Indica si el despliegue tiene al menos un modelo free configurado. */
export function isFreeTierConfigured(): boolean {
  return MODEL_CATALOG.some(
    (model) =>
      model.tier === "free" &&
      (model.provider === "google-free"
        ? isGoogleFreeKeyConfigured()
        : model.envKeys?.some((envKey) => Boolean(readEnv(envKey)))),
  );
}

/** Mensaje para admin/dev cuando no hay claves free en el servidor. */
export function getFreeTierSetupHint(): string {
  return (
    "No hay modelos gratuitos activos. El administrador debe definir " +
    "GOOGLE_FREE_API_KEY (Gemini 3.6 Flash) en .env.local y reiniciar el servidor. " +
    "Opcional: GROQ_API_KEY para GPT-OSS 120B (Groq)."
  );
}

/** Lista modelos del catálogo marcando disponibilidad para el usuario. */
export async function getAvailableProviders(userId: string): Promise<ProviderAvailability[]> {
  const byok = await listByokConfigured(userId);
  const results: ProviderAvailability[] = [];

  for (const model of MODEL_CATALOG) {
    let available = await isModelConfigured(userId, model.id);

    if (model.provider === "google-free" && !isGoogleFreeKeyConfigured()) {
      const rawKey = readEnv("GOOGLE_FREE_API_KEY");
      if (rawKey && !warnedInvalidGoogleKey) {
        warnedInvalidGoogleKey = true;
        console.warn(
          "[llm] GOOGLE_FREE_API_KEY tiene formato inválido (debe empezar con AIza). " +
            "Modelos Gemini free deshabilitados.",
        );
      }
      available = false;
    }

    let configuredVia: ProviderAvailability["configuredVia"];

    if (model.byokProvider && byok[model.byokProvider]) {
      configuredVia = "byok";
    } else if (model.tier === "premium" && model.byokProvider && companyEnvConfigured(model.byokProvider)) {
      configuredVia = "company";
    } else if (model.tier === "free" && available) {
      configuredVia = "free";
    }

    results.push({
      id: model.id,
      label: model.label,
      description: model.description,
      tier: model.tier,
      available,
      requiresByok: model.tier === "premium" && !companyEnvConfigured(model.byokProvider ?? "openai") && !byok[model.byokProvider ?? "openai"],
      configuredVia,
    });
  }

  return results;
}