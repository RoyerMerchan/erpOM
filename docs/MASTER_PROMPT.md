# MAX SPORT MANAGER — PROMPT MAESTRO PARA CODEX

> Copia íntegramente este prompt al iniciar el proyecto con Codex. Después ejecuta los prompts de `02_PROMPTS_POR_FASES.md` en orden. La aplicación se debe construir funcionalmente, no solo como una maqueta.

## 1. Tu rol y misión

Actúa como un equipo senior de arquitectura, producto, UX/UI, backend, frontend, QA y seguridad. Construye desde cero **MAX Sport Manager**, un ERP/POS web responsive para una tienda de calzado deportivo que maneja inventario por modelo y talla, compras, clientes, ventas, apartados, cambios/devoluciones, finanzas multimoneda, reportes, auditoría y un catálogo exportable a PDF sin imágenes.

La regla fundamental es que todo módulo comparte un mismo modelo de negocio: no crees datos falsos en producción ni pantallas desconectadas. Trabaja incrementalmente, con migraciones y pruebas, y explica qué funciona al terminar cada etapa. No desarrolles un monolito de archivos gigantes. Si trabajas sobre un repositorio existente, inspecciónalo antes de modificarlo, conserva la configuración útil y no destruyas datos.

## 2. Stack y arquitectura

- Monorepo con **pnpm workspaces**: `apps/web`, `apps/api`, `packages/shared`, `packages/config`; opcional `packages/ui` si aporta valor real.
- Frontend: **Vue 3, TypeScript, Vite, PrimeVue, Tailwind CSS, Vue Router, Pinia**. Usar componentes PrimeVue adaptados a un design system coherente. Formularios tipados y validación; carga y errores claros. Axios/fetch con un cliente API único.
- Backend: **Node.js, Express, TypeScript, PostgreSQL y Prisma ORM**. Validación de contratos con Zod compartido cuando convenga, REST versionada (`/api/v1`), paginación, búsqueda, filtros, manejo centralizado de errores, logs estructurados.
- Autenticación segura con hash de contraseñas, sesión/cookies HttpOnly y permisos por rol. Protección contra inyección, fuerza bruta, escalamiento de privilegios y acceso a datos ajenos.
- Pruebas: Vitest para lógica, Supertest para HTTP, pruebas de integración con PostgreSQL, pruebas E2E para flujos críticos cuando estén habilitadas. ESLint/Prettier y TypeScript estricto.
- `docker-compose.yml` para PostgreSQL local; `.env.example`; scripts de instalación, migración, seed demo (solo desarrollo), desarrollo, build y test. README con instrucciones reproducibles. Preparar despliegue independiente de web y API.
- No fijes versiones antiguas arbitrarias: usa versiones estables y compatibles, documenta por qué y bloquea el lockfile.

## 3. Principios financieros y multimoneda (OBLIGATORIOS)

Moneda contable y de reportes: **USD**. Monedas operativas: **USD, COP (pesos colombianos), VES/BS (bolívares) y USDT**. El usuario puede habilitar/deshabilitar monedas y definir cuentas/canales concretos (p. ej., efectivo USD, caja COP, cuenta bancaria Bs, billetera USDT).

