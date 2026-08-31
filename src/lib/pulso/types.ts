/** DTOs del catálogo de arquitectura de SPs (isg-api-pulso). */

export interface SpParametroArquitectura {
  nombre: string;
  tipo?: string;
  type?: string;
  requerido?: boolean;
  required?: boolean;
  /** true = OUTPUT (no enviar en POST /ejecutar-sp). */
  esOutput?: boolean;
  descripcion?: string;
  description?: string;
}

export interface SpArquitectura {
  nombre: string;
  name?: string;
  descripcion?: string;
  description?: string;
  /**
   * Solo presente si el API se llamó con ?includeSql=true (debug).
   * El chat NO debe usar CodigoSQL en el prompt.
   */
  codigoSql?: string;
  /** Parámetros de entrada desde sys.parameters (preferido). */
  parametros?: SpParametroArquitectura[];
  parameters?: SpParametroArquitectura[];
}

export interface EjecutarSpRequest {
  nombreSp: string;
  parametros?: Record<string, unknown>;
}

/** Body JSON de POST /ejecutar-sp (Swagger + System.Text.Json camelCase). */
export interface EjecutarSpApiBody {
  nombreSp: string;
  parametros?: Record<string, unknown>;
}

export interface EjecutarSpResponse {
  ok?: boolean;
  status?: number;
  message?: string;
  data?: unknown;
  rows?: unknown[];
  request?: EjecutarSpRequest;
  [key: string]: unknown;
}
