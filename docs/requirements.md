# Requisitos

MAX Sport Manager es un ERP y punto de venta para una tienda de calzado deportivo. Comparte una sola base de datos para que inventario, compras, ventas y finanzas concilien.

| Área                   | Resultado esperado                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventario y compras   | Registrar un modelo una vez y cargar tallas 28–44 en una matriz con cantidades, costos y precios editables por talla. La recepción confirmada crea existencias, lotes FIFO y movimientos. Las alertas se configuran por variante. |
| POS y clientes         | Buscar por modelo o SKU, seleccionar talla con disponibilidad real, dar de alta al cliente desde el POS y confirmar descuentos, cobros mixtos y vuelto con comprobante.                                                           |
| Apartados              | Reservar pares, recibir anticipos multimoneda, calcular saldo, gestionar vencimiento o cancelación y reconocer la venta al entregar.                                                                                              |
| Cambios y devoluciones | Usar la venta de origen, limitar las unidades devueltas, ajustar existencias y costos según el estado del par y conciliar reembolsos o diferencias.                                                                               |
| Finanzas               | Desglosar USD, COP, VES y USDT por cuenta. Mantener separados ventas, cobros, anticipos, pagos a proveedores, gastos, otros ingresos y transferencias. Consultar reportes diarios sin cierre obligatorio.                         |
| Reportes y catálogo    | Filtrar por período y dimensiones del negocio, conciliar totales y exportar. El catálogo PDF contiene tallas disponibles y datos públicos, sin imágenes.                                                                          |
| Acceso y auditoría     | Usar sesión en cookie segura, autorización por acción y auditoría de cambios críticos. El administrador controla el acceso a costos y margen.                                                                                     |

La web usa español y funciona con teclado, recursos móviles desde 360 px y estados claros de carga, error y falta de datos. La API valida cada acción en servidor. PostgreSQL es la fuente de verdad para sesiones, inventario y dinero. Los confirmados solo se corrigen mediante eventos trazables.

La Fase 0 levanta el monorepo, la primera migración, la sesión básica y la estructura responsive del panel. [El contrato maestro](MASTER_PROMPT.md) y [el plan por fases](02_PROMPTS_POR_FASES.md) detallan la implementación restante.