1. Toda operación monetaria guarda: moneda original, importe original, tasa aplicada, sentido de la tasa, equivalente USD, fecha/hora, responsable y referencia a la operación de origen. **No recalcular retroactivamente** compras ni ventas con la tasa de hoy.
2. Convención visible: **1 USD = X unidades de la moneda seleccionada**. Fórmula: `importe_usd = importe_moneda / X`; para USD, X = 1. Ejemplo: 80.000 COP y 4.000 COP/USD = USD 20. Para USDT, la paridad es configurable (puede comenzar en 1); no asumir silenciosamente que siempre equivale a USD 1 en todas las operaciones.
3. Al registrar compra, venta, abono, gasto, transferencia o devolución en moneda no USD se debe usar una tasa explícita guardada en un registro de tasas históricas. Puede precargarse la última tasa disponible para facilitar entrada, pero el usuario debe poder revisar/editar la tasa **antes de confirmar** y el valor usado queda congelado. Si falta tasa, bloquear confirmación con mensaje útil; nunca inventarla.
4. Usar `Decimal` de Prisma / numeric de PostgreSQL o librería decimal para importes y tipos de cambio. Nunca usar `number` de JavaScript para cálculos de dinero críticos. Definir política explícita de redondeo (p. ej. 2 decimales USD al finalizar una línea/documento, alta precisión para tasas y conversiones) y pruebas de casos extremos.
5. Las compras de mercadería aumentan inventario/costo del activo, **no son automáticamente gastos operativos**. Pagar al proveedor sí disminuye el saldo de la cuenta correspondiente. El costo se reconoce como costo de ventas cuando el par se vende.
6. Separar claramente: ventas netas, cobros reales, costo de mercancía vendida (COGS), utilidad bruta, gastos operativos, utilidad neta estimada, flujo de caja, cuentas por cobrar y cuentas por pagar. Las transferencias entre cuentas **no son ventas, ni gastos, ni ganancias**. Los abonos de apartados no son ventas definitivas hasta concretar entrega.
7. No contabilizar dos veces una venta: al confirmar una venta se crean de forma consistente sus pagos/movimientos de caja, movimientos de stock y asignaciones de costo. Los movimientos manuales de finanzas deben ser distintos de los generados por ventas/compras.
8. Si hubo pagos mixtos en distintas monedas, cada pago tiene su propia tasa/conversión; la suma de equivalentes USD cubre el total neto según tolerancia documentada de redondeo. Gestionar vuelto/cambio de forma trazable, sin registrar ingresos ficticios.
9. Las transferencias/cambios entre cuentas de distinta moneda registran cuenta origen, destino, montos reales, cotización utilizada y diferencias de cambio si proceden; no se consideran ingreso operativo. Reportes históricos se basan en USD histórico.

## 4. Entidades mínimas de dominio

- `User`, `Role`, `Permission` o modelo de RBAC equivalente; `AuditLog`.
- `Brand`, `ProductModel`, `ProductVariant` (talla, color opcional, SKU único, precio sugerido/venta USD, estado), `ProductCategory` opcional. Tallas iniciales enteras **28 a 44** (incluidas); posibilidad de ampliar catálogo en el futuro.
- `Supplier`, `Purchase` (borrador/confirmada/anulada), `PurchaseItem`, `GoodsReceipt` si se separa recepción de compra, `SupplierPayment`, `SupplierBalance` derivado.
- `StockMovement` inmutable (tipo: compra, venta, devolución, cambio, ajuste, reserva/liberación cuando corresponda), `InventoryLot` y `SaleCostAllocation` para asignar costo por **FIFO**, controlando lotes y tasas históricas. Permitir cantidades físicas, reservadas y disponibles sin incoherencias.
- `Customer` y direcciones/teléfonos opcionales; cliente eventual **Consumidor final**.
- `Sale`, `SaleItem`, `SalePayment`, `Discount`, `Return/Exchange` y sus líneas/movimientos con referencias a venta original.
- `Layaway`/`Reservation` (`Apartado`), `LayawayItem`, `LayawayPayment`, fecha de vencimiento opcional, estado, saldo y reglas de liberación/cancelación.
- `Currency`, `ExchangeRate`, `MoneyAccount`, `MoneyMovement`, `Expense` (categoría), `OtherIncome`, `AccountTransfer`; documentos fuente y estados.
- `StockThreshold` por variante/talla; configuraciones de tienda, horario, zona horaria, numeración de documentos y de catálogo.

Define relaciones, índices, constraints, claves foráneas, soft-delete cuando proceda y estados explícitos. Crea un diagrama ER en Mermaid y documenta invariantes en `docs/domain.md`.

## 5. Módulo: Dashboard

Vista inicial con filtro global de período: **Hoy, Ayer, Últimos 7 días, Esta semana, Semana pasada, Este mes, Mes pasado, Personalizado**; calendario inicio/fin. La semana y los cortes diarios usan la zona horaria del comercio (configurable, valor inicial America/Caracas). Otros filtros: vendedor, marca, modelo, talla, método de pago, cuenta y estado cuando sean aplicables; botón para limpiar filtros. Mostrar:

- Ventas netas del período (USD), número de ventas y ticket promedio.
- Utilidad bruta, gastos operativos, utilidad neta estimada y margen bruto.
- Cobros recibidos por moneda/cuenta; separar de ventas para evitar confusión.
- Entradas de mercancía, pares vendidos, stock físico/reservado/disponible.
- Alertas de stock bajo **por talla/variante**, y modelos agotados.
- Gráfico de ventas por día/semana/mes según rango; comparación con período anterior.
- Top marcas/modelos/tallas, ventas recientes, movimientos recientes, apartados pendientes y deudas con proveedores/clientes.
- Estados de carga, vacío y error; tarjetas clicables hacia filtros del módulo correspondiente.

