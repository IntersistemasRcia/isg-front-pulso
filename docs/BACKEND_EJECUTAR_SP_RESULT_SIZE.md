# Backend: tamaño de resultados en `POST /ejecutar-sp`

El front Pulso ya consume el wrapper con `totalRows` / `truncated` / `totalRowsExact`.

## Estado actual (no rehacer)

Ya implementado en `isg-api-pulso`:

- Lectura con `IDataReader` + sentinel `limiteFilas + 1`
- DTO con `TotalRowsExact`
- Controller serializa: `ok`, `rows`, `totalRows`, `truncated`, `limiteFilas`, **`totalRowsExact`**

Pendiente / mejorar:

1. El “COUNT” al truncar **re-ejecuta el SP entero** y cuenta fila a fila (caro en CPU/DB).
2. Sin `limiteFilas` usa `int.MaxValue` (sin cap de seguridad).

---

## Prompt para pegar en el agente de isg-api-pulso

```
Trabajá en isg-api-pulso (ASP.NET Core, Dapper/ADO.NET, SQL Server), rama develop.

Contexto (NO romper lo que ya funciona)
---------------------------------------
POST /api/v1/pulso/ejecutar-sp ya devuelve:
{
  "ok": true,
  "rows": [...],
  "totalRows": N,
  "truncated": true|false,
  "limiteFilas": 50|null,
  "totalRowsExact": true|false
}

SqlEjecutorService ya:
- lee con IDataReader SequentialAccess
- aplica limiteFilas+1 (sentinel) y saca la fila extra
- si truncated, hace un 2.º ExecuteReader del MISMO SP y cuenta todas las filas
  → eso es correctitud OK pero COSTO ALTO (doble ejecución completa del SP)

Objetivo de este cambio
-----------------------
1) Baratar el totalRows cuando truncated=true (evitar 2.º pass completo si se puede).
2) Cap de seguridad cuando limiteFilas es null/omitido (ej. 50_000), para no tumbar RAM.
3) Mantener el contrato JSON actual (camelCase). No inventar endpoints nuevos.

Reglas de negocio (contrato con el front Pulso)
-----------------------------------------------
- Con limiteFilas=N y truncated=true:
  - rows.Length <= N
  - totalRows = COUNT REAL si es posible → totalRowsExact=true
  - si no podés contar de forma fiable → totalRows=rows.Count, totalRowsExact=false
  - NUNCA totalRowsExact=true con totalRows==N cuando truncated=true sin haber contado de verdad
- Sin limiteFilas:
  - devolver filas hasta un cap de seguridad configurable (const o appsettings, default 50000)
  - si chocás el cap: truncated=true, intentar COUNT o totalRowsExact=false
- Auth / prefijo sp_ISG_Vision_ / JWT: sin cambios.

Implementación preferida (en este orden)
----------------------------------------
A) Cap de seguridad (rápido, obligatorio en este PR):
   - Reemplazar int.MaxValue por MaxFilasSinLimite (ej. 50_000) desde config.
   - Si se alcanza el cap → truncated=true y misma lógica de totalRows/totalRowsExact.

B) COUNT más barato cuando truncated (mejorar el 2.º pass actual):
   Opciones aceptables (elegí la más simple que compile y pase tests):
   1) Mantener 2.º pass pero SOLO contar: no materializar Dictionary por fila
      (ya casi lo hacen; asegurate de no llamar GetValue / no alocar filas).
      Documentá que sigue siendo O(N) sobre el SP.
   2) Mejor: si existe forma de COUNT sin re-correr el SP (poco realista para SP
      genéricos) — no inventes wrappers SQL frágiles por nombre de SP.
   3) Timeout / CommandTimeout razonable en el pass de conteo; si falla o tarda
      demasiado → totalRows=rows.Count, totalRowsExact=false (nunca mentir).

NO wraps genéricos tipo SELECT COUNT(*) FROM (SP) — SQL Server no lo permite así
para stored procedures arbitrarios.

Archivos típicos
----------------
- Services/SqlEjecutorService.cs  (lógica)
- appsettings.json / Options  (MaxFilasSinLimite)
- Controllers/EjecutorController.cs  (solo si hace falta; ya expone totalRowsExact)

Aceptación
----------
1) GetMarcas + limiteFilas=50 → rows<=50, truncated=true, totalRows≈1962,
   totalRowsExact=true (o false si el conteo falla, nunca “51 exacto”).
2) SP chico (3 filas) + limiteFilas=50 → truncated=false, totalRows=3, exact=true.
3) Sin limiteFilas en un SP enorme → no supera MaxFilasSinLimite en memoria;
   truncated=true si hubo cap.
4) Logs: si el 2.º pass corre, loguear ms del conteo (Information) para ops.
5) No romper JWT ni el prefijo Vision.

Fuera de alcance
----------------
- Excel en el API
- Cambiar el front Pulso
- Reescribir todos los SP Vision
```

---

## Cómo lo usa el front

| Respuesta API | Front |
|---------------|--------|
| `truncated` + `totalRowsExact: true` + total > 50 | Adelanto 50 + dice el total; Excel solo con `modoResultado=completo` |
| `totalRowsExact: false` | Dice “más de 50”; no inventa 51 |
| `totalRows ≤ 50` | Tabla completa, sin Excel |
