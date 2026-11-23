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

Costos y utilidad son permisos independientes. Se habilitan inicialmente para Administrador, Gerente y Finanzas. Las fases que incorporen costos y rentabilidad aplicarán los permisos al construir las respuestas de la API, además de ocultar controles en el portal.

Cada mutación auditada registra el actor y el cambio en la misma transacción. Para cuentas y contactos personales, las instantáneas registran estado, rol o presencia de campos. Las contraseñas, los tokens, el contenido de notas y los datos de contacto quedan fuera de la bitácora.

## Precisión y fechas

- Los valores originales admiten hasta ocho decimales en PostgreSQL y las tasas hasta doce, con `Decimal` en cálculos. Los contratos de dinero usarán cadenas decimales. Se propone USD con 2 decimales, COP con 0 por defecto, VES con 2 y USDT con 6. La moneda configura la escala operativa de su captura.
- La conversión conserva precisión hasta el redondeo monetario. Los importes de línea contabilizados en USD redondean a centavos con `ROUND_HALF_UP`. Los totales suman los importes persistidos. Costos unitarios FIFO retienen mayor precisión. Cada lote conserva su costo total y la última asignación absorbe el residuo de centavos.
- Fletes se prorratean por cantidad de pares. Descuentos globales se prorratean por valor. Se distribuyen centavos restantes por mayor resto y se usa un identificador estable para desempatar. El criterio de flete queda guardado en el documento.
- El POS valida cobertura en centavos USD con los montos de cada pago ya redondeados. El excedente se registra como vuelto explícito en su cuenta o se ajusta el importe aplicado antes de confirmar. La cobertura final debe ser exacta en centavos.
- Las fechas de eventos se guardan con zona (`timestamptz`). Para reportes, semana de lunes a domingo y zona inicial `America/Caracas`, configurable. Los filtros convierten los límites locales a UTC antes de consultar.
- La pantalla de tasas captura y muestra horas en la zona del dispositivo y la indica en el formulario. Cada petición registra un instante ISO 8601 con zona. La zona configurada en la tienda regirá los cortes de los reportes.

## Transacciones

- En fases de inventario, bloquear primero variantes en orden estable y después lotes y documentos afectados. Verificar disponibilidad, reservas y unidades retornables dentro de la transacción. Aplicar restricciones SQL a saldos donde corresponda y reintentar conflictos de serialización cuando la operación tenga clave idempotente.
- La clave idempotente persiste con su resultado y la huella del contenido. La misma clave con contenido diferente produce un conflicto. Las operaciones confirmadas se corrigen mediante documentos compensatorios y auditoría.
