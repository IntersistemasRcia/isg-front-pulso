import { translateUnknownError } from "@/utils/userFacingErrors";

/** Mensaje amigable para errores del stream enviados al cliente. */
export function formatChatStreamError(error: unknown): string {
  return translateUnknownError(error, "llm").message;
}
