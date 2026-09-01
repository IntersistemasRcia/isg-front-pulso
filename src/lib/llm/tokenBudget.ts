/** Margen de seguridad: no usar más del 75% del límite declarado del proveedor. */
export const DEFAULT_INPUT_HEADROOM_RATIO = 0.75;

/** Estimación conservadora (español + JSON suele ser ~3.5 chars/token). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function applyHeadroom(
  maxInputTokens: number,
  ratio = DEFAULT_INPUT_HEADROOM_RATIO,
): number {
  return Math.floor(maxInputTokens * ratio);
}

export function estimateJsonTokens(value: unknown): number {
  try {
    return estimateTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}
