# API HTTP

Prefijo `/api/v1`. La web hace peticiones al mismo origen y mantiene la sesión en cookie. Las peticiones que modifican datos requieren `Origin` igual a `APP_ORIGIN`.

## Fase 0

| Método y ruta              | Resultado                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | `200` con `{"status":"ok"}` cuando Express responde.                                                                                                                                                             |
| `GET /api/v1/health/ready` | `200` con `{"status":"ready"}` al consultar PostgreSQL. `503` cuando falla la consulta.                                                                                                                          |
| `POST /api/v1/auth/login`  | Acepta JSON con `email` y `password`. Emite la cookie de sesión y devuelve `{"user": {...}}` con el identificador, nombre, correo y rol público. `401` para credenciales inválidas y `429` al superar el límite. |
| `GET /api/v1/auth/me`      | Devuelve el mismo perfil público para una sesión vigente. `401` con sesión ausente, revocada, vencida o usuario inactivo.                                                                                        |
| `POST /api/v1/auth/logout` | Revoca la sesión presentada y borra la cookie. `204`, también para una sesión ya cerrada.                                                                                                                        |

Los errores usan `{"error":{"code":"CODIGO","message":"Mensaje en español","requestId":"..."}}`. `X-Request-Id` permite correlacionar la respuesta con los logs. Los errores internos se exponen con un mensaje genérico y los logs excluyen cuerpos de petición, cookies y cabeceras de autenticación.

## Fase 1

`/auth/login` y `/auth/me` incluyen `permissions` y `mustChangePassword` dentro de `user`. Cada petición protegida consulta la sesión, el estado de la cuenta y los permisos actuales del rol. Una sesión inválida devuelve `401`. La falta de permiso o un cambio de contraseña pendiente devuelve `403`.

| Método y ruta                                           | Resultado                                                                                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/password`                                   | Recibe `currentPassword` y `newPassword`. El cambio devuelve `204` y revoca las sesiones del usuario.                                                                            |
| `GET /{recurso}`                                        | Lista paginada `{items, total}`. Parámetros `q`, `page` (desde 1), `limit` (1–100) y `status` (`all`, `active`, `archived`). Cuentas y tasas también filtran por `currencyCode`. |
| `GET /{recurso}/:id`                                    | Consulta un registro por UUID, incluido su estado.                                                                                                                               |
| `POST /{recurso}`                                       | Valida y crea un registro. Devuelve `201`.                                                                                                                                       |
| `PUT /{recurso}/:id`                                    | Guarda los campos editables. En tasas crea una nueva versión y devuelve su UUID.                                                                                                 |
| `DELETE /{recurso}/:id`                                 | Archiva el registro y devuelve `204`. Repetir el archivo conserva el mismo estado.                                                                                               |
| `POST /{recurso}/:id/restore`                           | Reactiva un registro archivado en catálogos, cuentas y usuarios.                                                                                                                 |
| `GET` y `PUT /shop`                                     | Consulta o edita nombre, zona IANA, URL de logotipo y umbral de stock general.                                                                                                   |
| `GET /currencies` y `PUT /currencies/:code`             | Consulta y configura USD, COP, VES y USDT. USD conserva su estado activo y dos decimales.                                                                                        |
| `GET /roles` y `PUT /roles/:code/financial-permissions` | El administrador consulta roles y configura el acceso a costos y utilidad para los demás roles.                                                                                  |
| `GET /audit`                                            | Lista paginada por fecha descendente con búsqueda de acción, entidad, UUID o usuario.                                                                                            |

Los recursos son `brands`, `models`, `variants`, `customers`, `suppliers`, `accounts`, `rates` y `users`. Cada uno protege en el servidor las acciones `read`, `create`, `update` y `archive`. Los contratos viven en `packages/shared`.

`salePriceUsd` y `unitsPerUsd` son cadenas decimales. El alta de tasa recibe `currencyCode`, `unitsPerUsd` y `effectiveAt` con zona. La corrección recibe el importe y la nueva fecha efectiva, conserva la moneda, archiva el original y enlaza la versión nueva mediante `replacesId`. La lista conserva fecha efectiva, fecha de creación, autor y estado de archivo.

`POST /users` exige `displayName`, `email`, `roleCode` y `temporaryPassword`. En `PUT /users/:id`, `temporaryPassword` es opcional. A la siguiente sesión, el usuario debe cambiarla antes de operar. Un cambio de rol, correo, contraseña o archivo revoca las sesiones previas de la cuenta afectada.

## Fase 2

| Método y ruta                                     | Resultado                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /purchases` y `GET /purchases/payables`      | Listas paginadas con búsqueda por proveedor o referencia. Por pagar incluye compras confirmadas con saldo positivo.                            |
| `GET /purchases/:id`                              | Resumen, renglones recibidos y, con permiso de costos, importes, vista previa del borrador y pagos.                                            |
| `POST /purchases/preview`                         | Calcula importes por talla, flete distribuido y conversión sin crear documentos.                                                               |
| `GET /purchases/quote`                            | Recibe `currencyCode` y `at`. Devuelve la última tasa activa hasta ese instante o `null`.                                                      |
| `POST /purchases` y `PUT /purchases/:id`          | Crea o edita un borrador. La edición recibe `{revision,draft}` y rechaza versiones desactualizadas.                                            |
| `POST /purchases/:id/receive`                     | Recibe `{operationId,revision,initialPayment?}`. Confirma la recepción, incorpora los lotes y aplica el pago opcional en la misma transacción. |
| `POST /purchases/:id/payments`                    | Registra un pago con `operationId`, cuenta, fecha, importe original, tasa y referencia opcional. La cuenta determina la moneda.                |
| `POST /purchases/:id/payments/:paymentId/reverse` | Registra el motivo y un movimiento compensatorio. El pago conserva su contexto original.                                                       |
| `POST /purchases/:id/void`                        | Recibe un motivo. Las recepciones requieren lotes intactos, existencias suficientes y pagos ya revertidos.                                     |
| `GET /inventory`                                  | Lista existencias con `q`, `size`, `brandId`, `modelId` y `stock` (`ALL`, `AVAILABLE`, `LOW`, `OUT`).                                          |
| `GET /inventory/:id/movements`                    | Historial paginado de la variante.                                                                                                             |
| `POST /inventory/:id/adjustments`                 | Registra ajuste con `operationId`, cantidad firmada, motivo y costo USD para una entrada.                                                      |

