# Decisiones de arquitectura

## Organización

```text
apps/
  api/          API Express, esquema Prisma, migraciones y pruebas
  web/          Vue, PrimeVue, Pinia y rutas
packages/
  shared/       Esquemas Zod y tipos del contrato HTTP
  config/       Configuraciones TypeScript reutilizables
docs/           Contrato maestro, flujos, dominio y roadmap
```

- Node.js 24 LTS y pnpm fijado en `packageManager` con `pnpm-lock.yaml`. Prisma 7 usa el adaptador `pg` y migraciones SQL para PostgreSQL. Vite construye la web y TypeScript 6 emite la API como módulos ESM. Se usa la línea 6 por compatibilidad con `typescript-eslint`. Las aplicaciones pueden construirse por separado después de resolver el contrato compartido. [Versiones de Node.js](https://nodejs.org/en/about/previous-releases) · [Prisma y PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)
- Entorno local con PostgreSQL en Docker Compose, vinculado a la interfaz de loopback. Durante desarrollo Vite redirige `/api` a Express. En producción el proxy HTTPS sirve la web y envía `/api` a la API desde el mismo origen. Las credenciales solo se leen en procesos de servidor.
- La web usa la rama MIT de PrimeVue 4.5, con Aura 2 y PrimeIcons 7. Estas versiones conservan los componentes que usa el ERP y permiten compilar y operar sin configurar una clave. El lockfile fija las versiones verificadas. [Licencia y mantenimiento de PrimeVue](https://github.com/primefaces/primevue)
- La sesión inicial usa un token opaco aleatorio en cookie HttpOnly, SameSite=Lax y Secure en producción. Se guarda únicamente su hash en PostgreSQL. El acceso expira a las ocho horas. El POST requiere el origen configurado. Las contraseñas se derivan con scrypt y sal aleatoria. El límite de inicio de sesión en memoria cubre la instancia local. La configuración para varias instancias corresponde al despliegue.
- La Fase 1 aplica permisos por acción a usuarios y catálogos. Hace obligatorio el cambio de contraseña temporal y revoca sesiones al cambiar credenciales, rol o estado. Las operaciones de usuarios protegen el último administrador activo.

## Acceso por rol

| Rol           | Acceso inicial                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Administrador | Acceso completo, incluida la administración de usuarios, y configuración de visibilidad de costos y utilidad de los demás roles. |
| Gerente       | Gestiona productos, clientes, proveedores, cuentas, tasas, monedas y tienda. Consulta auditoría.                                 |
| Vendedor      | Consulta productos, cuentas, tasas, monedas y tienda. Puede crear y editar clientes.                                             |
| Inventario    | Gestiona productos y proveedores. Consulta tasas, monedas y tienda.                                                              |
| Finanzas      | Gestiona cuentas, tasas y monedas. Consulta proveedores, tienda y auditoría.                                                     |

Costos y utilidad son permisos independientes. Se habilitan inicialmente para Administrador, Gerente y Finanzas. La API aplica estos permisos antes de devolver campos financieros y el portal los usa para mostrar controles y columnas.

Cada mutación auditada registra el actor y el cambio en la misma transacción. Para cuentas y contactos personales, las instantáneas registran estado, rol o presencia de campos. Las contraseñas, los tokens, el contenido de notas y los datos de contacto quedan fuera de la bitácora.

## Precisión y fechas

- Los valores originales admiten hasta ocho decimales en PostgreSQL y las tasas hasta doce, con `Decimal` en cálculos. Los contratos de dinero usarán cadenas decimales. Se propone USD con 2 decimales, COP con 0 por defecto, VES con 2 y USDT con 6. La moneda configura la escala operativa de su captura.
- La conversión conserva precisión hasta el redondeo monetario. Los importes de línea contabilizados en USD redondean a centavos con `ROUND_HALF_UP`. Los totales suman los importes persistidos. Costos unitarios FIFO retienen mayor precisión. Cada lote conserva su costo total y la última asignación absorbe el residuo de centavos.
- Fletes se prorratean por cantidad de pares. El descuento global se prorratea según el importe de cada línea después de su descuento propio. Los centavos sobrantes se distribuyen por mayor resto. El orden de grupo y talla desempata el flete y el orden de la venta desempata los descuentos.
- El POS valida cobertura exacta en centavos USD con los importes de cada pago ya redondeados. El exceso puede registrarse como vuelto de efectivo con cuenta y tasa propias. Un total de cero puede confirmarse sin cobros.
- Las fechas de eventos se guardan con zona (`timestamptz`). Para reportes, semana de lunes a domingo y zona inicial `America/Caracas`, configurable. Los filtros convierten los límites locales a UTC antes de consultar.
- La pantalla de tasas captura y muestra horas en la zona del dispositivo y la indica en el formulario. Cada petición registra un instante ISO 8601 con zona. La zona configurada en la tienda regirá los cortes de los reportes.
- La recepción prorratea el flete en las unidades menores de la moneda y resuelve el residuo por grupo y talla. Cada línea USD redondea a centavos. El costo unitario del lote se deriva de ese total a doce decimales. Al consumir parte de un lote se prorratea contra el costo inicial, con límite en el saldo. La última salida absorbe el residuo.
- El saldo de compra siempre se mantiene en USD usando los equivalentes históricos de cada pago. El detalle muestra saldo original cuando los abonos activos usan la moneda y la tasa de la compra y ese saldo concilia su estado.

## Transacciones

- Recepción y anulación bloquean la compra primero y las variantes en orden de UUID después. Los ajustes bloquean la variante. Las salidas verifican disponibilidad y reservas antes de consumir lotes. Las restricciones SQL protegen saldos, y las transacciones reintentan conflictos de serialización.
- La clave idempotente persiste con su resultado y la huella del contenido. La misma clave con contenido diferente produce un conflicto. Las operaciones confirmadas se corrigen mediante documentos compensatorios y auditoría.

## Operación de compras e inventario

- Administrador y Gerente confirman, anulan y registran pagos. Finanzas consulta y paga compras. Inventario puede consultar compras y ajustar salidas. Con acceso a costos, Inventario puede guardar y confirmar borradores y ajustar entradas.
- El margen estimado por variante compara el precio público con el costo del primer lote disponible. Requiere ambos permisos, `costs.read` y `profits.read`, ya que el margen y el precio juntos revelan el costo.
- La recepción cambia existencias y lotes. Un pago a proveedor crea una salida de caja. Su reversión registra una entrada compensatoria con el importe y la tasa originales cuando el dinero vuelve a la cuenta o se corrige un registro errado. Los movimientos y renglones publicados se conservan mediante restricciones de base de datos.

## Operación de ventas

- Administrador y Gerente pueden vender, elegir al vendedor y consultar el historial completo. Vendedor puede registrar y consultar sus propias operaciones. Finanzas consulta el historial completo. El acceso a utilidad exige permiso para ver costos y utilidad.
- La confirmación bloquea las variantes en orden de UUID, vuelve a validar la vista previa y registra el comprobante, las salidas FIFO, los cobros, el vuelto y la auditoría en una transacción. Las cifras de costo del POS son estimaciones hasta la confirmación que consume los lotes.
- El historial usa la zona del dispositivo para mostrar fechas y construir el rango solicitado. El día final visible se incluye convirtiendo la medianoche del día siguiente en el límite superior exclusivo.

## Apartados, cambios y devoluciones

- La política inicial de cancelación reembolsa cada abono en su cuenta, moneda, importe y tasa históricos. La tienda puede elegir retención para los apartados posteriores. El sistema distingue los reembolsos de la retención de anticipos en el detalle y conserva el historial de movimientos.
- Administrador y Gerente cierran apartados y autorizan cambios y devoluciones. Vendedor puede crear, abonar y entregar sus apartados, y consultar cambios relacionados con sus ventas. Finanzas puede consultar el historial completo. El costo restaurado requiere permiso de costos.
- El importe de cada devolución se obtiene de la diferencia entre los acumulados redondeados antes y después de devolver la cantidad. Se aplica el mismo criterio dentro de cada asignación FIFO para el costo de reingreso. Los importes de devoluciones sucesivas suman el neto original cuando se devuelve toda la línea.
- La entrega reconoce la venta con el precio del apartado y presenta los anticipos existentes en el comprobante. El flujo de caja reconoce el anticipo en la fecha del cobro. Un cambio con saldo usa una cuenta y tasa explícitas para la diferencia.

## Finanzas y conciliación

- Los saldos se derivan del libro de movimientos. La apertura suma el historial anterior al corte inicial. El saldo al corte suma la apertura y las entradas del período y resta sus salidas. El equivalente USD suma valores históricos con el signo de cada movimiento.
- Los cobros presentan por separado ventas y anticipos. El flujo operativo suma las entradas y salidas frente a terceros, incluidos pagos, devoluciones, vuelto y sus reversos. Transferencias y ajustes se muestran por separado y participan en la variación de saldos.
- Entre cuentas de la misma moneda se usa un único importe y tasa. Para monedas distintas se registran ambas cantidades reales y sus tasas explícitas. La diferencia cambiaria es el USD histórico de entrada menos el de salida. Los reversos usan los importes y tasas originales.
- La rentabilidad reúne todos los documentos del período de la tienda. `ventas netas = ventas confirmadas − rectificaciones`, tomando los totales de venta después de descuentos. El costo resta las reentradas recuperables por devolución. La utilidad neta estimada resta de la utilidad bruta los gastos operativos netos de sus reversos. Los otros ingresos y las diferencias cambiarias se presentan por separado.
- Los filtros por cuenta y moneda aplican al libro, los saldos y la sección de caja. Las fechas y semanas se calculan en la zona de la tienda. Los formularios muestran la zona del dispositivo al capturar un instante.
- Administrador, Gerente y Finanzas consultan el libro, registran operaciones manuales y gestionan categorías. Administrador y Finanzas registran y revierten ajustes de saldo. La consulta de costos y rentabilidad conserva sus permisos específicos.

## Dashboard, reportes y catálogo PDF

- Las semanas comienzan el lunes y los meses se comparan con el mes calendario anterior. Los otros períodos se comparan con la misma cantidad de días consecutivos previos. PostgreSQL trabaja en UTC en las conexiones de la API. Los cortes y los intervalos de cada tienda usan su zona configurada, incluidos cambios de hora.
- El filtro de cuenta, moneda o método selecciona documentos de venta vinculados con un cobro coincidente. Una venta con varios cobros coincidentes se cuenta una vez. En caja se suman los importes de los movimientos de cada cuenta. El método toma la clasificación actual de la cuenta. Las cifras de costo y utilidad se validan por rol en la API, también al exportar.
- Los gastos operativos y la utilidad neta estimada se calculan para el resultado general de la tienda. Caja muestra gastos por categoría bajo sus propios filtros. Los saldos pendientes, las alertas y el inventario son instantáneas al consultar. Las recepciones, los movimientos y las entregas se agregan por su fecha. Un modelo se considera agotado cuando el disponible de todas sus variantes activas suma cero.
- Administrador, Gerente, Finanzas e Inventario exportan las secciones que pueden consultar. Vendedor consulta sus ventas, apartados y devoluciones, y las existencias. Los formatos exportan los indicadores y tablas del informe solicitado. El CSV protege campos de texto interpretables como fórmulas. El XLSX conserva como texto los decimales que superarían la precisión numérica de la hoja. Los PDF se componen en el servidor con tipografía incrustada. [ExcelJS](https://github.com/exceljs/exceljs), [PDFKit](https://pdfkit.org/docs/text.html)
- El catálogo agrupa tallas disponibles del mismo modelo, color y precio USD. La cotización se aplica al PDF elegido. El catálogo ordinario incluye tallas y precios públicos. Administrador, Gerente e Inventario pueden elegir cantidades exactas. El archivo guardado queda en PostgreSQL junto con sus metadatos y exige el permiso de cantidades si las incluye.
