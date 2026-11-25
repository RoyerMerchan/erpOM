# Guía del operador

## Preparar la tienda

1. En **Configuración** revisa el nombre, zona horaria, umbral de stock y política de cancelación de apartados.
2. Registra proveedores, clientes cuando aplique, cuentas por moneda y tasas vigentes. Verifica la convención `1 USD = X unidades`. Revisa la tasa de cada importe distinto de USD en la vista previa antes de confirmar.
3. En **Usuarios y roles**, asigna a cada persona un usuario y una contraseña temporal junto con su rol. Cada operador entra con su usuario y contraseña y puede consultar su usuario en **Mi cuenta**.

## Operación diaria

| Tarea                 | Pasos                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recibir mercancía     | En **Inventario → Agregar existencia**, elige proveedor y moneda. Busca la marca y el modelo o créalos desde el formulario. Marca las tallas e indica cuántos pares llegaron, el costo por par y el precio de venta. Pulsa **Continuar a recepción** y luego **Confirmar recepción**. Registra cada pago real al proveedor en el detalle de la compra. |
| Vender                | En **Ventas → Punto de venta**, busca el modelo y agrega las tallas disponibles. Selecciona cliente si aplica. Ingresa descuentos, cuentas, importes y tasas de cada cobro. Revisa total, saldo y vuelto, y confirma. Recupera el comprobante en **Ventas → Historial**.                                                                               |
| Apartar y entregar    | En **Apartados**, selecciona cliente y talla, confirma la reserva y registra cada abono. Entrega al completar el saldo. Para cancelación o vencimiento, revisa la política del apartado y registra el motivo.                                                                                                                                          |
| Cambiar o devolver    | Abre el comprobante original en **Ventas → Historial**, selecciona el par y registra si vuelve al inventario o quedó defectuoso. Si hay un cambio, selecciona la talla de reemplazo. Verifica la diferencia, el reembolso y la cuenta correspondiente antes de confirmar.                                                                              |
| Conciliar             | En **Finanzas → Reporte diario**, elige fecha y revisa saldos de apertura, cobros, anticipos, egresos y saldos resultantes. Usa **Movimientos** para llegar al documento de origen. Registra gastos y transferencias cuando ocurran y usa el reverso autorizado para corregir un registro confirmado.                                                  |
| Compartir un catálogo | En **Catálogo PDF**, filtra los modelos y tallas disponibles, elige los precios en USD o ingresa la tasa para la moneda elegida y descarga el archivo. Si necesitas recuperar exactamente esa versión más adelante, guárdala en el historial.                                                                                                          |

Si pierdes la conexión después de confirmar, vuelve al listado o al detalle y revisa el estado del documento antes de iniciar otra operación. Para diferencias de stock o caja, anota comprobante, cuenta, talla y fecha y consulta el movimiento de origen antes de registrar un ajuste.

## Leer las existencias

El inventario lleva una fila por marca, modelo, talla y, cuando aplica, color. Por ejemplo, Nike Revolution talla 38 y Nike Revolution talla 39 se cuentan por separado. El sistema llama variante a cada combinación y la crea al recibir la mercancía.

**Físico** es lo que hay en tienda. **Reservado** es lo comprometido en apartados. **Disponible** es lo que puedes vender. Si tienes 5 pares de la talla 38 y 2 están apartados, te quedan 3 disponibles.
