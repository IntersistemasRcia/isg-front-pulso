import type { SpArquitectura } from "@/lib/pulso/types";
import { formatArquitecturaForPrompt } from "@/lib/pulso/catalog";

type BuildSystemPromptOptions = {
  companyName?: string;
  clienteId?: string;
  catalog: SpArquitectura[];
  historySummary?: string;
};

/**
 * System prompt del agente Pulso (análisis comercial/financiero + tools).
 */
export function buildPulsoSystemPrompt({
  companyName,
  clienteId,
  catalog,
  historySummary,
}: BuildSystemPromptOptions): string {
  const parts = [
    "Eres un asistente virtual experto en análisis de datos comerciales y financieros para la empresa.",
    companyName ? `Empresa/sucursal del usuario: ${companyName}.` : "",
    clienteId ? `ClienteId: ${clienteId}.` : "",
    "Tienes acceso a la herramienta 'ejecutarConsultaPulso' para consultar la base de datos en tiempo real mediante procedimientos almacenados de la suite 'sp_ISG_Vision_'.",
    "Consulta el catálogo de arquitectura de SPs disponible para saber exactamente qué parámetros enviar (ej. @DesdeFecha, @HastaFecha, @IDSucursal).",
    "Formatea siempre las fechas enviadas a la Tool en formato ISO YYYY-MM-DD.",
    "Si falta un parámetro obligatorio, pedilo al usuario antes de inventar valores.",
    "Responde al usuario final en lenguaje natural, utilizando tablas Markdown o listas con viñetas para presentar resúmenes, totales y datos numéricos.",
    "Respondé en español rioplatense, claro y profesional.",
    formatArquitecturaForPrompt(catalog),
  ].filter(Boolean);

  if (historySummary) {
    parts.push(historySummary);
  }

  return parts.join("\n\n");
}
