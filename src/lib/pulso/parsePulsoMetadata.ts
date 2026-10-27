/**
 * Parseo ligero del comentario Pulso expuesto en `descripcion` de /SPs_arquitectura.
 * No reemplaza el bloque completo: extrae campos clave para ranking y gates.
 */

export type PulsoTipo =
  | "CATALOGO"
  | "INDICADOR"
  | "ANALISIS"
  | "INFORME"
  | "AUXILIAR"
  | string;

export type ParsedPulsoMetadata = {
  tipo?: PulsoTipo;
  granularidad?: string;
  proposito?: string;
  usarCuando?: string;
  noUsarPara?: string;
  /** True si hay al menos un campo estructurado (TIPO u otro). */
  hasStructuredFields: boolean;
};

const FIELD_LABELS =
  "TIPO|PROP[OÓ]SITO|GRANULARIDAD|USAR\\s+CUANDO|NO\\s+USAR\\s+PARA|PAR[AÁ]METROS|INTERACCI[OÓ]N|RESULTADO|REGLAS";

/** Campos cortos: valor hasta el primer punto o el próximo label. */
function captureShortField(desc: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*:\\s*([^.:]+?)(?=\\s*\\.|\\s+(?:${FIELD_LABELS})\\s*:|$)`,
      "i",
    );
    const m = desc.match(re);
    if (m?.[1]?.trim()) return m[1].trim().replace(/\s+/g, " ");
  }
  return undefined;
}

/** Campos largos: hasta el próximo label etiquetado. */
function captureField(desc: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${FIELD_LABELS})\\s*:|$)`,
      "i",
    );
    const m = desc.match(re);
    if (m?.[1]?.trim()) {
      return m[1]
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\.$/, "");
    }
  }
  return undefined;
}

/** Extrae TIPO / GRANULARIDAD / PROPÓSITO / USAR CUANDO / NO USAR PARA de la descripción. */
export function parsePulsoMetadata(descripcion: string | undefined | null): ParsedPulsoMetadata {
  const desc = (descripcion ?? "").trim();
  if (!desc) {
    return { hasStructuredFields: false };
  }

  const tipoRaw = captureShortField(desc, ["TIPO"]);
  const tipo = tipoRaw
    ? tipoRaw.split(/[.\s,;]/)[0]!.toUpperCase()
    : undefined;

  const granularidad = captureShortField(desc, ["GRANULARIDAD"]);
  const proposito = captureField(desc, ["PROPÓSITO", "PROPOSITO"]);
  const usarCuando = captureField(desc, ["USAR CUANDO"]);
  const noUsarPara = captureField(desc, ["NO USAR PARA"]);

  const hasStructuredFields = Boolean(
    tipo || granularidad || proposito || usarCuando || noUsarPara,
  );

  return {
    tipo,
    granularidad,
    proposito,
    usarCuando,
    noUsarPara,
    hasStructuredFields,
  };
}

export function isTipoCatalogo(meta: ParsedPulsoMetadata): boolean {
  return (meta.tipo ?? "").toUpperCase() === "CATALOGO";
}

/**
 * Nombre sugiere listado maestro: Catalogo_* o Get* + entidad.
 * Señal secundaria; preferir TIPO:CATALOGO verificado en metadatos.
 */
export function isMasterListSpName(name: string): boolean {
  const n = name.toLowerCase();
  if (/catalogo_/i.test(n) || /_catalogo/i.test(n)) return true;
  if (/getmarcas|getrubros|get_?marca|get_?rubro|get_?sucursal|get_?vendedor|get_?subrubro/i.test(n)) {
    return true;
  }
  if (/^sp_isg_vision_get/i.test(n) && /marca|rubro|cliente|sucursal|vendedor|subrubro|zona/i.test(n)) {
    return true;
  }
  return false;
}
