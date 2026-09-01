/** API keys de Google AI Studio empiezan con AIza. */
export function isValidGoogleAiStudioKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  return key.trim().startsWith("AIza");
}

export function readGoogleFreeApiKey(): string | null {
  const value = process.env.GOOGLE_FREE_API_KEY?.trim();
  return value || null;
}

export function isGoogleFreeKeyConfigured(): boolean {
  return isValidGoogleAiStudioKey(readGoogleFreeApiKey());
}
