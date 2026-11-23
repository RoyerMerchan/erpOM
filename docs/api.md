# API HTTP

Prefijo `/api/v1`. La web hace peticiones al mismo origen y mantiene la sesión en cookie. Los `POST` de autenticación requieren `Origin` igual a `APP_ORIGIN`.

## Fase 0

| Método y ruta              | Resultado                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | `200` con `{"status":"ok"}` cuando Express responde.                                                                                                                                                             |
| `GET /api/v1/health/ready` | `200` con `{"status":"ready"}` al consultar PostgreSQL. `503` cuando falla la consulta.                                                                                                                          |
| `POST /api/v1/auth/login`  | Acepta JSON con `email` y `password`. Emite la cookie de sesión y devuelve `{"user": {...}}` con el identificador, nombre, correo y rol público. `401` para credenciales inválidas y `429` al superar el límite. |
| `GET /api/v1/auth/me`      | Devuelve el mismo perfil público para una sesión vigente. `401` con sesión ausente, revocada, vencida o usuario inactivo.                                                                                        |
| `POST /api/v1/auth/logout` | Revoca la sesión presentada y borra la cookie. `204`, también para una sesión ya cerrada.                                                                                                                        |

Los errores usan `{"error":{"code":"CODIGO","message":"Mensaje en español","requestId":"..."}}`. `X-Request-Id` permite correlacionar la respuesta con los logs. Los errores internos se exponen con un mensaje genérico y los logs excluyen cuerpos de petición, cookies y cabeceras de autenticación.

## Evolución

Las listas agregarán paginación, búsqueda y filtros por módulo. Las confirmaciones de compras, ventas, apartados y devoluciones recibirán una clave de idempotencia. Los importes decimales viajarán como cadenas y las fechas de eventos como ISO 8601. El catálogo PDF tendrá permisos de exportación y un contrato limitado a datos públicos.
