import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadProjectEnv, parseRuntimeConfig } from '../src/config.js';
import { createDatabase } from '../src/database.js';

loadProjectEnv();
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'Define TEST_DATABASE_URL con una base de pruebas que tenga la migración aplicada.',
  );
}

const config = parseRuntimeConfig({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  LOG_LEVEL: 'silent',
});
const database = createDatabase(config.DATABASE_URL);
const app = createApp(database, config);
const key = randomUUID();
const email = `${key}@example.test`;
const password = `pruebas-local-${key}`;
let roleId: string | undefined;
let userId: string | undefined;

beforeAll(async () => {
  const role = await database.role.create({ data: { code: `SMOKE_${key}`, label: 'Pruebas' } });
  roleId = role.id;
  const user = await database.user.create({
    data: {
      email,
      displayName: 'Usuario de pruebas',
      roleId,
      passwordHash: await hashPassword(password),
    },
  });
  userId = user.id;
}, 15_000);

afterAll(async () => {
  try {
    if (userId) {
      await database.auditLog.deleteMany({ where: { userId } });
      await database.user.delete({ where: { id: userId } });
    }
    if (roleId) await database.role.delete({ where: { id: roleId } });
  } finally {
    await database.$disconnect();
  }
});

it('responde con PostgreSQL conectado', async () => {
  await request(app).get('/api/v1/health/ready').expect(200, { status: 'ready' });
});

it('rechaza una contraseña incorrecta', async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', config.APP_ORIGIN)
    .send({ email, password: 'incorrecta' })
    .expect(401);
  expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  expect(response.headers['set-cookie']).toBeUndefined();
});

it('crea una sesión persistida, audita el acceso y revoca la cookie al salir', async () => {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', config.APP_ORIGIN)
    .send({ email: ` ${email.toUpperCase()} `, password })
    .expect(200);
  const cookieHeader = String(response.headers['set-cookie']);
  const [cookie = ''] = cookieHeader.split(';', 1);
  expect(cookieHeader).toContain('HttpOnly');
  expect(cookieHeader).toContain('SameSite=Lax');
  expect(response.body.user).toEqual({
    id: userId,
    email,
    displayName: 'Usuario de pruebas',
    role: { code: `SMOKE_${key}`, label: 'Pruebas' },
  });

  const sessions = await database.userSession.findMany({ where: { user: { email } } });
  expect(sessions).toHaveLength(1);
  const tokenHash = sessions[0]?.tokenHash ?? '';
  expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(cookie).not.toContain(tokenHash);
  expect(await database.auditLog.count({ where: { user: { email }, action: 'auth.login' } })).toBe(
    1,
  );

  await agent.get('/api/v1/auth/me').expect(200, response.body);
  await agent.post('/api/v1/auth/logout').set('Origin', config.APP_ORIGIN).expect(204);
  await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  expect(await database.userSession.count({ where: { user: { email } } })).toBe(0);
});
