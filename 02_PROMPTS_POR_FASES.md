# MAX SPORT MANAGER — PROMPTS POR FASES PARA CODEX

## Cómo usarlos

1. Abre una terminal en la carpeta que será el proyecto (`max-sport-manager`) e inicia Codex.
2. Pega el **Prompt Maestro** de `01_PROMPT_MAESTRO.md` una vez, o guárdalo en el repo como `docs/MASTER_PROMPT.md` y referencia esa ruta.
3. Ejecuta los prompts siguientes **uno por uno**. Cada fase debe dejar código probado, no un simple boceto. Para sesiones nuevas, pídele al agente que lea primero `docs/MASTER_PROMPT.md`, `AGENTS.md` y documentación de dominio.
4. No avances a la fase siguiente hasta confirmar el criterio de aceptación de la fase actual. Si hay bugs, resuélvelos antes.

---

## FASE 0 — Arquitectura, reglas y base del monorepo

```text
Lee íntegramente docs/MASTER_PROMPT.md si está disponible; ese documento es la fuente de verdad sobre MAX Sport Manager. Si no existe, utiliza el Prompt Maestro suministrado en esta conversación y guárdalo en esa ruta. Inicializa monorepo pnpm con apps/web (Vue 3 + TS + Vite + PrimeVue + Tailwind + Pinia + Vue Router), apps/api (Node.js + Express + TS + Prisma + PostgreSQL), packages/shared, packages/config. Configura PostgreSQL local con Docker Compose, .env.example, scripts de dev/build/test/lint, validación de variables y manejo de errores. Define el design system base y layout responsive con navegación lateral/móvil; no uses datos falsos de producción. Documenta requisitos, entidades, ER en Mermaid, flujos de compra/venta/apartado/devolución, semántica monetaria, fórmulas y roadmap en docs/, y crea AGENTS.md de convenciones/seguridad. Diseña el esquema Prisma inicial y genera migración. Añade página de login y shell del dashboard, pero no simules módulos completos. Ejecuta comandos de verificación y termina con resumen real, archivos tocados y criterios pendientes. Preserva trabajo existente.
```

**Aceptar:** `pnpm install`, migraciones, desarrollo web/API y tests de humo funcionan; documentación de reglas monetarias y flujos está versionada.

---

## FASE 1 — Usuarios, permisos, configuración y datos maestros

```text
Lee docs/MASTER_PROMPT.md, AGENTS.md y docs/domain.md antes de modificar código. Implementa autenticación segura y RBAC funcional de administrador, gerente, vendedor, inventario y finanzas: permisos tanto backend como frontend, ocultación de costos/utilidades a quien no corresponda, cambio de contraseña y protección básica de sesiones. Crea CRUD validado de marcas, modelos, variantes por talla 28–44, clientes y proveedores. Configuración de tienda, zona horaria, monedas USD/COP/VES/USDT, cuentas monetarias y tasas históricas con convención explícita '1 USD = X unidades'; vista y CRUD de tasa con autor/fecha. Crea infraestructura transversal de auditoría sin secretos y sin falso borrado de transacciones. UI PrimeVue responsive, estados carga/vacío/error, toasts y confirmaciones. Pruebas unitarias y API de autorización, duplicados de SKU y validación de tasa. Ejecuta lint, tests y build; informa resultados y pendientes.
```

**Aceptar:** cada rol solo ejecuta acciones permitidas; se pueden crear clientes, proveedores, marcas, modelos y tasas; cambios críticos dejan auditoría.

---

## FASE 2 — Compras, ingreso masivo por tallas e inventario

