import type { AnalyticsSection } from '@max-sport/shared';

export const pageHelp: Readonly<Record<string, string>> = {
  '/dashboard':
    'Consulta tus ventas, cobros y existencias. En Reportes puedes elegir un período y ver el desglose.',
  '/reportes':
    'Elige un tipo de reporte y un período. Abre Ver desglose para ver los datos detrás de los totales.',
  '/catalogo':
    'Prepara un PDF para tus clientes con los modelos, tallas disponibles y precios que elijas.',
  '/cuenta':
    'Consulta tu usuario o cambia tu contraseña. Al guardarla se cerrarán tus sesiones abiertas.',
  '/sin-acceso': 'Si necesitas abrir esta sección, pide a tu administrador que revise tu rol.',
  '/inventario':
    'Disponibles son los pares que puedes vender después de restar los apartados. Toca un producto para ver su detalle.',
  '/inventario/agregar/:variantId?':
    'Elige marca, modelo y tallas. Al confirmar la recepción, los pares se suman a Inventario y la entrada queda en Compras.',
  '/inventario/variantes':
    'El SKU es el código de cada modelo, talla y color. Se crea al recibir una talla nueva y se reutiliza al reponerla.',
  '/inventario/modelos':
    'Registra cada modelo bajo su marca. Sus tallas se pueden agregar al recibir mercancía.',
  '/inventario/marcas': 'Crea o consulta las marcas que puedes asignar a tus modelos.',
  '/compras':
    'Consulta tus compras por proveedor. El stock aumenta cuando confirmas la recepción y la caja cambia cuando registras el pago.',
  '/compras/:id/editar':
    'Corrige el proveedor, los pares o los importes del borrador antes de confirmar la recepción.',
  '/compras/:id':
    'Revisa las tallas, el total y el saldo de esta compra. Aquí puedes confirmar la recepción o registrar un pago.',
  '/compras/por-pagar': 'Consulta las compras recibidas que todavía tienen un saldo por pagar.',
  '/ventas/pos':
    'Agrega los pares por talla, indica los cobros y calcula el importe. Al confirmar se registra la venta y baja el stock.',
  '/ventas': 'Busca un comprobante para revisar qué se vendió, cómo se cobró o iniciar un cambio.',
  '/ventas/:id':
    'Revisa los pares, descuentos y cobros de este comprobante. Desde aquí puedes iniciar un cambio o una devolución.',
  '/apartados':
    'Busca reservas por cliente y revisa cuáles tienen saldo pendiente, están pagadas o ya se entregaron.',
  '/apartados/nuevo':
    'Elige el cliente y las tallas. Puedes registrar un abono inicial. La venta se registra al entregar los pares.',
  '/apartados/:id':
    'Revisa el saldo y registra los abonos. Al entregar los pares, los abonos previos se aplican a la venta.',
  '/devoluciones':
    'Consulta los cambios y devoluciones registrados y abre su comprobante original.',
  '/devoluciones/nueva/:saleId':
    'Indica qué pares regresan y si vuelven al inventario. Si eliges un reemplazo, calcula la diferencia antes de confirmar.',
  '/devoluciones/:id':
    'Revisa qué pares se devolvieron, cuáles volvieron al inventario y cuánto se cobró o reembolsó.',
  '/clientes': 'Registra y busca las personas que pueden aparecer en tus ventas y apartados.',
  '/proveedores': 'Guarda los datos de las personas o empresas a las que compras mercancía.',
  '/finanzas':
    'Consulta las ventas de toda la tienda y los cobros, gastos y saldos del período. Los filtros de cuenta y moneda se aplican a caja.',
  '/finanzas/movimientos':
    'Revisa cada entrada y salida de dinero. USD histórico es su equivalente en dólares con la tasa guardada en esa operación.',
  '/finanzas/ingresos-egresos':
    'Consulta los gastos, otros ingresos, transferencias y ajustes que se registraron desde Finanzas.',
  '/finanzas/gastos': 'Consulta lo que pagaste por alquiler, servicios, publicidad u otros gastos.',
  '/finanzas/por-cobrar':
    'Muestra los saldos pendientes de apartados. Abre uno para ver sus abonos.',
  '/finanzas/por-pagar': 'Muestra el dinero que aún debes a proveedores por compras recibidas.',
  '/finanzas/rentabilidad':
    'La ganancia estimada es lo vendido después de restar el costo de los pares vendidos y los gastos operativos.',
  '/finanzas/diario':
    'Elige un día para revisar cuánto había al comenzar, qué entró, qué salió y cuánto quedó.',
  '/finanzas/nuevo':
    'Registra un gasto, otro ingreso, una transferencia o un ajuste. Calcula el importe antes de guardarlo.',
  '/finanzas/registro/:id': 'Revisa las cuentas, los importes y la tasa usados en este registro.',
  '/finanzas/cuentas':
    'Administra las cuentas donde guardas dinero. Cada caja, banco o billetera tiene su propia moneda.',
  '/finanzas/tasas':
    'Consulta las tasas guardadas por fecha. Expresan cuántas unidades de otra moneda equivalen a 1 USD.',
  '/usuarios': 'Administra las cuentas del personal. El rol de cada usuario define su acceso.',
  '/usuarios/roles':
    'Revisa qué acciones puede realizar cada rol y qué información financiera puede ver.',
  '/configuracion':
    'Ajusta los datos de la tienda, las alertas de inventario y la política de apartados.',
  '/configuracion/monedas': 'Elige las monedas que puedes usar para registrar cobros y pagos.',
  '/auditoria': 'Consulta quién registró o modificó una operación y cuándo lo hizo.',
};

export const reportHelp: Record<AnalyticsSection, string> = {
  SALES:
    'Consulta las ventas después de descuentos y devoluciones. Abre Ver desglose para ver los costos, gastos y comparaciones.',
  CASH: 'Revisa el dinero que entró y salió durante el período. Puedes filtrar por cuenta, moneda o método.',
  STOCK:
    'Consulta los pares disponibles, apartados y con stock bajo. Las cantidades reflejan el momento de la consulta.',
  PURCHASES:
    'Revisa las recepciones del período, los pares ingresados y el saldo pendiente con proveedores.',
  LAYAWAYS:
    'Consulta los apartados abiertos, vencidos o pagados por entregar y sus saldos pendientes.',
  RETURNS: 'Consulta los cambios, los pares devueltos y cuántos pudieron volver al inventario.',
};
