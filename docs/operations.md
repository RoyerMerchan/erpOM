# Despliegue y recuperación

## Preparar el entorno

Compila el monorepo con Node.js 24 LTS y la versión de pnpm declarada en `package.json`. La interfaz usa PrimeVue 4.5, Aura y PrimeIcons con licencia MIT. [Configuración de PrimeVue 4](https://v4.primevue.org/configuration/)

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Usa PostgreSQL 17 en una red privada y provisiona las credenciales mediante el gestor de secretos del entorno. Sirve `apps/web/dist` desde el proxy HTTPS. Envía `/api/` a Express y las rutas de la aplicación a `index.html`. Conserva el encabezado `Origin` que envía el navegador. El servicio de la API arranca desde el monorepo con `pnpm --filter @max-sport/api start`.

| Variable           | Valor de producción                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`         | `production`.                                                                                                                                                      |
| `DATABASE_URL`     | Conexión PostgreSQL de la instalación, con TLS cuando la conexión cruza la red.                                                                                    |
| `APP_ORIGIN`       | Origen público exacto, por ejemplo `https://erp.example.com`, sin barra al final.                                                                                  |
| `API_HOST`         | `127.0.0.1` si el proxy está en el mismo host. Si está separado, limita el puerto de Express a la red privada.                                                     |
| `API_PORT`         | Puerto privado del servicio. El valor por defecto es `3000`.                                                                                                       |
| `TRUST_PROXY_HOPS` | `0` para acceso directo o el número exacto de saltos por una ruta de proxy controlada. El proxy debe reemplazar los encabezados reenviados que llegan del cliente. |
| `LOG_LEVEL`        | `info` para operación habitual.                                                                                                                                    |

La API usa una cookie de sesión `HttpOnly`, `Secure` y `SameSite=Lax` en producción. Mantén el acceso público detrás del proxy y configura el registro de accesos sin cookies, credenciales ni cuerpos de solicitud. El límite de intentos de inicio de sesión funciona por instancia. Si escalas horizontalmente, aplica un límite compartido en el proxy o en la infraestructura antes de habilitar varias instancias.

## Servir la aplicación con Caddy

El `Caddyfile` sirve `apps/web/dist`, reenvía `/api` a Express y conserva las rutas directas de la web. Redirige HTTP a HTTPS y permite cachear los archivos versionados de Vite. Usa una instalación de Caddy 2 y ejecuta estos comandos desde la raíz del monorepo. [Caddyfile](../deploy/Caddyfile) · [HTTPS en Caddy](https://caddyserver.com/docs/quick-starts/https)

```sh
export APP_ORIGIN=https://erp.example.com
caddy validate --config deploy/Caddyfile --adapter caddyfile
caddy run --config deploy/Caddyfile --adapter caddyfile
```

Reemplaza el origen de ejemplo por el dominio de la instalación y usa el mismo valor en Express. Para un certificado público, el DNS del dominio debe apuntar al servidor y Caddy debe poder atender los puertos 80 y 443. Con Caddy y Express en el mismo host, ejecuta Express en `127.0.0.1:3000` y configura `TRUST_PROXY_HOPS=1` en la API. Si cambias el puerto o el host interno de Express, indica el valor correspondiente en `MAX_SPORT_API_UPSTREAM`.

`MAX_SPORT_WEB_ROOT` permite indicar una ruta absoluta al directorio compilado cuando Caddy se ejecuta fuera del monorepo. Para un ensayo en la misma máquina, usa `APP_ORIGIN=https://127.0.0.1:8443`, `MAX_SPORT_PROXY_BIND=127.0.0.1` y `MAX_SPORT_HTTP_PORT=8088`. En ese caso, usa la CA local de Caddy para validar el certificado de QA.

## Publicar una versión

1. Antes de una actualización, toma un respaldo y conserva los artefactos de la versión anterior. Pausa las escrituras durante el cambio si la compatibilidad entre versiones o el plan de recuperación lo requieren.
2. Apunta `DATABASE_URL` a la instalación prevista y ejecuta `pnpm db:migrate` una sola vez por despliegue. Revisa el resultado antes de iniciar la nueva versión.
3. En una instalación nueva, ejecuta `pnpm db:bootstrap` siguiendo las instrucciones del README y retira `ADMIN_PASSWORD` del entorno al terminar. Configura las cuentas operativas desde el ERP.
4. Arranca la API, publica la web compilada y comprueba `GET /api/v1/health/live` y `GET /api/v1/health/ready` a través del proxy. Espera `200` en ambos. Verifica inicio y cierre de sesión, acceso a **Inicio** y una consulta de **Reportes** con el rol correspondiente. Registra la versión desplegada y el resultado de estas comprobaciones.

Si falla una actualización, conserva los logs y determina si la versión anterior es compatible con el esquema ya migrado antes de volver a desplegarla. Si la recuperación precisa restaurar el esquema y los datos, sigue el procedimiento de restauración. Un respaldo recupera el estado de su punto de corte. Registra las operaciones posteriores a ese corte para conciliarlas antes de reabrir el servicio.

## Respaldar y restaurar PostgreSQL

Usa las herramientas cliente de PostgreSQL 17 y autentícate con el mecanismo de secretos del entorno, por ejemplo un archivo de contraseñas protegido. Los ejemplos usan Bash y los parámetros `PGHOST`, `PGPORT`, `PGUSER` y `PGDATABASE` con los valores de la instalación de origen. Guarda el archivo en almacenamiento cifrado con acceso restringido. El respaldo también contiene los catálogos PDF guardados y datos personales.

```sh
umask 077
backup="max-sport-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$backup"
pg_restore --list "$backup" > "${backup}.manifest"
```

1. Verifica los códigos de salida, registra el punto de corte y conserva la suma de comprobación junto con el respaldo. Define la frecuencia y retención según la pérdida de datos que el negocio pueda tolerar.
2. En el servidor de destino aislado, crea una base vacía con el rol que será propietario de los objetos. Cambia `PGHOST`, `PGPORT` y `PGUSER` a ese destino y define `PGDATABASE=max_sport_restore_check`. Ejecuta los comandos con un rol que tenga los permisos requeridos de creación y restauración.

   ```sh
   createdb "$PGDATABASE"
   pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
     --dbname="$PGDATABASE" "$backup"
   ```

3. Comprueba con `psql` que `_prisma_migrations` contiene el historial esperado. Levanta la versión de aplicación correspondiente contra la base restaurada en un entorno aislado. Comprueba salud, acceso, un documento conocido, existencias por talla, reporte diario y una descarga histórica. Concilia importes y cantidades con el punto de corte del respaldo.
4. Para recuperar producción, mantén el acceso público en pausa mientras validas el destino. Revoca las sesiones históricas antes de reabrir mediante `DELETE FROM user_sessions;` en la base restaurada, con el destino confirmado y la API detenida. Configura la conexión de producción al destino aprobado, verifica nuevamente el servicio y registra el resultado del cambio.