## 6. Módulo: Inventario

Página con búsqueda por marca/modelo/SKU, filtros talla, categoría, disponible, bajo stock, agotado y ordenación; tabla con stock físico, reservado, disponible, costo de referencia USD, precio de venta USD, margen estimado, última compra y acciones.

**Alta masiva por tallas:** un formulario registra marca + modelo una sola vez y permite seleccionar múltiples tallas desde la 28 hasta la 44, mediante una matriz editable. Para cada talla: checkbox, cantidad recibida, costo unitario en la moneda elegida y precio de venta USD (o valor común editable por talla). Permite un costo común aplicado a todas las tallas, con excepciones individuales. Omite variantes con cantidad cero salvo registro explícito sin stock. Validar duplicados, números negativos, cantidades enteras, costo/tasa >0 y SKU único. El modelo puede existir previamente y recibir nuevas tallas o reposición.

Una **entrada de mercancía normal proviene de una compra/recepción confirmada** (sección Compras), no de una edición libre de stock. Los ajustes manuales son distintos, requieren motivo y rol adecuado, e impactan `StockMovement`/auditoría. Alertas configurables por talla (valor por defecto por variante, con override), no únicamente por modelo. No permitir vender stock reservado ni permitir stock disponible negativo.

## 7. Módulo: Compras / Entradas de mercancía

Flujo completo:

1. Crear compra o entrada: seleccionar/crear proveedor, fecha del documento, referencia/factura, moneda **USD/COP/VES/USDT**, tasa de esa fecha, cuenta de pago opcional, observaciones, flete/costos adicionales opcionales.
2. Crear o elegir marca/modelo; cargar masivamente tallas **28...44**; cantidad y costo original por talla; posibilidad de aplicar costo masivamente y editar excepciones; elegir precios de venta USD por talla o global.
3. Vista previa: importes por talla, subtotal original, costos adicionales, costo total original, equivalencia en USD y costo unitario USD. Si se incluyen fletes, distribuirlos de manera documentada por cantidad/valor, guardando criterio.
4. Guardar borrador sin impactar existencias; confirmar recepción con transacción de BD. Incrementar stock, crear lotes FIFO y movimientos, congelar tasa, registrar referencia y auditar. La confirmación debe ser idempotente.
5. Registrar compra **pagada, parcialmente pagada o pendiente**; pagos a proveedor con monedas/tasas y cuentas diferentes, sin duplicar gasto ni stock. Mostrar saldo en USD y moneda original cuando corresponda. Compras a crédito no disminuyen caja hasta pagar.
6. Anulación/reversión solo si los lotes no han sido consumidos o mediante flujo correctivo explícito; nunca borrar eventos confirmados sin compensación.

Caso demostrativo: modelo Legend, 15 pares repartidos entre tallas 38=3, 39=5, 40=7; tasas 1 USD=4.000 COP; costos unitarios 80.000, 80.000 y 84.000 COP. Total 1.228.000 COP = **USD 307** (3×20+5×20+7×21=307). Verificar cálculos automáticamente y probarlos. [Nota: este es el total correcto para esos datos].

## 8. Módulo: Ventas / POS

POS responsive con búsqueda rápida de producto/modelo/SKU, selector de talla, indicador de stock disponible, carrito editable, cliente existente o **crear cliente sin salir del POS**, opción consumidor final, vendedor, notas y número de comprobante.

- Precios contables en USD; aplicar descuentos por línea o global, como porcentaje o monto fijo, con política que impida descuentos mayores al precio/total. Puede introducirse monto de descuento en COP/VES u otra moneda si se convierte con la tasa del documento; almacenar equivalente USD y tasa.
- Elegir uno o varios pagos (efectivo USD/COP, pago móvil VES, transferencia, USDT, etc.), cuenta receptora, moneda y tasa en cada pago, importe original y equivalente USD. Mostrar saldo y vuelto claramente.
- Vista previa antes de confirmar: subtotal, descuento, total neto USD, equivalencias locales al tipo de cambio elegido, pago(s), saldo/vuelto, costo de venta y margen (solo si rol permite ver costo).
- Al confirmar, crear venta, líneas, pagos, movimientos financieros, salida de stock, asignación FIFO y auditoría en **una transacción atómica**. Evitar doble clic/doble cobro por idempotencia; concurrencia por bloqueos/transacciones; stock negativo prohibido.
- Imprimir/descargar comprobante sencillo (PDF opcional) y ver historial, filtrar ventas, detalle de pagos, cliente, vendedor, devoluciones y ganancia.
- Diferenciar venta completada de apartado/abono parcial; no permitir que un cobro parcial se convierta accidentalmente en venta completa.

