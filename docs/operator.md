# Guía del operador

## Preparar la tienda

1. En **Configuración** revisa el nombre, zona horaria, umbral de stock y política de cancelación de apartados.
2. Registra proveedores, clientes cuando aplique, cuentas por moneda y tasas vigentes. Verifica la convención `1 USD = X unidades`. Revisa la tasa de cada importe distinto de USD en la vista previa antes de confirmar.
3. En **Usuarios y roles**, asigna a cada persona un usuario y una contraseña temporal junto con su rol. Para entrar, cada operador completa **Usuario** y **Clave de acceso**. Puede consultar su usuario en **Mi cuenta** y contactar al administrador si tiene problemas de acceso.

Para cambiar tu contraseña, abre **Mi cuenta** o edita tu propia ficha en **Usuarios y roles** y pulsa **Cambiar mi contraseña**. Escribe la contraseña actual y confirma la nueva. El cambio cierra tus sesiones. Para restablecer el acceso de otra persona, edita su ficha y completa **Nueva contraseña temporal**. Tendrá que cambiarla al entrar.

## Operación diaria

El icono de información junto al título de cada apartado explica qué puedes hacer allí. Ábrelo con un toque, al pasar el ratón o al enfocar el botón con el teclado. Pulsa Escape o toca fuera para cerrarlo.

| Tarea                 | Pasos                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recibir mercancía     | Usa **Agregar existencia** desde Inventario o Compras. Elige proveedor y moneda, selecciona marca, modelo y tallas, e indica la cantidad y el costo. Al confirmar la recepción se suman los pares y queda registrada la compra. Registra el pago real al proveedor desde el detalle de la compra.     |
| Vender                | En **Ventas → Punto de venta**, busca el modelo y agrega las tallas disponibles. Selecciona cliente si aplica. Ingresa descuentos, cuentas, importes y tasas de cada cobro. Revisa total, saldo y vuelto, y confirma. Recupera el comprobante en **Ventas → Historial**.                              |
| Apartar y entregar    | En **Apartados**, selecciona cliente y talla, confirma la reserva y registra cada abono. Entrega al completar el saldo. Para cancelación o vencimiento, revisa la política del apartado y registra el motivo.                                                                                         |
| Cambiar o devolver    | Abre el comprobante original en **Ventas → Historial**, selecciona el par y registra si vuelve al inventario o quedó defectuoso. Si hay un cambio, selecciona la talla de reemplazo. Verifica la diferencia, el reembolso y la cuenta correspondiente antes de confirmar.                             |
| Conciliar             | En **Finanzas → Reporte diario**, elige fecha y revisa saldos de apertura, cobros, anticipos, egresos y saldos resultantes. Usa **Movimientos** para llegar al documento de origen. Registra gastos y transferencias cuando ocurran y usa el reverso autorizado para corregir un registro confirmado. |
| Compartir un catálogo | En **Catálogo PDF**, filtra los modelos y tallas disponibles, elige los precios en USD o ingresa la tasa para la moneda elegida y descarga el archivo. Si necesitas recuperar exactamente esa versión más adelante, guárdala en el historial.                                                         |

Si pierdes la conexión después de confirmar, vuelve al listado o al detalle y revisa el estado del documento antes de iniciar otra operación. Para diferencias de stock o caja, anota comprobante, cuenta, talla y fecha y consulta el movimiento de origen antes de registrar un ajuste.

## Leer las existencias

El inventario lleva una fila por marca, modelo, talla y, cuando aplica, color. Por ejemplo, Nike Revolution talla 38 y Nike Revolution talla 39 se cuentan por separado. El sistema llama variante a cada combinación y la crea al recibir la mercancía.

Para reponer una talla, abre el producto en **Existencias** y selecciona **Agregar más pares**. El formulario carga la talla y su precio actual. Indica cuántos llegaron, cuánto costaron y quién los vendió. Cada talla nueva recibe un código SKU y cada reposición conserva el código existente. Consulta el código desde **Ver código y precio**.

**Disponibles** son los pares que puedes vender. Selecciona el producto para ver cuántos pares hay en tienda, cuántos están apartados y consultar sus movimientos. Si tienes 5 pares de la talla 38 y 2 están apartados, te quedan 3 disponibles.

## Qué cambia al confirmar

| Acción                          | Qué registra el sistema                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmar recepción             | Suma los pares a Inventario y guarda su costo con la tasa de la compra. El pago al proveedor se registra aparte cuando sale el dinero. |
| Confirmar venta                 | Descuenta los pares, genera el comprobante y registra en Caja cada cobro y el vuelto que entregaste.                                   |
| Reservar un apartado            | Separa los pares del stock disponible. Si hubo un abono, entra a Caja como anticipo. La venta se registra al entregar.                 |
| Confirmar cambio o devolución   | Corrige el comprobante original. Los pares recuperables vuelven al inventario. Caja registra lo cobrado o reembolsado.                 |
| Registrar gasto o transferencia | Un gasto reduce la cuenta de pago. Una transferencia mueve dinero entre dos cuentas.                                                   |

El punto de venta, los cambios y los movimientos manuales te piden volver a calcular si cambias los datos después de revisar una vista previa. Si la conexión se corta al reservar un apartado, pulsa **Comprobar reserva** para verificar el mismo intento.

En Finanzas, el filtro por cuenta o moneda afecta los movimientos y saldos de caja. Las ventas del resumen corresponden a toda la tienda. **USD histórico** es el equivalente guardado con la tasa de esa operación.
