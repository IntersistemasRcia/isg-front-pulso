# ISG Pulso — Estándar de metadatos de Stored Procedures

**Versión:** 1.1  
**Proyecto:** ISG Pulso  
**Objetivo:** Normalizar el comentario `Pulso` en cada SP para que el LLM seleccione y ejecute la consulta correcta.

---

## 1. Objetivo

El comentario Pulso no es solo documentación técnica. Debe dar al modelo información suficiente para:

1. Identificar qué necesidad de negocio resuelve el SP.
2. Seleccionarlo según la pregunta del usuario.
3. Diferenciarlo de SP similares.
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
P0  PROPÓSITO + USAR CUANDO
P1  PARÁMETROS (+ enums)
P2  INTERACCIÓN
P3  RESULTADO
P4  REGLAS
P5  NO USAR PARA / técnico
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

## 7. PARÁMETROS

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

## 8. INTERACCIÓN y catálogos

- Qué preguntar si falta información.
- Qué opciones ofrecer (enums en lenguaje de negocio).
- Si el usuario da un **nombre** y el SP pide **ID**: usar un SP CATALOGO antes; no pedir códigos internos.

---

## 9. RESULTADO y REGLAS

- Qué representa cada fila / granularidad / métricas (negocio).
- Reglas reales del SP (NC, signos, filtros, etc.).

SP sin parámetros:

```text
Sin parámetros de entrada: ejecutar directamente, sin solicitar filtros al usuario.
```

---

## 10. Qué no incluir

- Listas “Palabras clave: …” como mecanismo principal.
- SQL / joins / tablas sin valor de negocio.
- Inventar sinónimos, parámetros o reglas.
- Pedir IDs al usuario si hay catálogo.

---

## 11. Ejemplo

```sql
/*-- Pulso:
TIPO: INDICADOR.
PROPÓSITO: resume indicadores principales de ventas de un período.
USAR CUANDO: el usuario pida totales, margen, unidades o ticket del período.
NO USAR PARA: detalle por cliente, artículo, rubro, vendedor o sucursal.
PARÁMETROS: @DesdeFecha y @HastaFecha obligatorias (dd/MM/yyyy), período inclusivo.
INTERACCIÓN: si faltan fechas, solicitar el período.
RESULTADO: una fila consolidada del período.
REGLAS: TicketComercial = VentasNetas / CantComprobantes; MargenPorcentaje = Margen / VentasNetas * 100.
*/
```

---

## 12. Criterio de aceptación

Un modelo, leyendo solo el comentario Pulso + firma de parámetros, debe poder:

1. Saber qué resuelve y cuándo elegirlo.
2. Completar / omitir parámetros y enums.
3. Saber qué preguntar o resolver por catálogo.
4. Interpretar el resultado y reglas relevantes.

---

## 13. Relación con el front

- Catálogo runtime: `GET /SPs_arquitectura` → `descripcion` = texto Pulso.
- Comportamiento del agente: [`src/lib/pulso/systemPrompt.ts`](../src/lib/pulso/systemPrompt.ts).
- API / caché: [`docs/PULSO_API.md`](./PULSO_API.md).
