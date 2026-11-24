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

## Resultado de la Fase 3

- El POS permite vender tallas con stock disponible, crear un cliente desde el carrito y guardar descuentos y cobros en USD, COP, VES y USDT. El historial ofrece filtros, detalle y un comprobante imprimible o descargable.
- Una venta de dos pares cobró 80.000 COP y 2.728 VES por USD 88,20 después de descuentos. El costo FIFO fue de USD 42 y la utilidad bruta de USD 46,20. Las peticiones repetidas devolvieron el mismo comprobante y dos compras concurrentes por la última unidad disponible dejaron intacta la unidad reservada.
- La migración se aplicó en PostgreSQL 17.12 tanto en una base nueva como en una copia de la Fase 2. Pasaron 20 pruebas unitarias y de humo y 17 de integración.
- Se verificaron cinco rutas web y una venta completa con reintento, historial y salida de stock a través del proxy de Vite en la base actualizada. La revisión visual quedó pendiente por indisponibilidad del navegador integrado.

## Resultado de la Fase 4

- Apartados reserva tallas, conserva el precio, acepta abonos multimoneda y registra una sola venta al entregar. En el caso USDT y COP se aplicaron USD 10 y USD 40 al comprobante y se registraron dos entradas de caja en total. La cancelación y el cierre por vencimiento liberaron las tallas con las políticas de reembolso y retención verificadas.
- La devolución parcial recuperó el costo del lote original cuando el par volvió al inventario. La devolución del par defectuoso conservó su costo y el reembolso concurrente solo se registró una vez. Los cambios de talla cobraron o devolvieron la diferencia según el precio del reemplazo.
- La migración se aplicó a una base PostgreSQL 17.12 nueva y a una copia de la Fase 3. Por HTTP se verificaron nueve rutas web y el ciclo de reserva, entrega, devolución y reingreso mediante el proxy de Vite.
- Pasaron 22 pruebas unitarias y de humo y 22 de integración. Pasaron lint, formato, verificación de tipos, compilación y validación de Prisma. La revisión visual quedó pendiente por indisponibilidad del navegador integrado.

## Resultado de la Fase 5

- Finanzas reúne movimientos de ventas, apartados, compras y devoluciones. Muestra saldos históricos por cuenta, cuentas por cobrar y pagar, gastos por categoría, rentabilidad y un reporte diario que se puede consultar e imprimir con la caja abierta.
- En la prueba de conciliación se reconocieron USD 100 de ventas netas, USD 40 de costo FIFO, USD 12 de gastos y USD 48 de utilidad neta estimada. El flujo operativo fue de USD 71. La transferencia redujo en USD 0,50 el valor histórico de los saldos consolidados.
- La migración se aplicó a una base PostgreSQL 17.12 nueva y a una copia de la Fase 4. Se verificaron por HTTP quince rutas web, saldos, deudas, reporte diario, transferencia idempotente y reverso.
- Pasaron 25 pruebas unitarias y de humo y 25 de integración. Pasaron lint, formato, verificación de tipos, compilación y validación de Prisma. El adaptador emitió un aviso de compatibilidad futura con `pg` 9 durante las pruebas. La revisión visual quedó pendiente por indisponibilidad del navegador integrado.

## Resultado de la Fase 6

- **Inicio** y **Reportes** consultan ventas, caja, inventario, compras, apartados y devoluciones en la zona horaria de la tienda. Incluyen comparación con el período anterior, series por día, semana o mes, alertas por talla y modelos agotados. Los reportes se descargan en CSV, XLSX y PDF según los permisos.
- En el caso de prueba, dos ventas con cobros separados y una devolución produjeron USD 120 de ventas netas, USD 44 de costo FIFO y USD 76 de utilidad bruta. La cuenta COP recibió 200.000 COP, equivalentes a USD 50. Se comprobaron alertas en las tallas 39 y 40, un modelo agotado y una jornada de 23 horas durante el cambio de hora.
- La migración se aplicó en una base PostgreSQL 17.12 nueva y en una copia de la Fase 5. Se comprobaron por HTTP las tres rutas web, las seis secciones, los tres formatos y una descarga histórica idéntica al catálogo que se guardó. Se revisaron los PDF generados, incluido un catálogo de cuatro páginas sin imágenes.
- Pasaron 28 pruebas unitarias y de humo y 29 de integración. Pasaron lint, formato, verificación de tipos, compilación y validación de Prisma. La integración mantiene el aviso de compatibilidad futura del adaptador con `pg` 9. La revisión visual de la web queda pendiente por indisponibilidad del navegador integrado.

