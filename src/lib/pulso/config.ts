/** Configuración de isg-api-pulso (.NET). */

export function getPulsoApiBaseUrl(): string {
  const url =
    process.env.PULSO_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_PULSO_API_URL?.trim() ||
    "";

  return url.replace(/\/$/, "");
}

/**
 * Token para llamar a Pulso API.
 * Prioriza el JWT de la sesión del usuario; fallback a PULSO_API_TOKEN.
 */
export function resolvePulsoToken(sessionToken?: string | null): string {
  return (
    sessionToken?.trim() ||
    process.env.PULSO_API_TOKEN?.trim() ||
    ""
  );
}

export function assertPulsoConfigured(baseUrl: string, token: string): void {
  if (!baseUrl) {
    throw new Error(
      "PULSO_API_URL / NEXT_PUBLIC_PULSO_API_URL no configurada",
    );
  }
  if (!token) {
    throw new Error(
      "No hay token Pulso: iniciá sesión o configurá PULSO_API_TOKEN",
    );
  }
}
