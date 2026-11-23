# MAX Sport Manager

- Lee `docs/MASTER_PROMPT.md`, `docs/02_PROMPTS_POR_FASES.md` y los documentos de dominio antes de tocar un flujo. Comprueba en `docs/roadmap.md` el alcance de la fase actual.
- Usa pnpm en la raíz del monorepo. Mantén los contratos HTTP de API y web en `packages/shared`, las reglas de negocio en la API y el cliente HTTP en un solo lugar de la web.
- Registra dinero con `Decimal`, importes originales y equivalentes históricos en USD. La convención es `1 USD = X unidades`. Solicita una tasa explícita en toda operación no USD y congela la tasa al confirmar. Conserva la separación entre ventas, cobros, anticipos, compras, gastos, COGS y transferencias.
- Controla inventario por variante y talla. `disponible = físico − reservado`. Confirma operaciones de inventario y dinero en transacciones atómicas e idempotentes. Conserva trazabilidad y usa reversos para corregir operaciones confirmadas.
- Aplica autorización en la API y restringe datos devueltos según permiso. Conserva contraseñas, tokens y datos sensibles fuera de auditoría y logs. Usa migraciones Prisma revisadas y ejecuta pruebas de integración en una base dedicada.
- Actualiza documentación, pruebas y contratos afectados por cada fase. Ejecuta `pnpm lint`, `pnpm test` y `pnpm build`. Registra resultados reales y pendientes antes de avanzar. Los datos de demostración pertenecen a desarrollo.