```text
Lee la documentación maestra y conserva todo lo anterior. Implementa el flujo real Compras → recepción → stock, con proveedor, factura/referencia, compra en borrador/confirmada/anulada, moneda y tasa histórica por compra, pagos pendientes/parciales/completos, pagos a proveedores y cuentas por pagar. El formulario de ingreso masivo permite crear/seleccionar marca y modelo y marcar las tallas 28 a 44; por talla captura cantidad, costo unitario original y precio de venta USD, con acción 'aplicar a todas las tallas' y excepciones. Mostrar subtotal original, USD histórico, fletes opcionales y vista previa. Confirmar recepción crea movimientos inmutables y lotes FIFO de forma atómica/idempotente; borrador no modifica stock; pago no es gasto operativo ni duplica inventario. Crear inventario por variante: físico, reservado, disponible, precio, costo, última compra, filtros talla/marca/modelo/stock y alertas por talla con umbral configurable. Ajustes manuales solo con motivo, permisos y auditoría. Probar con 3 pares talla 38 a 80.000 COP, 5 talla 39 a 80.000 COP y 7 talla 40 a 84.000 COP, tasa 4.000 COP/USD: 15 pares, 1.228.000 COP, USD 307. Verificar persistencia, concurrencia, redondeos y autorización. Finalizar con test/lint/build y resumen.
```

**Aceptar:** la compra del ejemplo produce exactamente 15 pares con costos USD 20/20/21; se puede recomprar el modelo sin duplicarlo, stock bajo por talla funciona y la tasa nunca cambia retroactivamente.

---

## FASE 3 — POS, ventas multimoneda y rentabilidad de venta

```text
Lee el contrato maestro y modelos existentes. Construye POS web responsive conectado a inventario real: buscar modelo/SKU, seleccionar talla, carrito, stock disponible, cliente opcional o crear en modal, vendedor, descuentos porcentuales/fijos en USD o moneda convertida por tasa explícita, precios/cobros en USD/COP/VES/USDT, múltiples pagos y cuentas por operación, vista previa de saldo y vuelto. Confirmar venta completa SOLO si pagos cubren total; hacer transacción atómica con venta, líneas, pagos, movimientos monetarios, salida de stock, asignación de costo FIFO, cálculo de utilidad bruta y auditoría. Evitar venta de stock reservado, negativo, doble clic o solicitudes repetidas. Historial/detalle/filtros/comprobante; costo/utilidad ocultos a roles no autorizados. Nunca contar cobros dos veces. Crear pruebas de descuentos, cambio, pagos mixtos, redondeo, concurrencia de última unidad, rechazo por tasas faltantes e idempotencia. Correr lint/tests/build y reportar.
```

**Aceptar:** venta pagada con dos monedas baja stock una sola vez, genera cobros correctos por cuenta, fija tasas y calcula utilidad FIFO correctamente.

---

## FASE 4 — Apartados, abonos, cambios y devoluciones

```text
Lee la documentación de MAX Sport Manager. Implementa apartado completo: cliente obligatorio, items/tallas, reserva de stock (no salida física), anticipo multimoneda con tasa histórica, nuevos abonos, saldo pendiente USD, vencimiento opcional, listado/estado/historial, cancelación con liberación de stock y política configurable de reembolso; completar entrega transforma el apartado en venta reconocida una sola vez, reutilizando anticipos sin cobrarlos de nuevo y liberando reserva. Luego implementa devolución y cambio vinculados a venta original: cantidades máximas devolubles, estado del artículo, reentrada de stock/costo según corresponda, salida de nuevo par, diferencia a cobrar/devolver, reembolso a cuenta y moneda documentada, rectificación de venta neta/COGS/utilidad y auditoría. Todas las operaciones deben ser atómicas, idempotentes y protegidas por rol. Cubrir con pruebas: apartado que se entrega, apartado cancelado, devolución parcial, cambio de talla y doble reembolso rechazado. Correr lint/tests/build y reportar.
```

**Aceptar:** apartados no inflan ventas y devoluciones no dejan saldos/stock inconsistentes.

---

## FASE 5 — Finanzas, cuentas, movimientos y conciliación

