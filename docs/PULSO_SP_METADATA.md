# ISG Pulso — Estándar de metadatos de Stored Procedures

**Versión:** 1.2  
**Proyecto:** ISG Pulso  
**Objetivo:** Normalizar el comentario `Pulso` en cada SP para que el LLM seleccione y ejecute la consulta correcta.

---

## 1. Objetivo

El comentario Pulso no es solo documentación técnica. Debe dar al modelo información suficiente para:

1. Identificar qué necesidad de negocio resuelve el SP.
2. Seleccionarlo según la pregunta del usuario.
3. Diferenciarlo de SP similares por **GRANULARIDAD** (qué representa cada fila), no solo por el nombre.
4. Completar parámetros (obligatorios, opcionales, defaults).
5. Reconocer enums / valores cerrados.
6. Saber cuándo preguntar al usuario.
7. Resolver IDs vía SP de tipo CATALOGO cuando existan.
8. Ejecutar e interpretar el resultado.

**Principio:** el LLM decide qué consulta usar y cómo completarla; el SP concentra la lógica de datos y las reglas de negocio.

---

## 2. Prefijo técnico (obligatorio)

Solo se exponen a Pulso los procedimientos cuyo nombre empieza con:

```text
sp_ISG_Vision_
```

Ejemplo válido: `sp_ISG_Vision_VentasDiarias`.  
Si el nombre no cumple el prefijo, **isg-api-pulso no lo lista** en `/SPs_arquitectura`.

---

## 3. Ubicación del metadato

En el cuerpo del SP (tras `AS BEGIN`):

```sql
/*-- Pulso:
...
*/
```

Consultas muy simples:

```sql
-- Pulso: ...
```

Tope de referencia: **~1000 caracteres útiles** (límite del parser de arquitectura).

---

## 4. Estructura estándar

Orden conceptual:

```text
TIPO
PROPÓSITO
GRANULARIDAD
USAR CUANDO
NO USAR PARA
PARÁMETROS
INTERACCIÓN
RESULTADO
REGLAS
```

No todos los apartados son obligatorios. Prioridad: lo que permita **seleccionar y ejecutar** bien.

Prioridad de contenido si hay que recortar:

```text
P0  PROPÓSITO + GRANULARIDAD + USAR CUANDO
P1  NO USAR PARA
P2  PARÁMETROS (+ enums)
P3  INTERACCIÓN
P4  RESULTADO
P5  REGLAS
```

---

## 5. TIPO

| Tipo | Uso |
|------|-----|
| **CATALOGO** | Maestros (vendedores, sucursales, marcas, rubros…). Auxiliar para resolver IDs. |
| **INDICADOR** | KPI / total / resumen (una o pocas filas). |
| **ANALISIS** | Agrupado / segmentado por dimensiones. |
| **INFORME** | Detalle tabular (listados, movimientos). |
| **AUXILIAR** | Apoyo para ejecutar o interpretar otra herramienta. |

Conviene que el bloque **empiece** con `TIPO: ...` (el API lo incluye en `descripcion`; no hay campo aparte).

---

## 6. PROPÓSITO / USAR CUANDO / NO USAR PARA

- **PROPÓSITO:** qué pregunta de negocio responde (no “hace JOIN con FACT0003”).
- **USAR CUANDO:** intenciones del usuario (no listas artificiales de keywords).
- **NO USAR PARA:** exclusiones claras cuando ayuden a no confundir con otros SP. No inventar limitaciones.

---

## 7. GRANULARIDAD

La granularidad define **qué representa cada fila o unidad principal del resultado**. Es el criterio prioritario para elegir entre SP que consultan el mismo dominio (por ejemplo varias consultas de ventas).

Debe responder: **¿a qué nivel está agrupado o consolidado el resultado?**

El nombre físico del SP no reemplaza esta definición. Ante “ventas”, el modelo no debe quedarse con la coincidencia de la palabra ni con `dash_ventas_por_sucursal` si el usuario pidió un total del período o un detalle día por día.

Ejemplos de intención:

| Pregunta | Granularidad |
|----------|----------------|
| ¿Cuánto vendimos en julio? | **PERÍODO** — una fila consolida el rango |
| Mostrame las ventas día por día de julio | **DÍA** — una fila por fecha |
| ¿Cuánto vendió cada sucursal? | **SUCURSAL** — una fila por sucursal |
| ¿Cuánto vendió cada vendedor? | **VENDEDOR** — una fila por vendedor |

Declararla en el bloque, junto con el uso y la exclusión:

```text
PROPÓSITO: devuelve el resumen consolidado de ventas de un período.
GRANULARIDAD: PERÍODO. Una única fila representa todo el rango solicitado.
USAR CUANDO: el usuario solicite totales o indicadores generales de ventas.
NO USAR PARA: ventas día por día ni desgloses por sucursal o vendedor.
```

Otros ejemplos (no es un enum cerrado; puede haber marca, zona, medio de pago, clasificación de cliente, etc.):

```text
GRANULARIDAD: PERÍODO. Una única fila consolida todo el rango solicitado.
GRANULARIDAD: DÍA. Una fila por fecha.
GRANULARIDAD: SUCURSAL. Una fila por sucursal.
GRANULARIDAD: VENDEDOR. Una fila por vendedor.
GRANULARIDAD: CLIENTE. Una fila por cliente.
GRANULARIDAD: ARTÍCULO. Una fila por artículo.
GRANULARIDAD: RUBRO. Una fila por rubro.
GRANULARIDAD: COMPROBANTE. Una fila por comprobante.
```

Documentarla siempre que distinga el SP de otras herramientas de la misma métrica o dominio.

---

## 8. PARÁMETROS

Documentar todos los de **entrada** (no OUTPUT):

- Nombre (con o sin `@`; el runtime acepta ambos).
- Significado de negocio.
- Obligatoriedad / default / comportamiento si se omite.
- **Enums:** literales **exactos** del SP (ej. `TODAS`, `FACTURADAS`, `PEDIDOS`).

### Fechas (obligatorio en el estándar)

Parámetros de período / fecha:

- Formato de valor: **`dd/MM/yyyy`** (ej. `03/07/2026`).
- Documentar en PARÁMETROS e INTERACCIÓN (pedir período en lenguaje de negocio; el agente convierte a este formato).

Ejemplo:

```text
PARÁMETROS: @DesdeFecha y @HastaFecha obligatorias (dd/MM/yyyy), período inclusivo.
INTERACCIÓN: si faltan fechas, solicitar el período; no pedir el formato técnico al usuario.
```

---

## 9. INTERACCIÓN y catálogos

- Qué preguntar si falta información.
- Qué opciones ofrecer (enums en lenguaje de negocio).
- Si el usuario da un **nombre** y el SP pide **ID**: usar un SP CATALOGO antes; no pedir códigos internos.

---

## 10. RESULTADO y REGLAS

- Métricas y significado de negocio de las columnas. El nivel de cada fila ya quedó en **GRANULARIDAD**; no hace falta repetirlo salvo un matiz.
- Reglas reales del SP (NC, signos, filtros, etc.).

SP sin parámetros:

```text
Sin parámetros de entrada: ejecutar directamente, sin solicitar filtros al usuario.
```

---

## 11. Qué no incluir

- Listas “Palabras clave: …” como mecanismo principal.
- SQL / joins / tablas sin valor de negocio.
- Inventar sinónimos, parámetros o reglas.
- Pedir IDs al usuario si hay catálogo.

---

## 12. Ejemplo

```sql
/*-- Pulso:
TIPO: INDICADOR.
PROPÓSITO: resume indicadores principales de ventas de un período.
GRANULARIDAD: PERÍODO. Una única fila representa todo el rango solicitado.
USAR CUANDO: el usuario pida totales, margen, unidades o ticket del período.
NO USAR PARA: ventas día por día ni desgloses por cliente, artículo, rubro, vendedor o sucursal.
PARÁMETROS: @DesdeFecha y @HastaFecha obligatorias (dd/MM/yyyy), período inclusivo.
INTERACCIÓN: si faltan fechas, solicitar el período.
RESULTADO: comprobantes, unidades, ventas netas, margen, IVA, percepciones y tickets.
REGLAS: TicketComercial = VentasNetas / CantComprobantes; MargenPorcentaje = Margen / VentasNetas * 100.
*/
```

---

## 13. Criterio de aceptación

Un modelo, leyendo solo el comentario Pulso + firma de parámetros, debe poder:

1. Saber qué resuelve, a qué granularidad, y cuándo elegirlo frente a SP del mismo dominio.
2. Completar / omitir parámetros y enums.
3. Saber qué preguntar o resolver por catálogo.
4. Interpretar el resultado y reglas relevantes.

---

## 14. Relación con el front

- Catálogo runtime: `GET /SPs_arquitectura` → `descripcion` = texto Pulso.
- Comportamiento del agente: [`src/lib/pulso/systemPrompt.ts`](../src/lib/pulso/systemPrompt.ts).
- API / caché: [`docs/PULSO_API.md`](./PULSO_API.md).
