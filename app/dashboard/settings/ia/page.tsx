"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, TextField } from "@/components/ui";
import { MyButtons } from "@/utils/MyButtons";
import { BYOK_PROVIDERS } from "@/lib/llm/registry";
import type { ByokProviderId, ByokSettingsDto } from "@/lib/llm/types";
import { getStoredToken } from "@/utils/api";
import styles from "./page.module.css";

type SettingsResponse = ByokSettingsDto & {
  enabled?: boolean;
  message?: string;
};

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Configuración BYOK (Bring Your Own Key) para modelos premium. */
export default function IaSettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [draftKeys, setDraftKeys] = useState<Record<ByokProviderId, string>>({
    openai: "",
    anthropic: "",
    google: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ByokProviderId | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/ia", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("No se pudo cargar la configuración");
      }
      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProvider(provider: ByokProviderId) {
    const apiKey = draftKeys[provider].trim();
    if (!apiKey) {
      setError("Ingrese una API key antes de guardar.");
      return;
    }
    setSaving(provider);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/ia", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = (await res.json()) as SettingsResponse & { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Error al guardar");
      }
      setSettings(data);
      setDraftKeys((prev) => ({ ...prev, [provider]: "" }));
      setFeedback(`Clave de ${provider} guardada correctamente.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  }

  async function removeProvider(provider: ByokProviderId) {
    setSaving(provider);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/settings/ia", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as SettingsResponse & { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Error al eliminar");
      }
      setSettings(data);
      setFeedback(`Clave de ${provider} eliminada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSaving(null);
    }
  }

  const providerState = (id: ByokProviderId) =>
    settings?.providers.find((p) => p.provider === id);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Configuración IA</h1>
        <p className={styles.lead}>
          Los modelos gratuitos usan las claves del despliegue. Para premium puede
          usar las claves de su empresa (variables de entorno) o registrar sus
          propias API keys (BYOK), cifradas en el servidor.
        </p>
      </header>

      {settings?.enabled === false ? (
        <div className={styles.banner}>
          {settings.message ??
            "BYOK no está habilitado: el administrador debe definir BYOK_ENCRYPTION_KEY."}
        </div>
      ) : null}

      {loading ? <p className={styles.lead}>Cargando…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {feedback ? <p className={styles.success}>{feedback}</p> : null}

      <Card className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Claves personales (BYOK)</h2>
          <p className={styles.cardSubtitle}>
            Cada proveedor se guarda de forma independiente y cifrada en el servidor.
          </p>
        </div>

        <div className={styles.providerList}>
          {BYOK_PROVIDERS.map((meta) => {
            const state = providerState(meta.id);
            return (
              <section key={meta.id} className={styles.providerBlock}>
                <h3 className={styles.providerTitle}>{meta.label}</h3>
                <p className={styles.providerDesc}>{meta.description}</p>
                {state?.configured && state.maskedKey ? (
                  <p className={styles.configured}>
                    Configurada: {state.maskedKey}
                  </p>
                ) : null}
                <div className={styles.fieldWrap}>
                  <TextField
                    label="API key"
                    type="password"
                    autoComplete="off"
                    placeholder={meta.id === "openai" ? "sk-..." : undefined}
                    value={draftKeys[meta.id]}
                    disabled={settings?.enabled === false || saving === meta.id}
                    onChange={(e) =>
                      setDraftKeys((prev) => ({
                        ...prev,
                        [meta.id]: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className={styles.actions}>
                  <MyButtons
                    color="primary"
                    size="small"
                    disabled={settings?.enabled === false || saving === meta.id}
                    onClick={() => void saveProvider(meta.id)}
                  >
                    Guardar
                  </MyButtons>
                  {state?.configured ? (
                    <MyButtons
                      color="secondary"
                      size="small"
                      disabled={saving === meta.id}
                      onClick={() => void removeProvider(meta.id)}
                    >
                      Eliminar
                    </MyButtons>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}