```text
Lee contratos y flujos maestros. Termina el módulo financiero conectado a operaciones reales: cuentas USD/COP/VES/USDT, saldos por cuenta calculados desde movimientos, cobros de ventas, abonos, pagos a proveedores, gastos por categoría, otros ingresos, devoluciones, transferencias entre cuentas con tipos de cambio históricos, cuentas por cobrar y pagar, y vista de rentabilidad. Evita cualquier doble contabilización; compra de mercancía no es gasto operativo, anticipo no es venta y transferencia entre cuentas no es ingreso. Presenta ventas netas, ingresos cobrados, egresos, COGS, utilidad bruta, gasto operativo, utilidad neta estimada y flujo de caja como conceptos distintos. Crear filtros de día/semana/mes/rango/moneda/cuenta y reporte diario sin requerir cierre. No permitir editar saldos directamente: registrar ajustes/reversiones auditables. Agregar casos de prueba que concilien importes de POS, apartados, compras y devoluciones. Correr lint/tests/build y reportar.
```

**Aceptar:** los movimientos monetarios coinciden con cobros/pagos reales, la utilidad refleja COGS y gastos, transferencias no inflan ingresos.

---

## FASE 6 — Dashboard, reportes, alertas y catálogo PDF

```text
Lee docs/MASTER_PROMPT.md y semántica de indicadores. Construye dashboard y reportes funcionales con filtros consistentes Hoy/Ayer/Últimos 7 días/Esta semana/Semana pasada/Este mes/Mes pasado/Rango personalizado y filtros adicionales relevantes (vendedor, marca, modelo, talla, proveedor, cliente, cuenta, método). Zona horaria configurable; gráficos diarios/semanales/mensuales, sumatorias y comparativas. Indicadores: ventas netas, cobros, pares vendidos, gastos, costo de ventas, utilidad bruta/neta estimada, rentabilidad, stock físico/reservado/disponible, ranking, apartados, stock bajo por talla, cuentas por cobrar/pagar, devoluciones. Permitir exportar reportes CSV/XLSX/PDF donde corresponda. Implementa un GENERADOR DE CATÁLOGO PDF SIN IMÁGENES: marca, modelo, tallas disponibles, precio USD, posibles precios convertidos con tasa elegida para ese PDF, filtros y fecha; no incluir costos/utilidad/stock exacto salvo opción expresa. Descarga funcional y opcional guardar versión histórica. Crear pruebas de agregaciones, período/zonas horarias, restricciones de acceso, PDF y coherencia de sumatorias. Correr lint/tests/build y reportar.
```

**Aceptar:** rangos temporales devuelven sumatorias correctas, alertas son por talla y PDF sin imágenes se descarga y muestra solo datos públicos.

---

## FASE 7 — Auditoría final, QA, responsive y despliegue

```text
Lee el prompt maestro, documentación y estado real del repositorio. Ejecuta una revisión integral del ERP y completa vacíos sin borrar funcionalidades. Audita flujos end-to-end de compra COP con tasa histórica→stock→POS mixto→apartado→entrega→devolución→finanzas→reportes y PDF; prueba concurrencia/idempotencia, reglas de inventario, controles por rol, fechas/zonas horarias, precisión decimal, tasas antiguas, trazabilidad, seguridad básica y auditoría. Corrige bugs; mejora UX responsive desde 360px, formularios de tallas en móvil, navegación, carga/errores y accesibilidad; elimina mocks de producción. Añade pruebas E2E, documentación de API, migraciones y despliegue, backup/restore PostgreSQL, variables de entorno y guía del operador. Ejecuta lo posible de lint/tests/build/e2e y anota resultados EXACTOS, errores conocidos y pasos reproducibles. No afirmes que está 100% listo si no pasó las verificaciones.
```

**Aceptar:** se puede seguir la cadena completa desde una compra en pesos hasta el reporte de ganancia en USD sin diferencias inexplicadas.

---

## Prompt breve de seguimiento (para cualquier fase)

```text
Antes de continuar, lee docs/MASTER_PROMPT.md, AGENTS.md y docs/flows.md. Revisa el git diff, el esquema Prisma, migraciones y tests. Dime en qué fase estamos, qué criterios de aceptación están cumplidos, cuáles faltan y los errores verificables. Implementa SOLO los puntos pendientes de la fase actual sin romper los anteriores; ejecuta tests/lint/build y reporta resultados reales. No declares funcionalidades completas si solo tienen interfaz.
```
