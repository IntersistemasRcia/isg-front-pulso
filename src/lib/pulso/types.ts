/** DTOs del catálogo de arquitectura de SPs (isg-api-pulso). */

export interface SpParametroArquitectura {
  nombre: string;
  tipo?: string;
  type?: string;
  requerido?: boolean;
  required?: boolean;
  /** true = el SP declara default (= NULL, = 0, …). */
  tieneDefault?: boolean;
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
  /**
   * Si se informa, el API debería devolver como máximo N filas (+ metadata).
   * Compat: backends viejos ignoran el campo y devuelven el array completo.
   */
  limiteFilas?: number | null;
}

/** Body JSON de POST /ejecutar-sp (Swagger + System.Text.Json camelCase). */
export interface EjecutarSpApiBody {
  nombreSp: string;
  parametros?: Record<string, unknown>;
  limiteFilas?: number | null;
}

export interface EjecutarSpResponse {
  ok?: boolean;
  status?: number;
  message?: string;
  data?: unknown;
  rows?: unknown[];
  /** Total de filas del resultado (o leídas). */
  totalRows?: number;
  /** true si se aplicó límite y había más filas. */
  truncated?: boolean;
  limiteFilas?: number | null;
  request?: EjecutarSpRequest;
  [key: string]: unknown;
}
