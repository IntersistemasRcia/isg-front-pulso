/**
 * Configuración del tier "Hosted / Pulso IA Premium".
 *
 * Los caps reales (USD y TPM técnico) se configuran en el proyecto GCP del cliente.
 * Las vars aquí definen soft limits que Pulso usa para avisar ANTES de que GCP corte.
 *
 * Env vars (todas opcionales con defaults sensatos):
 *   HOSTED_LLM_ENABLED          → "1" activa el tier
 *   HOSTED_GCP_PROJECT_ID       → ID del proyecto GCP de este despliegue (solo logs/UX)
 *   HOSTED_DAILY_CHATS          → cupo diario de chats de usuario (default sin límite)
 *   HOSTED_MONTHLY_TOKENS       → tokens estimados/mes (default sin límite)
 *   HOSTED_NEAR_DAILY_RATIO     → fracción para aviso "cerca del límite diario" (default 0.8)
 *   HOSTED_NEAR_MONTHLY_RATIO   → fracción para aviso "cerca del límite mensual" (default 0.8)
 *   HOSTED_MAX_TOKENS_PER_MIN   → soft limit de TPM en Pulso (default 50000)
 */

function readEnv(key: string): string | null {
  const val = process.env[key]?.trim();
  return val || null;
}

function readPositiveInt(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readRatio(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

export type HostedLimits = {
  enabled: boolean;
  gcpProjectId: string | null;
  dailyChats: number | null;       // null = sin límite Pulso
  monthlyTokens: number | null;    // null = sin límite Pulso
  nearDailyRatio: number;
  nearMonthlyRatio: number;
  maxTokensPerMin: number;
};

export function getHostedLimits(): HostedLimits {
  const enabledFlag = readEnv("HOSTED_LLM_ENABLED");
  const enabled = /^(1|true|yes|on)$/i.test(enabledFlag ?? "");

  const dailyChatsRaw = readEnv("HOSTED_DAILY_CHATS");
  const monthlyTokensRaw = readEnv("HOSTED_MONTHLY_TOKENS");

  return {
    enabled,
    gcpProjectId: readEnv("HOSTED_GCP_PROJECT_ID"),
    dailyChats: dailyChatsRaw ? readPositiveInt("HOSTED_DAILY_CHATS", 0) || null : null,
    monthlyTokens: monthlyTokensRaw ? readPositiveInt("HOSTED_MONTHLY_TOKENS", 0) || null : null,
    nearDailyRatio: readRatio("HOSTED_NEAR_DAILY_RATIO", 0.8),
    nearMonthlyRatio: readRatio("HOSTED_NEAR_MONTHLY_RATIO", 0.8),
    maxTokensPerMin: readPositiveInt("HOSTED_MAX_TOKENS_PER_MIN", 50_000),
  };
}

export function isHostedEnabled(): boolean {
  return getHostedLimits().enabled;
}

/**
 * Chequea si el uso actual supera (o se acerca a) los límites configurados.
 * Retorna null si el tier no está habilitado o no hay límites definidos.
 */
export type HostedQuotaStatus =
  | { ok: true }
  | { ok: false; kind: "daily_chats_exceeded" | "monthly_tokens_exceeded"; current: number; limit: number }
  | { ok: "near"; kind: "near_daily_chats" | "near_monthly_tokens"; current: number; limit: number; ratio: number };

export function checkHostedQuota(opts: {
  currentDailyChats?: number;
  currentMonthlyTokens?: number;
}): HostedQuotaStatus | null {
  const limits = getHostedLimits();
  if (!limits.enabled) return null;

  const { currentDailyChats, currentMonthlyTokens } = opts;

  // Hard limits (cortar)
  if (limits.dailyChats != null && currentDailyChats != null) {
    if (currentDailyChats >= limits.dailyChats) {
      return { ok: false, kind: "daily_chats_exceeded", current: currentDailyChats, limit: limits.dailyChats };
    }
  }
  if (limits.monthlyTokens != null && currentMonthlyTokens != null) {
    if (currentMonthlyTokens >= limits.monthlyTokens) {
      return { ok: false, kind: "monthly_tokens_exceeded", current: currentMonthlyTokens, limit: limits.monthlyTokens };
    }
  }

  // Soft limits (avisar)
  if (limits.dailyChats != null && currentDailyChats != null) {
    if (currentDailyChats >= limits.dailyChats * limits.nearDailyRatio) {
      return {
        ok: "near",
        kind: "near_daily_chats",
        current: currentDailyChats,
        limit: limits.dailyChats,
        ratio: limits.nearDailyRatio,
      };
    }
  }
  if (limits.monthlyTokens != null && currentMonthlyTokens != null) {
    if (currentMonthlyTokens >= limits.monthlyTokens * limits.nearMonthlyRatio) {
      return {
        ok: "near",
        kind: "near_monthly_tokens",
        current: currentMonthlyTokens,
        limit: limits.monthlyTokens,
        ratio: limits.nearMonthlyRatio,
      };
    }
  }

  return { ok: true };
}
