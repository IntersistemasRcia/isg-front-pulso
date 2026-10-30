# ISG Pulso — Estándar de metadatos de Stored Procedures

**Versión:** 1.4  
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

Tope de referencia: **~3000 caracteres útiles** (límite del parser de arquitectura en isg-api-pulso; front `PULSO_DESC_PROMPT_MAX`).

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

### 9.1 Nombres canónicos `Catalogo_*` (y `Get*` legado)

Los maestros de listado / resolución nombre→ID viven en SQL como:

```text
sp_ISG_Vision_Catalogo_Areas
sp_ISG_Vision_Catalogo_Cajas
sp_ISG_Vision_Catalogo_ConceptosCaja
sp_ISG_Vision_Catalogo_Departamentos
sp_ISG_Vision_Catalogo_Localidades
sp_ISG_Vision_Catalogo_Marcas
sp_ISG_Vision_Catalogo_MediosPago
sp_ISG_Vision_Catalogo_Provincias
sp_ISG_Vision_Catalogo_Rubros
sp_ISG_Vision_Catalogo_Sectores
sp_ISG_Vision_Catalogo_Subrubros
sp_ISG_Vision_Catalogo_Sucursales
sp_ISG_Vision_Catalogo_Vendedores
sp_ISG_Vision_Catalogo_Zonas
```

También pueden existir nombres legado `sp_ISG_Vision_Get*` (p. ej. GetMarcas). El ranking del front reconoce **Get o Catalogo**; la señal primaria es `TIPO: CATALOGO` en el comentario Pulso.

**Mínimo prioritario** con comentario Pulso completo: Rubros, Subrubros, Sucursales, Marcas.

Plantilla mínima para cada uno:

```sql
/*-- Pulso:
TIPO: CATALOGO.
PROPÓSITO: lista el maestro y permite resolver el ID a partir del nombre o código de negocio.
USAR CUANDO: el usuario da un nombre (sucursal, rubro, marca, etc.) y el informe pide ID/código.
NO USAR PARA: informes de ventas, márgenes, stock o reposición.
INTERACCIÓN: ejecutar sin inventar IDs; si hay varias filas posibles, pedir confirmación en lenguaje de negocio.
*/
```

Sin este bloque, el SP puede existir en SQL y aun así quedar fuera del topK o no usarse para resolver IDs.

### 9.2 Reposición vs ventas / MoM

`sp_ISG_Vision_reposicion_por_articulo` es de **reposición / compra** (típicamente `@DiasReposicion` obligatorio).

| Pedido del usuario | SP adecuado |
|--------------------|-------------|
| Evolución, ranking, margen, MoM, totales de ventas | SPs de ventas / margen (granularidad ARTÍCULO, PERÍODO, etc.) |
| Cuánto comprar, días de stock, stock objetivo, reposición | `reposicion_por_articulo` |

No usar reposición para “¿creció o bajó el artículo?” ni ranking de ventas.

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

- Catálogo runtime: `GET /SPs_arquitectura` → `descripcion` = texto Pulso (tope **3000** en API `develop` y `PULSO_DESC_PROMPT_MAX`).
- Comportamiento del agente: [`src/lib/pulso/systemPrompt.ts`](../src/lib/pulso/systemPrompt.ts), pipeline [`src/lib/llm/prepareChatPrompt.ts`](../src/lib/llm/prepareChatPrompt.ts).
- Filtros maestros (nombre → ID): [`src/lib/pulso/masterFilterPolicy.ts`](../src/lib/pulso/masterFilterPolicy.ts).
- API / caché / gate de filas: [`docs/PULSO_API.md`](./PULSO_API.md).
- Multi-LLM / ventana por modelo: [`docs/LLM.md`](./LLM.md).
- Coerción por intención (params con default peligroso): [`src/lib/pulso/paramIntentPolicy.ts`](../src/lib/pulso/paramIntentPolicy.ts).
- Catálogos: preferir `sp_ISG_Vision_Catalogo_*` (`TIPO: CATALOGO`); `Get*` es legado compatible.

### Roadmap — COLUMNAS_UI (no implementado)

Idea futura: metadato Pulso / hint para que la UI muestre un subconjunto de columnas en listados grandes. **Hoy no existe** en runtime ni en el parser; no documentar SPs como si ya lo soportaran.

---

## 15. ParamIntentPolicy (defaults peligrosos)

### Problema

Un parámetro **opcional con default SQL** puede cambiar el resultado si el LLM lo omite o manda el default del SP. Ejemplo: `@TipoRanking = 'IMPORTE'`, `@ObjetivoVentaPct = 80` en `sp_ISG_Vision_rankingventas_por_articulo`. El usuario pide «ordenado por cantidad» / listado completo y obtiene otro corte.

**No** partas el SP en uno por cada valor de enum si PROPÓSITO/GRANULARIDAD son los mismos.

### Capas (orden de garantía)

1. **Metadatos Pulso** (este documento): literales, default y efecto en PARÁMETROS / INTERACCIÓN.
2. **Prompt** (`systemPrompt.ts`): regla corta de interpretación.
3. **Runtime** (`paramIntentPolicy.ts`): **fuerza** el valor según el texto del usuario antes de `ejecutar-sp`. Esta es la red de seguridad.

### Cómo estandarizar un param nuevo

En [`src/lib/pulso/paramIntentPolicy.ts`](../src/lib/pulso/paramIntentPolicy.ts), agregá una o más `ParamIntentRule` al registro `PARAM_INTENT_RULES`:

```ts
{
  id: "mi-sp-modo-x",
  spName: /mi_sp_nombre/i,
  paramKey: "MiParametro",
  whenUser: /frase\s+del\s+usuario/i,
  priority: 20,
  resolve: () => "VALOR_CANONICO",
}
```

Checklist:

1. El comentario Pulso documenta el default y los literales válidos.
2. Hay regla(s) en `PARAM_INTENT_RULES` para cada intención de negocio que pelee con el default.
3. Smoke: texto user → params efectivos esperados tras `applyParamIntentOverrides`.
4. No hardcodear coerción suelta en `tools.ts` (solo llamar `applyParamIntentOverrides`).

También se cierran rangos `*Desde` / `*Hasta` (Rubro, Subrubro, Marca) cuando solo viene un extremo.
