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

## Resultado de la Fase 1

- Se agregaron cinco roles con permisos por acción, gestión de personal, cambio obligatorio de contraseña temporal y revocación de sesiones. La configuración de acceso a costos y utilidad queda disponible para los módulos que incorporen esos datos.
- La web ofrece marcas, modelos, variantes de tallas 28–44, clientes, proveedores, ajustes de tienda, monedas, cuentas y tasas. La auditoría registra los cambios junto con quien los realizó. Las correcciones de tasa conservan y enlazan la versión previa.
- `pnpm db:migrate` funcionó en una base nueva y en una copia de la Fase 0 con PostgreSQL 17.12. El administrador existente conservó sus credenciales y recibió los permisos del rol. Se verificaron por HTTP 13 rutas web y las consultas de datos maestros mediante el proxy de Vite.
- Pasaron `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` y `pnpm db:validate`. Pasaron 13 pruebas unitarias y de humo con `pnpm test` y 10 de integración con `pnpm test:integration`.
- La revisión visual quedó pendiente porque el navegador integrado no estaba disponible.

## Resultado de la Fase 2

- Compras incluye borrador, matriz de tallas 28–44, vista previa con flete y tasa, recepción, pagos a proveedores, cuentas por pagar y anulación trazable. Inventario muestra físico, reservado y disponible, alertas por talla y ajustes auditados.
- Legend produjo 15 pares en tres lotes con 1.228.000 COP y USD 307 a 4.000 COP por USD. Los costos unitarios fueron USD 20, USD 20 y USD 21. La confirmación simultánea creó una única recepción. La recompra reutilizó el modelo y sus variantes, y una corrección de tasa conservó los importes previos.
- La migración se aplicó a una base PostgreSQL 17.12 nueva y a una copia de la Fase 1. Por HTTP se comprobaron cinco rutas de la web y el flujo Legend desde el borrador hasta el pago completo, además de un ajuste de entrada.
- Pasaron 16 pruebas de humo y unitarias y 13 de integración. También pasaron lint, formato, verificación de tipos, compilación y validación del esquema Prisma.
- La revisión visual en navegador quedó pendiente porque el acceso al navegador integrado no estaba disponible.