## 9. Módulo: Clientes y Apartados

Clientes: alta/edición, nombre, documento opcional, teléfono, notas y contacto; historial de compras, apartados, devoluciones y saldos. Evitar duplicados razonablemente sin bloquear clientes con datos incompletos.

Apartados: elegir cliente obligatorio, productos/tallas/cantidades, precio fijado en USD, monto inicial en una o más monedas con tasa congelada, fecha de creación/vencimiento opcional, estado (`activo`, `pagado_pendiente_entrega`, `entregado`, `cancelado`, `vencido`), saldo pendiente USD y cronología de abonos. Al crear, reservar stock (disminuye disponible, **no físico**) y registrar cada cobro financiero como **anticipo**, no como ingreso por ventas. Al completar pago y entregar, confirmar venta y salida física de inventario con asignación FIFO, aplicando anticipos sin cobrarlos dos veces. En cancelación: liberar reserva, documentar reembolso/retención solo según política explícita del negocio (configurable, sin suponer penalizaciones), auditar. Alertas de vencimiento y saldos.

## 10. Módulo: Cambios y Devoluciones

- Buscar venta original por número/cliente; seleccionar líneas y cantidades <= vendidas no devueltas.
- Registrar razón, estado del producto (reingresable/no reingresable), autorizador y notas.
- **Devolución:** revertir las unidades pertinentes de inventario y costo, corregir ventas netas/utilidad, devolver dinero a cuenta y moneda especificada con tasa registrada o generar saldo a favor si política lo permite; jamás duplicar reembolso.
- **Cambio de talla/modelo:** entrada controlada de artículo devuelto y salida del nuevo, cobrando diferencia o generando saldo a favor/reembolso cuando corresponda, con detalle y trazabilidad. Si la unidad vuelve a stock, conservar costo original razonablemente mediante asociación a asignaciones/lotes o política documentada.
- Manejar casos de compra con abonos/apartados de forma coherente; operaciones atómicas e idempotentes; prohibir devolver más de lo vendido.

## 11. Módulo: Finanzas

- Visión consolidada **USD** y desgloses por moneda/cuenta. Cuentas iniciales configurables: caja USD, caja COP, banco/pago móvil VES y billetera USDT, sin imponer proveedores concretos.
- Movimientos: cobros de ventas, abonos de apartados, pagos a proveedores, gastos, otros ingresos, transferencias, reembolsos y ajustes autorizados. Cada movimiento lleva cuenta, moneda, importe, tasa, USD equivalente, categoría, fecha, referencia y creador.
- Registrar gastos operativos por categoría (alquiler, servicios, transporte, publicidad, etc.), otros ingresos y transferencias entre cuentas. No duplicar automáticamente el registro económico al guardar el origen.
- Pestañas: Resumen, Movimientos, Ingresos y egresos, Gastos, Cuentas, Cuentas por cobrar, Cuentas por pagar y Rentabilidad.
- Indicadores: ingresos por ventas, cobros, gastos, COGS, utilidad bruta, utilidad neta estimada, margen, dinero neto que entra/sale, saldos por cuenta y proyecciones limitadas a datos reales.
- **Reporte diario sin cierre obligatorio**: generar resumen de ese día cuando se desee; no bloquear operación nocturna ni exigir arqueos/cierres.
- Cambios en importes históricos mediante reverso/corrección trazable; no editar saldos acumulados a mano sin generar movimiento auditable.

## 12. Módulo: Reportes

Filtros reutilizables: hoy, ayer, esta semana, semana pasada, últimos 7 días, este mes, mes pasado, rango personalizado; adicional por vendedor, cliente, marca, modelo, talla, proveedor, cuenta, método, estado y moneda si aplica. Visualización diaria/semanal/mensual con comparativas y sumatorias.

