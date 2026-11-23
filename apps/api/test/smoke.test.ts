import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { parseRuntimeConfig } from '../src/config.js';
import { createDatabase } from '../src/database.js';

const config = parseRuntimeConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  LOG_LEVEL: 'silent',
});
const database = createDatabase(config.DATABASE_URL);
const app = createApp(database, config);

afterAll(async () => database.$disconnect());

describe('API Fase 0', () => {
  it('responde al chequeo de actividad sin depender de la base de datos', async () => {
    await request(app).get('/api/v1/health/live').expect(200, { status: 'ok' });
  });

  it('reporta falta de preparación cuando PostgreSQL no está disponible', async () => {
    const response = await request(app).get('/api/v1/health/ready').expect(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('devuelve el identificador de solicitud en errores', async () => {
    const response = await request(app).get('/api/v1/missing').expect(404);
    expect(response.body.error).toMatchObject({
      code: 'NOT_FOUND',
      requestId: response.headers['x-request-id'],
    });
  });

  it('rechaza solicitudes de sesión sin el origen autorizado', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({}).expect(403);
    expect(response.body.error.code).toBe('ORIGIN_REJECTED');
  });

  it('valida un cuerpo de login malformado', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', config.APP_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('rechaza el perfil sin una sesión', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });
});

it('exige HTTPS para la configuración de producción', () => {
  expect(() =>
    parseRuntimeConfig({
      ...config,
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '0',
      API_PORT: '3000',
    }),
  ).toThrow('APP_ORIGIN');
});
