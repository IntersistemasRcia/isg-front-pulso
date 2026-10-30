# Backend: tamaño de resultados en `POST /ejecutar-sp`

**Este documento se fusionó en [`PULSO_API.md`](./PULSO_API.md)** (sección *Gate de resultados grandes* + *Estado de contratos en isg-api-pulso*).

Resumen vigente:

- Wrapper con `totalRows` / `truncated` / `totalRowsExact` / `limiteFilas` **ya está** en `isg-api-pulso` `develop`.
- Front: probe con `limiteFilas: 50` (`RESULT_LARGE_THRESHOLD`); no inventar “51” si `totalRowsExact=false`.
- Cap sin límite en API: `MaxFilasSinLimite` (default 50000).

No uses este archivo como fuente de verdad; actualizá solo `PULSO_API.md`.
