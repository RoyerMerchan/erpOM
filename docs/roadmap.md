# Fases

Trabajar en orden según [los prompts por fase](02_PROMPTS_POR_FASES.md). Cada paso requiere pruebas y una revisión de los criterios de aceptación.

| Fase | Entrega                                                     | Criterio principal                                                                 |
| ---- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0    | Monorepo, arquitectura, esquema inicial, login y panel base | Instalación, migraciones, web/API y humo verificables.                             |
| 1    | Usuarios, permisos, catálogos, tasas y auditoría            | Acciones y datos visibles según rol, catálogos editables y cambios trazados.       |
| 2    | Compras, recepción y stock por variante                     | Compra Legend de 15 pares por USD 307, lotes FIFO y alertas por talla.             |
| 3    | POS, pagos y utilidad                                       | Cobro mixto, venta atómica y asignación FIFO frente a concurrencia.                |
| 4    | Apartados, entregas, cambios y devoluciones                 | Reserva, anticipo aplicado una vez y rectificaciones conciliadas.                  |
| 5    | Finanzas                                                    | Cuentas, gastos, transferencias y reporte diario que concilian con operaciones.    |
| 6    | Dashboard, reportes y PDF                                   | Métricas por fecha y exportación de catálogo con datos públicos.                   |
| 7    | Pruebas end-to-end, operación y despliegue                  | Flujos completos probados, seguridad operativa y backup/restauración documentados. |

## Resultado de la Fase 0

- Instalación verificada con Node.js 24.22.3 y pnpm 12.23.0, incluida la repetición con el lockfile congelado. Pasaron `pnpm lint`, `pnpm format:check`, `pnpm typecheck` y `pnpm build`.
- `pnpm db:validate` pasó. `pnpm db:migrate` aplicó la migración inicial en dos bases temporales PostgreSQL 17.12. La segunda ejecución en la base de desarrollo encontró el esquema al día.
- Pasaron 7 pruebas de humo con `pnpm test` y 3 de integración con el script `test:integration` de la API.
- `pnpm dev` levantó la web y la API. Por HTTP se verificaron `/login`, `/dashboard`, el estado de PostgreSQL y, a través del proxy de Vite, inicio de sesión, perfil y revocación al salir.
- `docker compose config --quiet` validó Compose. Docker Desktop no expuso su motor y la ejecución se comprobó con PostgreSQL nativo temporal. La revisión visual queda pendiente porque el acceso al navegador no se pudo completar.
