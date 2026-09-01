/**
 * Claves de Google AI Studio / Gemini API.
 * - Standard (legacy): AIzaSy…
 * - Auth (2026+): AQ.Ab…
 * @see https://ai.google.dev/gemini-api/docs/api-key
 */
export function isValidGoogleGeminiKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  const trimmed = key.trim();
  return trimmed.startsWith("AIza") || trimmed.startsWith("AQ.");
}

/** @deprecated Usar isValidGoogleGeminiKey */
export function isValidGoogleAiStudioKey(key: string | null | undefined): boolean {
  return isValidGoogleGeminiKey(key);
}

export function readGoogleFreeApiKey(): string | null {
  const value = process.env.GOOGLE_FREE_API_KEY?.trim();
  return value || null;
}

export function isGoogleFreeKeyConfigured(): boolean {
  return isValidGoogleGeminiKey(readGoogleFreeApiKey());
}

export function readGooglePremiumApiKey(): string | null {
  const value = process.env.GOOGLE_API_KEY?.trim();
  return value || null;
}

export function isGooglePremiumKeyConfigured(): boolean {
  return isValidGoogleGeminiKey(readGooglePremiumApiKey());
}
