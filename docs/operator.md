# Guía del operador

## Preparar la tienda

1. En **Configuración** revisa el nombre, zona horaria, umbral de stock y política de cancelación de apartados.
2. Registra proveedores, clientes cuando aplique, cuentas por moneda y tasas vigentes. Verifica la convención `1 USD = X unidades`. Revisa la tasa de cada importe distinto de USD en la vista previa antes de confirmar.
3. En **Usuarios y roles**, asigna a cada persona un usuario y una contraseña temporal junto con su rol. Cada operador entra con su usuario y contraseña y puede consultar su usuario en **Mi cuenta**.

## Operación diaria

| Tarea                 | Pasos                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recibir mercancía     | En **Compras → Nueva compra**, elige proveedor, moneda y modelo. Marca las tallas y usa los valores comunes para cargar pares, costos y precios. Corrige las excepciones por talla, calcula los importes y guarda el borrador. Confirma la recepción para actualizar existencias. Registra cada pago real al proveedor en el detalle de la compra. |
| Vender                | En **Ventas → Punto de venta**, busca el modelo y agrega las tallas disponibles. Selecciona cliente si aplica. Ingresa descuentos, cuentas, importes y tasas de cada cobro. Revisa total, saldo y vuelto, y confirma. Recupera el comprobante en **Ventas → Historial**.                                                                           |
| Apartar y entregar    | En **Apartados**, selecciona cliente y talla, confirma la reserva y registra cada abono. Entrega al completar el saldo. Para cancelación o vencimiento, revisa la política del apartado y registra el motivo.                                                                                                                                      |
| Cambiar o devolver    | Abre el comprobante original en **Ventas → Historial**, selecciona el par y registra si vuelve al inventario o quedó defectuoso. Si hay un cambio, selecciona la talla de reemplazo. Verifica la diferencia, el reembolso y la cuenta correspondiente antes de confirmar.                                                                          |
| Conciliar             | En **Finanzas → Reporte diario**, elige fecha y revisa saldos de apertura, cobros, anticipos, egresos y saldos resultantes. Usa **Movimientos** para llegar al documento de origen. Registra gastos y transferencias cuando ocurran y usa el reverso autorizado para corregir un registro confirmado.                                              |
| Compartir un catálogo | En **Catálogo PDF**, filtra los modelos y tallas disponibles, elige los precios en USD o ingresa la tasa para la moneda elegida y descarga el archivo. Si necesitas recuperar exactamente esa versión más adelante, guárdala en el historial.                                                                                                      |

Si pierdes la conexión después de confirmar, vuelve al listado o al detalle y revisa el estado del documento antes de iniciar otra operación. Para diferencias de stock o caja, anota comprobante, cuenta, talla y fecha y consulta el movimiento de origen antes de registrar un ajuste.
