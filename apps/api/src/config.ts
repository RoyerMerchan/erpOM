import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export function loadProjectEnv() {
  const path = fileURLToPath(new URL('../../../.env', import.meta.url));
  try {
    loadEnvFile(path);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export const databaseUrlSchema = z.string().refine((value) => {
  const url = URL.parse(value);
  return (
    url !== null && ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname.length > 1
  );
}, 'Usa una URL PostgreSQL que incluya el nombre de la base.');

const runtimeSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: databaseUrlSchema,
    API_HOST: z.string().trim().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z
      .string()
      .refine((value) => {
        const url = URL.parse(value);
        return url !== null && ['http:', 'https:'].includes(url.protocol) && url.origin === value;
      }, 'Usa un origen HTTP o HTTPS sin ruta ni barra final.')
      .default('http://localhost:5173'),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .refine(
    ({ NODE_ENV, APP_ORIGIN }) => NODE_ENV !== 'production' || APP_ORIGIN.startsWith('https://'),
    {
      path: ['APP_ORIGIN'],
      message: 'En producción se requiere HTTPS.',
    },
  );

export type RuntimeConfig = z.output<typeof runtimeSchema>;

export function parseRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const result = runtimeSchema.safeParse(environment);
  if (!result.success) {
    const errors = result.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);
    throw new Error(`Configuración inválida. ${errors.join(' ')}`);
  }
  return result.data;
}
