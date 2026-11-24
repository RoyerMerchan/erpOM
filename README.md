# MAX Sport Manager

ERP y POS para una tienda de calzado deportivo. Incluye compras, inventario FIFO, ventas multimoneda, apartados, cambios, devoluciones, finanzas, reportes y catálogo PDF.

## Desarrollo local

Para el desarrollo local usa Node.js 24 LTS (24.11 o posterior), pnpm 12.23.0 y Docker con Compose. Si ya tienes PostgreSQL 17, puedes usar una base vacía dedicada y ajustar `DATABASE_URL`.

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose up -d --wait db
pnpm db:migrate
```

Copia `.env.example` solo al preparar un entorno nuevo. Si eliges otro puerto de PostgreSQL, aplica el mismo puerto a `POSTGRES_PORT` y `DATABASE_URL`. En Bash usa `cp .env.example .env` en el paso de copia.

### Crear el administrador inicial

Indica un correo y un nombre, y elige una contraseña de 15 a 128 caracteres. En PowerShell puedes introducirla sin mostrarla en pantalla.

```powershell
$env:ADMIN_EMAIL = 'admin@example.test'
$env:ADMIN_NAME = 'Administrador'
$adminSecret = Read-Host 'Contraseña del administrador' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminSecret).Password
try {
  pnpm db:bootstrap
} finally {
  Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_NAME -ErrorAction SilentlyContinue
  Remove-Variable adminSecret
}
```

El comando inicializa la tienda y las cuatro monedas. Crea las cuentas operativas desde el ERP. `pnpm db:seed:demo` acepta las mismas variables para una base de demostración local en modo `development`. Los comandos conservan cuentas existentes.

### Arrancar

```text
pnpm dev
```

Abre <http://localhost:5173/> e inicia sesión con la cuenta creada. Vite envía `/api` a Express en `127.0.0.1:3000`. La API usa el `APP_ORIGIN` de `.env` al verificar las peticiones de autenticación.

Al actualizar una instalación de la Fase 0, ejecuta `pnpm db:migrate` antes de arrancar. El administrador existente recibe los permisos de su rol durante la migración. Desde **Usuarios y roles** puede asignar uno de los cinco roles y crear cuentas con contraseña temporal.

La migración de la Fase 2 agrega los permisos de compras y existencias. Desde **Compras**, crea un borrador, marca las tallas, calcula la vista previa y confirma la recepción. Los pagos se pueden registrar al recibir o desde el detalle. **Compras → Por pagar** muestra los documentos con saldo e **Inventario → Existencias** muestra el stock por talla.

Después de aplicar la migración de la Fase 3, abre **Ventas → Punto de venta**. Agrega tallas con stock disponible, elige un cliente o vende a consumidor final, registra los cobros y calcula la vista previa. Usa una cuenta habilitada para cada moneda y revisa su tasa antes de confirmar. El comprobante está en **Ventas → Historial**, con opciones de imprimir o descargar.

La Fase 4 agrega el módulo **Apartados** para reservar tallas, recibir abonos y entregar al liquidar el saldo. **Configuración → Tienda** permite elegir la política para nuevos apartados. Para iniciar un cambio o devolución, abre el comprobante original en **Ventas → Historial**. El movimiento registrado aparece en **Ventas → Cambios y devoluciones**.

En la Fase 5, **Finanzas → Resumen** muestra ventas reconocidas, rentabilidad y caja. **Finanzas → Movimientos** enlaza cada registro con su origen. Desde **Ingresos y egresos** se registran gastos, otros ingresos, transferencias y ajustes autorizados. Configura categorías desde **Gastos**. El **Reporte diario** se puede consultar e imprimir por fecha en la zona horaria de la tienda.

La Fase 6 agrega **Inicio** y **Reportes** con comparativas, indicadores de operación y alertas por talla. Aplica `pnpm db:migrate` para activar los permisos y el historial de catálogos. Los roles autorizados descargan reportes en CSV, XLSX o PDF. En **Catálogo PDF**, elige tallas o modelos y descarga los precios públicos. Para convertir a otra moneda, indica cuántas unidades equivalen a 1 USD. Puedes guardar la versión que descargaste.

## Verificación

```text
pnpm db:validate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Las pruebas de humo y unitarias comprueban HTTP, sesión, validación de datos, importes y fechas. Las de integración recorren los flujos operativos y verifican conciliación, control de acceso y descargas. Para probar con PostgreSQL, crea una base dedicada, migra la base y define `TEST_DATABASE_URL` durante `pnpm test:integration`. Estos comandos usan la configuración local de Compose.

```powershell
docker compose exec -T db createdb -U max_sport max_sport_test
$env:TEST_DATABASE_URL = 'postgresql://max_sport:max_sport_local@127.0.0.1:5432/max_sport_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
try {
  pnpm db:migrate
  pnpm test:integration
} finally {
  Remove-Item Env:DATABASE_URL, Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
}
```

`pnpm db:migrate` aplica migraciones existentes. Usa `pnpm db:migrate:dev --name nombre_del_cambio` para generar nuevas migraciones durante desarrollo.

### Pruebas de navegador

Instala Chromium para Playwright con `pnpm --filter @max-sport/web exec playwright install chromium`. También puedes usar Microsoft Edge instalado configurando `PLAYWRIGHT_CHANNEL=msedge`.

Crea una base PostgreSQL exclusiva cuyo nombre termine en `_e2e`. Desde la raíz, usa esa misma conexión para migrar e inicializar la base. Ejecuta `pnpm db:bootstrap` solo al preparar una base vacía y usa credenciales ficticias según los pasos de administrador inicial. Las pruebas crean sus propios usuarios y operaciones de QA.

```powershell
docker compose exec -T db createdb -U max_sport max_sport_e2e
$env:E2E_DATABASE_URL = 'postgresql://max_sport:max_sport_local@127.0.0.1:5432/max_sport_e2e'
$env:DATABASE_URL = $env:E2E_DATABASE_URL
```

Con esas variables, ejecuta `pnpm db:migrate`, inicializa la base si es nueva y ejecuta `pnpm test:e2e`. Playwright ocupa los puertos 4173 y 4317 mientras dura la prueba. Las capturas y trazas quedan en `.local/e2e-results`. Al terminar puedes quitar las variables con `Remove-Item Env:E2E_DATABASE_URL, Env:DATABASE_URL`.

## Compilación y documentación

`pnpm build` genera `apps/web/dist` y `apps/api/dist`. `pnpm --filter @max-sport/api start` inicia la API compilada. Caddy sirve la web compilada y envía `/api` a la API desde el mismo origen HTTPS. En producción usa `NODE_ENV=production`, un `APP_ORIGIN` HTTPS y credenciales propias de PostgreSQL. [Caddyfile](deploy/Caddyfile)

- [Prompt maestro](docs/MASTER_PROMPT.md) y [prompts por fase](docs/02_PROMPTS_POR_FASES.md)
- [Requisitos](docs/requirements.md), [flujos](docs/flows.md) y [modelo de dominio](docs/domain.md)
- [Decisiones](docs/decisions.md), [API](docs/api.md) y [roadmap](docs/roadmap.md)
- [Despliegue, respaldo y restauración](docs/operations.md) y [guía del operador](docs/operator.md)
