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

## Evolución

Las confirmaciones de compras, ventas, apartados y devoluciones recibirán una clave de idempotencia. El catálogo PDF tendrá permisos de exportación y un contrato limitado a datos públicos.
