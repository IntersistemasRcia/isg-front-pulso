import type { StoredProcedureTool } from "@/types";

/**
 * Catálogo de Stored Procedures expuesto a OpenAI Function Calling.
 * Completar con los 20 SPs reales del cliente; se mantiene un set representativo
 * para orquestación y desarrollo inicial.
 */
export const SP_TOOLS_CATALOG: StoredProcedureTool[] = [
  {
    name: "sp_Ventas_PorPeriodo",
    description: "Obtiene el resumen de ventas entre dos fechas.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string", description: "Fecha inicio ISO (YYYY-MM-DD)" },
        fechaHasta: { type: "string", description: "Fecha fin ISO (YYYY-MM-DD)" },
        sucursalId: { type: "number", description: "Id de sucursal opcional" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Clientes_Buscar",
    description: "Busca clientes por nombre, CUIT o código.",
    parameters: {
      type: "object",
      properties: {
        criterio: { type: "string", description: "Texto de búsqueda" },
        limite: { type: "number", description: "Máximo de filas (default 50)" },
      },
      required: ["criterio"],
    },
  },
  {
    name: "sp_Stock_Disponible",
    description: "Consulta stock disponible de un artículo o depósito.",
    parameters: {
      type: "object",
      properties: {
        articuloCodigo: { type: "string", description: "Código de artículo" },
        depositoId: { type: "number", description: "Id de depósito" },
      },
      required: ["articuloCodigo"],
    },
  },
  {
    name: "sp_Cuentas_Saldos",
    description: "Devuelve saldos de cuentas corrientes de clientes.",
    parameters: {
      type: "object",
      properties: {
        clienteCodigo: { type: "string", description: "Código de cliente" },
        soloVencidos: { type: "boolean", description: "Filtrar solo vencidos" },
      },
      required: ["clienteCodigo"],
    },
  },
  {
    name: "sp_Facturas_Listar",
    description: "Lista facturas de un período o cliente.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        clienteCodigo: { type: "string" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Compras_PorProveedor",
    description: "Resumen de compras agrupadas por proveedor.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        proveedorId: { type: "number" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Cobranza_Diaria",
    description: "Detalle de cobranza del día o rango indicado.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Articulos_TopVendidos",
    description: "Ranking de artículos más vendidos en un período.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        top: { type: "number", description: "Cantidad de filas del ranking" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Vendedores_Performance",
    description: "Performance de vendedores por monto y cantidad de operaciones.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        vendedorId: { type: "number" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Pedidos_Pendientes",
    description: "Lista pedidos pendientes de entrega o facturación.",
    parameters: {
      type: "object",
      properties: {
        clienteCodigo: { type: "string" },
        estado: { type: "string", description: "Filtro de estado opcional" },
      },
    },
  },
  {
    name: "sp_Remitos_PorFecha",
    description: "Remitos emitidos en un rango de fechas.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Precios_Articulo",
    description: "Obtiene listas de precio vigentes para un artículo.",
    parameters: {
      type: "object",
      properties: {
        articuloCodigo: { type: "string" },
        listaPrecioId: { type: "number" },
      },
      required: ["articuloCodigo"],
    },
  },
  {
    name: "sp_Caja_Movimientos",
    description: "Movimientos de caja en un período.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        cajaId: { type: "number" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Bancos_Saldos",
    description: "Saldos bancarios y conciliación resumida.",
    parameters: {
      type: "object",
      properties: {
        bancoId: { type: "number" },
        fecha: { type: "string", description: "Fecha de corte" },
      },
    },
  },
  {
    name: "sp_Inventario_Valorizado",
    description: "Valorización de inventario por depósito o rubro.",
    parameters: {
      type: "object",
      properties: {
        depositoId: { type: "number" },
        rubroId: { type: "number" },
      },
    },
  },
  {
    name: "sp_Margen_PorRubro",
    description: "Análisis de margen bruto por rubro en un período.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Devoluciones_Listar",
    description: "Listado de devoluciones de clientes o proveedores.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        tipo: { type: "string", description: "Cliente | Proveedor" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Comprobantes_Detalle",
    description: "Detalle de un comprobante por tipo y número.",
    parameters: {
      type: "object",
      properties: {
        tipoComprobante: { type: "string" },
        numero: { type: "string" },
      },
      required: ["tipoComprobante", "numero"],
    },
  },
  {
    name: "sp_KPI_Dashboard",
    description: "Indicadores KPI principales del negocio para el período.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
  {
    name: "sp_Usuarios_Actividad",
    description: "Actividad reciente de usuarios del sistema ERP.",
    parameters: {
      type: "object",
      properties: {
        fechaDesde: { type: "string" },
        fechaHasta: { type: "string" },
        usuarioId: { type: "number" },
      },
      required: ["fechaDesde", "fechaHasta"],
    },
  },
];

/** Convierte el catálogo al formato tools de OpenAI. */
export function toOpenAITools() {
  return SP_TOOLS_CATALOG.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
