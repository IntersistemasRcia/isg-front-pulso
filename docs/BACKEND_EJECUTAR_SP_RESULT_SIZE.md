# Backend: tamaño de resultados en `POST /ejecutar-sp`

Prompt listo para pegar en el agente del repo **isg-api-pulso** (rama `develop`).

El front Pulso ya consume este contrato: con `totalRows` real + `truncated` deja de hacer un segundo fetch de todo el listado solo para saber el COUNT.

---

## Prompt para isg-api-pulso

```
Trabajá en isg-api-pulso (ASP.NET Core, Dapper, SQL Server), rama develop.

Objetivo
--------
Hacer que POST /api/v1/pulso/ejecutar-sp (o la ruta real equivalente) devuelva
SIEMPRE un wrapper JSON con tamaño de resultado confiable, para que el front
Pulso pueda:
- mostrar un adelanto de hasta 50 filas,
- decir el TOTAL REAL (ej. 1962 marcas) sin traer 1962 filas en la 1ª llamada,
- pedir Excel completo solo cuando el usuario lo pide.

NO inventar endpoints de “análisis” por SP. El conteo sale de ESTA ejecución.

Contrato de request (camelCase, System.Text.Json)
-------------------------------------------------
{
  "nombreSp": "sp_ISG_Vision_GetMarcas",
  "parametros": { ... },          // opcional
  "limiteFilas": 50               // int? opcional; null/omitido = sin tope
}

Contrato de response 200 (SIEMPRE este shape; breaking change OK)
----------------------------------------------------------------
{
  "ok": true,
  "rows": [ /* 0..N objetos */ ],
  "totalRows": 1962,
  "truncated": true,
  "limiteFilas": 50,
  "totalRowsExact": true
}

Campos:
- rows: filas materializadas en la respuesta (nunca más que limiteFilas si vino N).
- totalRows: cantidad total del resultado del SP para esa ejecución.
- truncated: true si había más filas que las devueltas en rows.
- limiteFilas: eco del pedido (o null si no hubo límite).
- totalRowsExact: true si totalRows es el COUNT real; false si solo conocés
  rows.Count / el tamaño del lote (legacy / fallback).

Reglas obligatorias
-------------------
1) Sin limiteFilas (null/omitido):
   - Devolver todas las filas (con un cap de seguridad configurable, ej. 50_000;
     si se corta por cap: truncated=true y totalRows=COUNT o al menos el cap).
   - totalRows = cantidad total.
   - truncated = false (salvo cap de seguridad).
   - totalRowsExact = true si pudiste contar; si solo bufferizaste todo en memoria,
     totalRows=rows.Count y totalRowsExact=true.

2) Con limiteFilas = N (>0):
   - Materializá como máximo N filas en "rows".
   - Preferí IDataReader / streaming y Take(N+1) para saber si hay más sin
     cargar el dataset entero en RAM.
   - Si había más de N:
       truncated = true
       totalRows = COUNT REAL del mismo resultado (misma ejecución / misma query).
       totalRowsExact = true
   - Si no podés hacer COUNT sin second pass costoso:
       truncated = true
       totalRows = rows.Count   // tamaño del lote
       totalRowsExact = false   // OBLIGATORIO: el front NO usará este número
                                // como “hay 51 marcas”
   - NUNCA digas totalRowsExact=true cuando totalRows == N y truncated=true
     sin haber contado de verdad (eso es lo que hace mentir al chat con “51”).

3) Cómo obtener COUNT real (elegí la opción más barata que funcione):
   A) Ideal: una sola pasada con window COUNT(*) OVER() si el SP/result set
      lo permite, y devolver solo N filas + el count de la primera fila.
   B) Si el SP ya devolvió un result set: leer N+1; si hay overflow, ejecutar
      un COUNT compatible (mismo filtro) o un segundo reader liviano.
   C) Fallback: truncated=true + totalRowsExact=false (sin inventar totales).

4) Auth / seguridad sin cambios: solo sp_ISG_Vision_*, JWT igual que hoy.
5) Errores 400/500 siguen { "error", "detalle" } (o el shape actual del proyecto).
6) Compat: si hoy devolvés array crudo [], dejá de hacerlo. El front ya parsea
   el wrapper; el array crudo fuerza totalRows=length y truncated=false (malo).

Archivos típicos
----------------
- DTO request: agregar LimiteFilas
- DTO response: Ok, Rows, TotalRows, Truncated, LimiteFilas, TotalRowsExact
- SqlEjecutorService / EjecutorController: aplicar límite + metadata

Aceptación (Postman / integración)
----------------------------------
1) GetMarcas sin limiteFilas → ok, truncated=false, totalRows≈1962, rows.Length≈1962
   (o cap documentado).
2) GetMarcas con limiteFilas=50 → rows.Length<=50, truncated=true,
   totalRows≈1962, totalRowsExact=true.
3) SP chico (3 filas) con limiteFilas=50 → rows=3, truncated=false,
   totalRows=3, totalRowsExact=true.
4) Si el COUNT falla → truncated=true, totalRowsExact=false (nunca totalRows=50
   presentado como exacto).
5) No romper prefijo Vision ni JWT.

Fuera de alcance (fase 2, no bloqueante)
----------------------------------------
- Generar Excel en el API (streaming) y devolver solo exportId/url.
- Endpoint soloMetadatos. Con totalRowsExact en el probe alcanza para el front.
```

---

## Cómo lo usa el front (Pulso)

| Situación | Front |
|-----------|--------|
| `totalRows ≤ 50`, no truncated | Tabla completa, sin Excel |
| `truncated` + `totalRowsExact` + total > 50 | Adelanto 50 en pantalla, total exacto en el texto, **sin** Excel hasta `modoResultado=completo` |
| `truncated` + `totalRowsExact=false` | Adelanto 50, decir “más de 50”, ofrecer Excel completo |
| `modoResultado=completo` | Fetch sin límite + Excel si > 50 filas |

Código: `src/lib/pulso/resultSizeGate.ts`, `src/lib/pulso/tools.ts`, `src/lib/pulso/listadoUiPayload.ts`.
