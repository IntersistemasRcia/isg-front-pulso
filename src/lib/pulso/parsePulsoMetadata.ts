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
 * Entidades típicas de listados maestros (nombre SP). Extensible; no lista cerrada de negocio.
 * Señal secundaria; preferir TIPO:CATALOGO verificado en metadatos.
 */
const MASTER_ENTITY_IN_SP_NAME =
  /marca|rubro|subrubro|sector|sucursal|vendedor|zona|cliente|articulo|artículo|medio.?pago|lista.?precio/i;

/**
 * Nombre sugiere listado maestro: Catalogo_* o Get* + entidad.
 * Cubre GetRubros / GetSectores / Get_Marcas / sp_ISG_Vision_Get* genéricos.
 */
export function isMasterListSpName(name: string): boolean {
  const n = name.toLowerCase();
  if (/catalogo_/i.test(n) || /_catalogo/i.test(n)) return true;
  // Get* compacto o con guiones bajos (GetRubros, Get_Sectores, getmarcas)
  if (/get_?(marcas?|rubros?|subrubros?|sectores?|sucursales?|vendedores?|zonas?|clientes?)/i.test(n)) {
    return true;
  }
  // Cualquier sp_ISG_Vision_Get* cuyo resto nombre una entidad maestra
  if (/^sp_isg_vision_get/i.test(n) && MASTER_ENTITY_IN_SP_NAME.test(n)) {
    return true;
  }
  // Get* suelto sin prefijo sp (fantasmas del modelo)
  if (/^get[a-z0-9_]+$/i.test(n) && MASTER_ENTITY_IN_SP_NAME.test(n)) {
    return true;
  }
  return false;
}
