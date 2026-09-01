"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MODEL_ID, normalizeModelId } from "@/lib/llm/registry";
import type {
  LlmProvidersApiResponse,
  ProviderAvailability,
} from "@/lib/llm/types";
import { getStoredToken } from "@/utils/api";
import { translateErrorMessage } from "@/utils/userFacingErrors";
import styles from "./ModelSelector.module.css";

export interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

/**
 * Selector de modelo LLM con grupos free/premium y enlace a configuración BYOK.
 */
export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<ProviderAvailability[]>([]);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getStoredToken();
        const res = await fetch("/api/chat/providers", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("No se pudo cargar la lista de modelos");
        }
        const data = (await res.json()) as LlmProvidersApiResponse;
        if (!cancelled) {
          setModels(data.models ?? []);
          setSetupHint(data.setupHint ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            translateErrorMessage(
              err instanceof Error ? err.message : "Error de red",
              "generic",
            ).message,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!models.length) return;
    const current = models.find((m) => m.id === value);
    if (current?.available) return;
    const fallback =
      models.find((m) => m.available && m.tier === "free") ??
      models.find((m) => m.available) ??
      models.find((m) => m.id === DEFAULT_MODEL_ID);
    if (fallback && fallback.id !== value) {
      onChange(fallback.id);
    }
  }, [models, onChange, value]);

  const selected = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  );

  const availableModels = useMemo(
    () => models.filter((m) => m.available),
    [models],
  );

  const freeModels = availableModels.filter((m) => m.tier === "free");
  const premiumModels = availableModels.filter((m) => m.tier === "premium");

  const showConfigureLink = useMemo(() => {
    const hasAvailablePremium = models.some(
      (m) => m.tier === "premium" && m.available,
    );
    const hasUnavailablePremium = models.some(
      (m) => m.tier === "premium" && !m.available,
    );
    return hasUnavailablePremium || !hasAvailablePremium;
  }, [models]);

  function badgeLabel(model: ProviderAvailability): string {
    if (model.tier === "free") return "Gratis";
    if (model.configuredVia === "byok") return "BYOK";
    return "Premium";
  }

  function renderOption(model: ProviderAvailability) {
    return (
      <option key={model.id} value={model.id}>
        {model.label}
      </option>
    );
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.label} id="pulso-model-label">
        Modelo IA
      </span>
      <div className={styles.selectRow}>
        <select
          className={styles.select}
          value={availableModels.some((m) => m.id === value) ? value : ""}
          disabled={disabled || loading || !availableModels.length}
          onChange={(e) => onChange(e.target.value)}
          aria-labelledby="pulso-model-label"
        >
          {!availableModels.length ? (
            <option value="">
              {loading ? "Cargando modelos…" : "Sin modelos configurados"}
            </option>
          ) : null}
          {freeModels.length ? (
            <optgroup label="Gratis (tier despliegue)">
              {freeModels.map(renderOption)}
            </optgroup>
          ) : null}
          {premiumModels.length ? (
            <optgroup label="Premium (BYOK o empresa)">
              {premiumModels.map(renderOption)}
            </optgroup>
          ) : null}
        </select>
        {selected?.available ? (
          <span
            className={
              selected.tier === "free"
                ? styles.badgeFree
                : selected.configuredVia === "byok"
                  ? styles.badgePremium
                  : styles.badgePremium
            }
          >
            {badgeLabel(selected)}
          </span>
        ) : null}
        {showConfigureLink ? (
          <Link href="/dashboard/settings/ia" className={styles.settingsLink}>
            Agregar API Key →
          </Link>
        ) : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {!error && !loading && !availableModels.length && setupHint ? (
        <p className={styles.setupHint}>{setupHint}</p>
      ) : null}
      {!error && selected?.description ? (
        <p className={styles.hint}>{selected.description}</p>
      ) : null}
    </div>
  );
}