Los importes viajan en cadenas decimales. Las recepciones y los pagos conservan el USD histórico. Repetir un `operationId` con los mismos datos devuelve el documento o movimiento existente. Usarlo con datos diferentes devuelve `409`. Los estados, tasas, existencias y pagos se validan dentro de sus transacciones.

## Fase 3

| Método y ruta                    | Resultado                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /sales/preview`            | Verifica disponibilidad y calcula líneas, descuentos, equivalencias locales, cobros, saldo y vuelto. Devuelve `quoteDigest` y `ready`.                               |
| `POST /sales`                    | Recibe `{operationId, quoteDigest, sale}`. Responde `201` con el comprobante confirmado. La repetición con el mismo actor y contenido devuelve el mismo comprobante. |
| `GET /sales`                     | Lista ventas paginadas con `q`, `sellerId`, `customerId`, `currencyCode`, `from` inclusivo y `to` exclusivo. Las fechas son instantes ISO 8601 con zona.             |
| `GET /sales/:id`                 | Devuelve comprobante, líneas, descuentos, cobros y vuelto. Los importes de costo y utilidad requieren los permisos correspondientes.                                 |
| `GET /sales/operators`           | Lista personal habilitado para vender. Admite búsqueda `q` y requiere permiso de consulta global.                                                                    |
| `GET /sales/rates/:currencyCode` | Consulta la última tasa activa hasta el momento de la petición para precargarla antes de calcular.                                                                   |

El cuerpo de venta incluye `items: [{variantId, quantity, discount?}]`, `customerId`, `sellerId`, `notes`, `globalDiscount`, `payments`, `change` y `displayQuote`. Un descuento porcentual recibe `{kind: "PERCENT", percentage}`. Uno fijo recibe `{kind: "FIXED", currencyCode, amountOriginal, unitsPerUsd}`. Cada cobro o vuelto recibe `{accountId, amountOriginal, unitsPerUsd, reference?}`. El vuelto exige cuenta de efectivo. Los importes y tasas viajan en cadenas decimales.

Envía la misma venta junto con el `quoteDigest` de su vista previa. Una variación de precios produce `409 QUOTE_CHANGED`. El stock se valida al calcular y al confirmar. Si falta tasa explícita de una moneda distinta de USD se devuelve `409 RATE_REQUIRED`. Si el cobro neto difiere del total se devuelve `409 PAYMENT_MISMATCH`. Ante una respuesta de red incierta, reenvía el mismo cuerpo y `operationId`. Reutilizar la clave con otro actor o contenido produce `409 IDEMPOTENCY_CONFLICT`.

El permiso `sales.read` habilita las ventas propias. `sales.read.all` amplía la consulta. `sales.assign` permite escoger a otro vendedor. El costo requiere `costs.read` y la utilidad bruta requiere además `profits.read`.

## Evolución

Apartados y devoluciones usarán idempotencia. El catálogo PDF tendrá permisos de exportación y un contrato limitado a datos públicos.
