# Flujos del negocio

## Compra y recepción

1. El operador elige proveedor, fecha, moneda y tasa. Carga referencia, flete y pares en la matriz de tallas. Revisa costos, precios y conversiones antes de guardar.
2. El borrador conserva el documento. La confirmación congela la tasa y crea lotes FIFO, movimientos y existencias en una transacción idempotente.
3. Cada pago registra cuenta, importe y tasa propios. La deuda pendiente se calcula con pagos aplicados al documento. El pago reduce caja, mientras la recepción registra un activo de inventario.
4. La anulación de lotes consumidos usa un flujo correctivo. Las compensaciones quedan vinculadas al documento.

Caso Legend a 4.000 COP por USD. Las tallas 38 y 39 reciben 3 y 5 pares a 80.000 COP. La talla 40 recibe 7 a 84.000 COP. La recepción suma **15 pares, 1.228.000 COP y USD 307**. Los costos unitarios son USD 20, USD 20 y USD 21.

## Venta y cobro

1. El vendedor selecciona variantes disponibles, cliente o consumidor final y aplica los descuentos permitidos. El POS muestra neto, equivalencias, pagos, saldo y vuelto.
2. Cada cobro usa la moneda de la cuenta y su tasa explícita. La venta se puede confirmar cuando los pagos netos cubren el total según la política de centavos.
3. La confirmación bloquea inventario, consume lotes FIFO y crea venta, pagos, movimientos y auditoría juntos. Los reintentos se resuelven con la misma clave de idempotencia. Dos cajas que compiten por el último par solo generan una confirmación.
4. Los reportes reconocen la venta al confirmarla y el flujo de caja al realizar cada cobro. El comprobante deja visibles las monedas e importes aplicados.

## Apartado

1. Un cliente identificado confirma productos, precio USD y vencimiento opcional. La reserva reduce disponible y conserva existencia física.
2. Cada abono registra un anticipo con tasa propia. El saldo es total acordado menos abonos válidos en USD histórico.
3. El saldo cero habilita la entrega. Al entregar se consume físico, se libera reserva, se asigna FIFO y se reconoce una venta que aplica los anticipos existentes una sola vez.
4. Un vencimiento pendiente aparece en el listado y bloquea nuevos abonos y entregas. Un supervisor cierra el vencimiento o cancela el apartado con motivo. En ambos casos se libera la reserva y se aplica la política fijada al crear el apartado.

## Cambio o devolución

1. El operador abre la venta original y selecciona líneas, unidades, motivo, estado del par y autorización. El sistema resta devoluciones previas al calcular el máximo devoluble.
2. Si el par vuelve al inventario, el lote de reposición conserva el costo de su asignación original. Un par defectuoso queda fuera de existencias vendibles y su efecto sobre el costo queda identificado.
3. En un cambio se emite el comprobante del nuevo par, se asigna FIFO y se cobra o devuelve la diferencia. En una devolución se registra el reembolso real con su propia cuenta y tasa.
4. La rectificación de ventas netas, costo, stock y dinero queda ligada al origen. La operación es atómica e idempotente.

## Conciliación y exportación

1. El operador elige un período del calendario de la tienda y, para caja, puede elegir cuenta y moneda. Consulta el origen de cada movimiento en su comprobante.
2. Al registrar un gasto se elige categoría. El operador confirma las cuentas, importes y tasas de la vista previa. Una transferencia crea la salida y la entrada juntas.
3. Un ajuste o reverso conserva el motivo y el responsable. El reverso se aplica en su propia fecha con la tasa del registro original.
4. El reporte diario muestra el saldo inicial, los movimientos del día y el saldo resultante. Se puede consultar con la caja abierta.
5. En **Reportes**, el operador elige una sección, aplica filtros y compara el período con el anterior. Si su rol lo permite, descarga los indicadores y tablas.
6. En **Catálogo PDF**, el operador aplica los filtros de producto y elige USD o indica una tasa para la moneda local. Descarga las tallas disponibles y los precios públicos. Si elige guardar una versión, puede recuperar el mismo PDF desde el historial.
