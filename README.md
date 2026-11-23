# MAX Sport Manager

ERP y POS para una tienda de calzado deportivo. El proyecto arranca con la Fase 0, que incluye la infraestructura, la primera migración, el acceso con cuenta persistida y el panel de estado de API y PostgreSQL.

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

El comando inicializa la tienda y las cuatro monedas junto con la primera cuenta, sin crear ventas, tasas ni saldos. `pnpm db:seed:demo` acepta las mismas variables para una base de demostración local en modo `development`. Los comandos conservan cuentas existentes.

### Arrancar

```text
pnpm dev
```

Abre <http://localhost:5173/> e inicia sesión con la cuenta creada. Vite envía `/api` a Express en `127.0.0.1:3000`. La API usa el `APP_ORIGIN` de `.env` al verificar las peticiones de autenticación.

## Verificación

```text
pnpm db:validate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Las pruebas de humo comprueban arranque HTTP, respuestas de error y protección de sesión. Para probar con PostgreSQL, crea una base dedicada, aplica las migraciones a esa base y define `TEST_DATABASE_URL` durante `pnpm test:integration`. Estos comandos usan la configuración local de Compose.

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

## Compilación y documentación

`pnpm build` genera `apps/web/dist` y `apps/api/dist`. `pnpm --filter @max-sport/api start` inicia la API compilada. Para servir la web compilada, configura el proxy HTTPS para enviar `/api` a la API y las rutas web a `index.html`. En producción usa `NODE_ENV=production`, un `APP_ORIGIN` HTTPS y credenciales propias de PostgreSQL.

- [Prompt maestro](docs/MASTER_PROMPT.md) y [prompts por fase](docs/02_PROMPTS_POR_FASES.md)
- [Requisitos](docs/requirements.md), [flujos](docs/flows.md) y [modelo de dominio](docs/domain.md)
- [Decisiones](docs/decisions.md), [API](docs/api.md) y [roadmap](docs/roadmap.md)