## Verificación de la Fase 7

- Pasaron las dos pruebas de Playwright con Edge. El flujo combina navegador y API para recorrer compra COP, recepción idempotente, POS con COP y VES, apartado con USDT y COP, entrega, devolución, gasto, reportes y catálogo PDF. Conciliaron USD 95 de ventas netas, USD 41 de costo, USD 42 de utilidad neta estimada y USD 73 de flujo de caja. Se comprobó la descarga CSV con el nombre de la API y el alcance de datos y permisos de un vendedor.
- A 360 px se probaron el menú por teclado, el foco del enlace de salto, la matriz de tallas y las rutas principales sin desbordamiento horizontal. Se revisaron capturas de Inicio y la matriz. Se corrigieron los nombres accesibles del menú y selectores de compras y POS.
- Se aplicaron las siete migraciones en dos bases dedicadas de PostgreSQL 17.12. `pnpm test` pasó 28 pruebas unitarias y de humo, y `pnpm test:integration` pasó 29 pruebas. Pasaron `pnpm lint`, `pnpm build`, `pnpm db:validate` y la validación de Docker Compose con `.env.example`. Prettier pasó sobre los archivos del repositorio. El chequeo desde `.` encontró un directorio inaccesible de herramientas locales dentro de `.local/phase6-pdf`.
- En la API local con configuración de producción se comprobó la cookie `Secure`, `HttpOnly` y `SameSite=Lax`, el rechazo de una mutación sin el origen configurado, el acceso anónimo denegado y la revocación al cerrar sesión. Los registros observados excluyeron la contraseña y la cookie. Se mantiene el aviso de compatibilidad futura del adaptador con `pg` 9.
- Se documentaron el [despliegue y la recuperación](operations.md), la [operación diaria](operator.md) y la preparación de la base de Playwright en el [README](../README.md). El 24 de noviembre de 2026 se generó un respaldo lógico con `pg_dump` 17.12, se verificó su SHA-256 y se restauró en una base vacía de QA con `pg_restore` 17.12. Coincidieron los datos de 39 tablas, 4 secuencias y las 7 migraciones. El respaldo contiene 6 ventas, 18 saldos de variantes y 23 movimientos monetarios.
- A través de un proxy HTTPS local con certificado de prueba se comprobaron la salud de la API, el acceso y la revocación de sesión en la base restaurada. Coincidieron un comprobante de USD 90, el inventario de las tallas 38 a 40, el reporte diario con USD 285 en ventas netas, USD 138 de utilidad neta estimada y USD 201 de flujo de caja, y el PDF histórico byte por byte. Después de la comparación se revocaron las 15 sesiones históricas de la copia restaurada.
- La web migró a PrimeVue 4.5.5, Aura 2.0.3 y PrimeIcons 7.0.0 con licencia MIT. La compilación funciona sin una clave de PrimeUI y Edge cargó la interfaz sin mostrar el aviso de licencia. [Licencia y mantenimiento de PrimeVue](https://github.com/primefaces/primevue)
- Se validó la configuración con Caddy 2.11.9 y se sirvió la aplicación compilada desde un único origen HTTPS de QA. Se comprobaron la redirección 308, la carga directa de Reportes, los recursos JS y CSS, la caché y el reenvío a la API. En Edge pasaron el inicio y cierre de sesión con cookie segura y la descarga de un CSV. El certificado de QA se verificó con la CA local. Queda ejecutar la comprobación con el dominio y el servidor de despliegue. [Caddyfile](../deploy/Caddyfile)
- Después de la migración de PrimeVue se repitieron las 28 pruebas unitarias y de humo, las 29 de integración en PostgreSQL y las 2 de Playwright en Edge, todas aprobadas. Pasaron `pnpm lint` y `pnpm build`. Vite avisó que el archivo JavaScript inicial tiene 549 kB minificados y 143 kB comprimidos con gzip.
- El Chromium empaquetado por Playwright no estaba instalado en el entorno de QA. Se usó `PLAYWRIGHT_CHANNEL=msedge` y se detuvieron los dos servidores locales de prueba manualmente porque el cierre de Playwright quedó esperando en Windows.
