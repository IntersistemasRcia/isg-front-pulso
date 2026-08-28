import { listByokConfigured } from "./byokStorage";
import { MODEL_CATALOG } from "./registry";
import { companyEnvConfigured, isModelConfigured } from "./resolveModel";
import type { ProviderAvailability } from "./types";

/** Lista modelos del catálogo marcando disponibilidad para el usuario. */
export async function getAvailableProviders(userId: string): Promise<ProviderAvailability[]> {
  const byok = await listByokConfigured(userId);
  const results: ProviderAvailability[] = [];

  for (const model of MODEL_CATALOG) {
    const available = await isModelConfigured(userId, model.id);
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