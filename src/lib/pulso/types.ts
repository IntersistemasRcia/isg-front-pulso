/** DTOs del catálogo de arquitectura de SPs (isg-api-pulso). */

export interface SpParametroArquitectura {
  nombre: string;
  tipo?: string;
  type?: string;
  requerido?: boolean;
  required?: boolean;
  descripcion?: string;
  description?: string;
}

export interface SpArquitectura {
  nombre: string;
  name?: string;
  descripcion?: string;
  description?: string;
  parametros?: SpParametroArquitectura[];
  parameters?: SpParametroArquitectura[];
}

export interface EjecutarSpRequest {
  nombreSp: string;
  parametros?: Record<string, unknown>;
}

export interface EjecutarSpResponse {
  ok?: boolean;
  data?: unknown;
  [key: string]: unknown;
}
