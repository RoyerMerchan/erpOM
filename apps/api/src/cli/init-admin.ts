import { emailSchema } from '@max-sport/shared';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { loadProjectEnv, parseRuntimeConfig } from '../config.js';
import { createDatabase } from '../database.js';

const credentialsSchema = z.object({
  ADMIN_EMAIL: emailSchema,
  ADMIN_NAME: z.string().trim().min(1).max(120),
  ADMIN_PASSWORD: z.string().min(15).max(128),
});

const currencies = [
  { code: 'USD', name: 'Dólar estadounidense', minorUnits: 2 },
  { code: 'COP', name: 'Peso colombiano', minorUnits: 0 },
  { code: 'VES', name: 'Bolívar', minorUnits: 2 },
  { code: 'USDT', name: 'Tether USD', minorUnits: 6 },
];

async function main() {
  loadProjectEnv();
  const config = parseRuntimeConfig(process.env);
  const demo = process.argv.includes('--demo');
  const localDatabase = ['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(config.DATABASE_URL).hostname,
  );
  if (demo && (config.NODE_ENV !== 'development' || !localDatabase)) {
    throw new Error('La demostración requiere NODE_ENV=development y PostgreSQL en loopback.');
  }

  const parsed = credentialsSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Revisa ${fields}. ADMIN_PASSWORD requiere entre 15 y 128 caracteres.`);
  }

  const { ADMIN_EMAIL: email, ADMIN_NAME: displayName, ADMIN_PASSWORD: password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const database = createDatabase(config.DATABASE_URL);

  try {
    const created = await database.$transaction(
      async (transaction) => {
        const existingUser = await transaction.user.findFirst({
          where: { OR: [{ email }, { role: { code: 'ADMIN' } }] },
          select: { id: true },
        });
        if (existingUser) return false;

        const role = await transaction.role.upsert({
          where: { code: 'ADMIN' },
          create: { code: 'ADMIN', label: 'Administrador' },
          update: {},
        });
        const user = await transaction.user.create({
          data: { email, displayName, passwordHash, roleId: role.id },
        });
        await transaction.shopSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
        for (const currency of currencies) {
          await transaction.currency.upsert({
            where: { code: currency.code },
            create: currency,
            update: {},
          });
        }
        await transaction.auditLog.create({
          data: { action: 'auth.bootstrap', entity: 'User', entityId: user.id, userId: user.id },
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );

    if (created) {
      console.info(demo ? 'Cuenta de demostración local creada.' : 'Administrador inicial creado.');
    } else {
      console.error('Ya existe un administrador o una cuenta con ese correo.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      'No se pudo crear el administrador. Revisa la conexión y las migraciones.',
      error instanceof Error ? error.name : 'Error',
    );
    process.exitCode = 1;
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