Reportes: ventas brutas/netas y cantidad de transacciones; pares vendidos por modelo/talla; ticket promedio; descuentos; ventas y cobros por método/cuenta/moneda; gastos por categoría; compras/recepciones; costo de ventas; utilidad bruta y neta estimada; margen y rentabilidad por producto/talla; movimiento de stock y stock bajo por variante; inventario valorizado; devoluciones/cambios; apartados activos, vencidos y entregados; pagos pendientes a proveedores; movimientos de caja/cuentas; ranking de productos; comparativa de semanas/meses. Tablas + gráficos sensatos, totales consistentes con filtros, exportación CSV/XLSX/PDF según tipo.

Las operaciones se asignan al período correcto por fecha/hora y tipo de métrica (venta al confirmar/entregar; flujo de caja al cobrar/pagar; gastos al incurrir según política documentada). Explicar en UI diferencias para no comparar cosas incompatibles.

## 13. Catálogo PDF sin imágenes

Generar un catálogo **PDF exportable** del inventario disponible, sin fotografías y sin depender de subir imágenes. Debe incluir marca, modelo, descripción opcional, tallas disponibles, precio de venta USD (opcional presentación en moneda local con una tasa explícita elegida para **ese PDF**, no reescribe precios históricos), fecha de generación, datos de la tienda y un diseño tipográfico atractivo y sobrio. Permitir filtrar marca/modelo/tallas y opción de incluir o no cantidad de stock exacta. No exponer costo ni rentabilidad a clientes. Ofrecer descarga; si el usuario decide guardar versión histórica, registrar metadatos y la ubicación del PDF. Crear PDFs server-side con librería adecuada e incluir pruebas que validen contenido/estructura.

## 14. Auditoría, seguridad y roles

- Roles recomendados: Administrador, Gerente, Vendedor, Inventario y Finanzas/Contabilidad; permisos granulares por acción, no solo por pantalla. El administrador puede configurar visibilidad de costos y ganancias.
- Auditoría de alta/edición de productos, cambio de precios/tasas, compras confirmadas, ajustes de stock, descuentos extraordinarios, ventas, anulaciones, abonos, apartados, devoluciones, movimientos financieros, configuración y acceso sensible. Guardar usuario, fecha/hora, entidad, acción, ID, antes/después saneado, IP si corresponde. No registrar contraseñas, tokens o datos sensibles innecesarios.
- No borrar operaciones confirmadas; permitir correcciones y reversos vinculados. Proteger rutas API y acciones UI, con validación siempre en backend.

## 15. Diseño UX/UI y responsive

Estilo moderno, profesional, minimalista y funcional, con identidad MAX Sport (logotipo configurable). Layout de escritorio con sidebar, topbar y área de contenido; en móvil usar navegación compacta/drawer y tablas que se conviertan en tarjetas o scroll horizontal controlado. Usar PrimeVue DataTable, Dialog, Drawer, Select, MultiSelect, InputNumber, DatePicker, Toast, ConfirmDialog, Tabs y componentes de gráficos adecuados; Tailwind para sistema de espaciado/jerarquía; modo claro por defecto y contraste accesible.

Prioridades: veloces búsquedas, matriz de tallas usable en teléfono, alta de cliente en modal del POS, calculadora de pago multimoneda legible, filtro de fechas coherente en dashboard/reportes, estados de carga/errores, confirmaciones en acciones irreversibles, navegación teclado y feedback al usuario. No generar ilustraciones/fotografías ficticias como sustituto de funcionalidades. Textos y formatos en español, fechas locales, símbolo de moneda claro.

Rutas propuestas:
`/login`, `/dashboard`, `/inventario`, `/inventario/:id`, `/compras`, `/compras/nueva`, `/compras/:id`, `/ventas/pos`, `/ventas`, `/ventas/:id`, `/clientes`, `/clientes/:id`, `/apartados`, `/apartados/:id`, `/devoluciones`, `/finanzas`, `/finanzas/movimientos`, `/finanzas/cuentas`, `/reportes`, `/catalogo`, `/auditoria`, `/configuracion`.

## 16. Flujos end-to-end obligatorios

A. **Compra COP → inventario**: configurar tasa 1 USD=4.000 COP → crear compra a proveedor → seleccionar marca y modelo Legend → cantidades por tallas 38:3, 39:5, 40:7 → costos COP 80.000/80.000/84.000 → verificar COP 1.228.000 y USD 307 → guardar borrador (sin stock) → confirmar recepción (15 pares, tres variantes/lotes, tasa histórica) → si pendiente queda cuenta por pagar, si se paga registra salida de la cuenta indicada.

