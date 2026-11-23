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
