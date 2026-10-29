import type { OperacionItem } from "@/lib/crm/present";
import styles from "./OperacionesTable.module.css";

type OperacionesTableProps = {
  items: OperacionItem[];
};

function tipoClass(tipo: string): string {
  const normalized = tipo.toLowerCase();
  if (normalized.includes("factura")) return styles.tipoFactura;
  if (normalized.includes("pedido")) return styles.tipoPedido;
  return styles.tipoOtro;
}

export function OperacionesTable({ items }: OperacionesTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Nº Pedido ERP</th>
            <th>Comprobante</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Zona</th>
            <th>Monto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={styles.mono}>{item.fecha}</td>
              <td>
                <span className={`${styles.badge} ${tipoClass(item.tipo)}`}>{item.tipo}</span>
              </td>
              <td className={styles.mono}>{item.numeroPedidoErp}</td>
              <td className={styles.mono}>{item.comprobante}</td>
              <td>{item.cliente}</td>
              <td>{item.vendedor}</td>
              <td>{item.zona}</td>
              <td className={styles.amount}>{item.monto}</td>
              <td>
                <span
                  className={`${styles.badge} ${
                    item.estado === "Facturada" ? styles.estadoFacturada : styles.estadoCuenta
                  }`}
                >
                  {item.estado}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