B. **Venta COP + VES combinada**: buscar modelo → elegir talla con stock disponible → seleccionar o crear cliente → aplicar descuento válido → registrar dos pagos en monedas diferentes con sus tasas → verificar cobertura USD → confirmar de manera atómica → descontar stock, asignar costos FIFO y registrar cobros en cuentas → dashboard, finanzas y rentabilidad reflejan el cambio, sin duplicados.

C. **Apartado**: cliente + producto/talla → abono parcial en USDT → reserva de stock y saldo pendiente → nuevo abono en COP con su propia tasa → completar pago → entregar → venta se reconoce una sola vez, anticipo se aplica, físico baja una sola vez y reserva se libera.

D. **Devolución/cambio**: venta original → devolver una unidad a stock o marcar defectuosa → corregir COGS/ingresos y dinero según política → cambiar por otra talla, cobrando diferencia si aplica → auditoría completa.

E. **Reporte**: filtrar Hoy / Semana / Mes / Rango y obtener ventas, gastos y ganancias consistentes con transacciones; emitir reporte diario sin cerrar caja; generar catálogo PDF sin imágenes únicamente con disponibilidad y precios públicos.

F. **Concurrencia y auditoría**: dos vendedores intentando vender la última unidad: solo uno confirma; reintento de solicitud no duplica movimientos; usuario sin permisos no puede ver costos ni modificar tasa; toda acción crítica se registra en auditoría.

## 17. Entregables, calidad y forma de trabajar

1. Antes de programar, crear `docs/requirements.md`, `docs/flows.md`, `docs/domain.md` (ER Mermaid), `docs/decisions.md`, `docs/api.md`, `docs/roadmap.md`, `AGENTS.md` con este contrato de negocio para futuros agentes; mostrar estructura propuesta.
2. Implementar **módulos incrementales** y verificables, siguiendo `02_PROMPTS_POR_FASES.md`. No simular que algo funciona si aún no tiene persistencia/transacción real; identificar claramente los pendientes.
3. Incluir CRUD, formularios, validación, vistas de listado/detalle, estados vacíos y filtros. Debe haber APIs y permisos funcionales para cada flujo.
4. Usar migraciones Prisma; nunca usar `db push` como estrategia permanente ni resetear producción. Crear seed de demostración separado y seguro.
5. No eliminar comprobantes, compras, movimientos monetarios ni ajustes históricos; usar reversos y auditoría.
6. Documentar fórmulas y semántica de todos los indicadores (venta, cobro, ganancia, gasto, COGS, saldo), así como manejo de devolución, multimoneda y fecha de corte.
7. Al finalizar cada fase: ejecutar linters/tests/build; enumerar comandos y resultados reales, archivos creados, endpoints/pantallas disponibles, pruebas manuales, y próximos pasos. Si una herramienta no está disponible, dilo sin afirmar que se ejecutó.
8. Priorizar producto funcional y consistente sobre animaciones o dashboards decorativos. No pedir confirmación para cada detalle menor; documentar supuestos razonables, pero no inventar tasas, saldo o movimientos.

## 18. Criterios de aceptación globales

- La matriz de tallas soporta 28–44 con bulk edit y excepciones por talla, sin duplicar modelo.
- Cada compra y operación conserva moneda, tasa, USD histórico; tasas nuevas no alteran movimientos pasados.
- Una compra en borrador no modifica stock; recepción confirmada sí; pago a proveedor no duplica el costo de inventario.
- El stock bajo se detecta y filtra **por talla**, se resta la reserva del disponible y nunca se vende por debajo de cero.
- POS permite alta rápida de cliente, descuentos, múltiples pagos y múltiples monedas, con registro contable USD y transacción segura.
- Apartados reservan inventario, reciben abonos, permiten cancelar y terminan en una única venta real.
- Cambios y devoluciones revisten correctamente stock, costos, pagos, ventas y auditoría.
- Los reportes por día/semana/mes/rango concilian con los movimientos, sin cierre de caja obligatorio.
- Catálogo PDF sin imágenes, con solo datos públicos, descargable.
- La aplicación es responsive y accesible; backend/API protegidos por rol; pruebas críticas pasando.

**Empieza por planificación y la Fase 0, no intentes construir todos los módulos sin validaciones intermedias.**
