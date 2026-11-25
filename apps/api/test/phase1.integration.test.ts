import { randomUUID } from 'node:crypto';
import {
  brandRecord,
  contactRecord,
  modelRecord,
  rateRecord,
  resourcePermission,
  roleCodeSchema,
  sessionResponseSchema,
  userRecord,
  variantRecord,
} from '@max-sport/shared';
import type { RoleCode } from '@max-sport/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadProjectEnv, parseRuntimeConfig } from '../src/config.js';
import { createDatabase } from '../src/database.js';

loadProjectEnv();
if (!process.env.TEST_DATABASE_URL)
  throw new Error('Define una base de pruebas migrada en TEST_DATABASE_URL.');

const config = parseRuntimeConfig({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  LOG_LEVEL: 'silent',
});
const db = createDatabase(config.DATABASE_URL);
const app = createApp(db, config);
const key = 'phase1-' + randomUUID().slice(0, 12);
const password = 'pruebas-fase1-' + key;
const origin = config.APP_ORIGIN;
const prefix = '/api/v1';
const marker = (suffix: string) => key + '-' + suffix;
const agents = new Map<RoleCode, ReturnType<typeof request.agent>>();
const ids = new Map<RoleCode, string>();
const contact = (name: string) => ({
  name,
  document: marker('Doc'),
  phone: null,
  email: marker('contact') + '@example.test',
  address: null,
  notes: 'dato de prueba',
});
const effectiveAt = '2026-11-23T09:00:00-04:00';

function agent(role: RoleCode) {
  const value = agents.get(role);
  if (!value) throw new Error('No se abrió sesión para el rol de prueba.');
  return value;
}

beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  for (const role of roleCodeSchema.options) {
    const username = marker(role.toLowerCase());
    const created = await db.user.create({
      data: {
        username,
        email: username + '@example.test',
        passwordHash,
        displayName: marker(role),
        role: { connect: { code: role } },
      },
      select: { id: true },
    });
    ids.set(role, created.id);
    const userAgent = request.agent(app);
    await userAgent
      .post(prefix + '/auth/login')
      .set('Origin', origin)
      .send({ username, password })
      .expect(200);
    agents.set(role, userAgent);
  }
}, 25_000);

afterAll(async () => {
  try {
    const users = await db.user.findMany({
      where: { email: { startsWith: key } },
      select: { id: true },
    });
    const actorIds = users.map(({ id }) => id);
    await db.auditLog.deleteMany({ where: { userId: { in: actorIds } } });
    await db.exchangeRate.deleteMany({
      where: { createdById: { in: actorIds }, replacesId: { not: null } },
    });
    await db.exchangeRate.deleteMany({ where: { createdById: { in: actorIds } } });
    await db.moneyAccount.deleteMany({ where: { name: { startsWith: key } } });
    await db.productVariant.deleteMany({ where: { sku: { startsWith: key.toUpperCase() } } });
    await db.productModel.deleteMany({ where: { name: { startsWith: key } } });
    await db.brand.deleteMany({ where: { name: { startsWith: key } } });
    await db.customer.deleteMany({ where: { name: { startsWith: key } } });
    await db.supplier.deleteMany({ where: { name: { startsWith: key } } });
    await db.user.deleteMany({ where: { id: { in: actorIds } } });
  } finally {
    await db.$disconnect();
  }
}, 15_000);

it('autoriza consultas y mutaciones según los cinco roles', async () => {
  const samples = [
    {
      role: 'ADMIN',
      allowed: '/users',
      denied: null,
      permission: resourcePermission('users', 'create'),
    },
    { role: 'MANAGER', allowed: '/audit', denied: '/users', permission: 'shop.update' },
    { role: 'SELLER', allowed: '/customers', denied: '/suppliers', permission: 'customers.create' },
    { role: 'INVENTORY', allowed: '/variants', denied: '/audit', permission: 'variants.update' },
    { role: 'FINANCE', allowed: '/rates', denied: '/customers', permission: 'rates.update' },
  ] as const;
  await request(app)
    .get(prefix + '/brands')
    .expect(401);
  for (const { role, allowed, denied, permission } of samples) {
    const current = agent(role);
    const profile = await current.get(prefix + '/auth/me').expect(200);
    expect(sessionResponseSchema.parse(profile.body).user.permissions).toContain(permission);
    await current.get(prefix + allowed).expect(200);
    if (denied) await current.get(prefix + denied).expect(403);
  }
  await agent('SELLER')
    .post(prefix + '/brands')
    .set('Origin', origin)
    .send({ name: marker('brand') })
    .expect(403);
  await agent('INVENTORY')
    .post(prefix + '/brands')
    .send({ name: marker('brand') })
    .expect(403);
});

it('guarda marca, modelo y variante, detecta SKU duplicado y registra el precio cambiado', async () => {
  const inventory = agent('INVENTORY');
  const brand = brandRecord.parse(
    (
      await inventory
        .post(prefix + '/brands')
        .set('Origin', origin)
        .send({ name: marker('Marca') })
        .expect(201)
    ).body,
  );
  await inventory
    .post(prefix + '/brands')
    .set('Origin', origin)
    .send({ name: brand.name.toUpperCase() })
    .expect(409);
  const model = modelRecord.parse(
    (
      await inventory
        .post(prefix + '/models')
        .set('Origin', origin)
        .send({
          name: marker('Modelo'),
          brandId: brand.id,
          description: 'Modelo de integración',
        })
        .expect(201)
    ).body,
  );
  const sku = marker('sku');
  const input = {
    modelId: model.id,
    size: 38,
    color: null,
    sku,
    salePriceUsd: '30.05',
    lowStockThreshold: 2,
  };
  const created = variantRecord.parse(
    (
      await inventory
        .post(prefix + '/variants')
        .set('Origin', origin)
        .send(input)
        .expect(201)
    ).body,
  );
  await inventory
    .post(prefix + '/variants')
    .set('Origin', origin)
    .send({ ...input, size: 39, sku: ' ' + sku.toUpperCase() + ' ' })
    .expect(409);
  await inventory
    .post(prefix + '/variants')
    .set('Origin', origin)
    .send({ ...input, size: 27, sku: marker('invalid') })
    .expect(400);
  const updated = await inventory
    .put(prefix + '/variants/' + created.id)
    .set('Origin', origin)
    .send({ ...input, salePriceUsd: '31.10' })
    .expect(200);
  expect(updated.body.salePriceUsd).toBe('31.10');
  const seller = await agent('SELLER')
    .get(prefix + '/variants/' + created.id)
    .expect(200);
  expect(Object.keys(seller.body)).not.toEqual(expect.arrayContaining(['costUsd', 'profitUsd']));
  expect(seller.body).not.toHaveProperty('costUsd');
  expect(seller.body).not.toHaveProperty('profitUsd');

  const audit = await agent('ADMIN')
    .get(prefix + '/audit')
    .query({ q: created.id })
    .expect(200);
  expect(audit.body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: 'variants.update',
        entityId: created.id,
        before: expect.objectContaining({ salePriceUsd: '30.05' }),
        after: expect.objectContaining({ salePriceUsd: '31.10' }),
      }),
    ]),
  );
});

it('crea clientes y proveedores, archiva sin borrar y sanea la auditoría', async () => {
  const seller = agent('SELLER');
  const input = contact(marker('Cliente'));
  const created = contactRecord.parse(
    (
      await seller
        .post(prefix + '/customers')
        .set('Origin', origin)
        .send(input)
        .expect(201)
    ).body,
  );
  await seller
    .post(prefix + '/customers')
    .set('Origin', origin)
    .send({ ...input, document: input.document.toUpperCase() })
    .expect(409);
  await seller
    .put(prefix + '/customers/' + created.id)
    .set('Origin', origin)
    .send({ ...input, name: marker('Cliente editado') })
    .expect(200);
  await seller
    .delete(prefix + '/customers/' + created.id)
    .set('Origin', origin)
    .expect(403);

  const supplier = await agent('INVENTORY')
    .post(prefix + '/suppliers')
    .set('Origin', origin)
    .send(contact(marker('Proveedor')))
    .expect(201);
  await agent('FINANCE')
    .get(prefix + '/suppliers/' + supplier.body.id)
    .expect(200);
  const admin = agent('ADMIN');
  await admin
    .delete(prefix + '/customers/' + created.id)
    .set('Origin', origin)
    .expect(204);
  const archived = await seller
    .get(prefix + '/customers')
    .query({ q: key, status: 'archived' })
    .expect(200);
  expect(archived.body.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created.id, active: false })]),
  );
  await admin
    .post(prefix + '/customers/' + created.id + '/restore')
    .set('Origin', origin)
    .expect(204);
  const events = await admin
    .get(prefix + '/audit')
    .query({ q: created.id })
    .expect(200);
  expect(events.body.total).toBe(4);
  expect(JSON.stringify(events.body)).not.toContain(input.email);
  expect(JSON.stringify(events.body)).not.toContain(input.document);
});

it('conserva las revisiones, fecha, autor y precisión de las tasas', async () => {
  const finance = agent('FINANCE');
  const input = { currencyCode: 'COP', unitsPerUsd: '4000.000000000001', effectiveAt };
  await finance
    .post(prefix + '/rates')
    .set('Origin', origin)
    .send({ ...input, unitsPerUsd: '0' })
    .expect(400);
  await finance
    .post(prefix + '/rates')
    .set('Origin', origin)
    .send({ ...input, currencyCode: 'USD', unitsPerUsd: '2' })
    .expect(400);
  await agent('SELLER')
    .post(prefix + '/rates')
    .set('Origin', origin)
    .send(input)
    .expect(403);
  const rate = rateRecord.parse(
    (
      await finance
        .post(prefix + '/rates')
        .set('Origin', origin)
        .send(input)
        .expect(201)
    ).body,
  );
  expect(rate.unitsPerUsd).toBe(input.unitsPerUsd);
  expect(rate.effectiveAt).toBe('2026-11-23T13:00:00.000Z');
  expect(rate.createdBy.displayName).toBe(marker('FINANCE'));
  const nextInput = { unitsPerUsd: '4050.36', effectiveAt };
  const replacement = rateRecord.parse(
    (
      await finance
        .put(prefix + '/rates/' + rate.id)
        .set('Origin', origin)
        .send(nextInput)
        .expect(200)
    ).body,
  );
  expect(replacement.replacesId).toBe(rate.id);
  const previous = rateRecord.parse(
    (await finance.get(prefix + '/rates/' + rate.id).expect(200)).body,
  );
  expect(previous.active).toBe(false);
  expect(previous.unitsPerUsd).toBe(rate.unitsPerUsd);
  await finance
    .put(prefix + '/rates/' + rate.id)
    .set('Origin', origin)
    .send(nextInput)
    .expect(409);
  await finance
    .delete(prefix + '/rates/' + replacement.id)
    .set('Origin', origin)
    .expect(204);
  await finance
    .delete(prefix + '/rates/' + replacement.id)
    .set('Origin', origin)
    .expect(204);
  const events = await finance
    .get(prefix + '/audit')
    .query({ q: replacement.id })
    .expect(200);
  expect(events.body.total).toBe(1);
}, 15_000);

it('aplica configuración de tienda y monedas y registra cuentas habilitadas', async () => {
  const admin = agent('ADMIN');
  const finance = agent('FINANCE');
  const settings = (await admin.get(prefix + '/shop').expect(200)).body;
  const ves = (await admin.get(prefix + '/currencies').expect(200)).body.find(
    (item: { code: string }) => item.code === 'VES',
  );
  try {
    await admin
      .put(prefix + '/shop')
      .set('Origin', origin)
      .send({ ...settings, timezone: 'Invalid/Zone' })
      .expect(400);
    await agent('SELLER')
      .put(prefix + '/shop')
      .set('Origin', origin)
      .send(settings)
      .expect(403);
    await admin
      .put(prefix + '/shop')
      .set('Origin', origin)
      .send({ ...settings, timezone: 'America/Bogota', lowStockThreshold: 5 })
      .expect(200);
    expect((await admin.get(prefix + '/shop').expect(200)).body.timezone).toBe('America/Bogota');

    const account = { name: marker('Caja'), currencyCode: 'VES', kind: 'MOBILE' };
    await finance
      .put(prefix + '/currencies/USD')
      .set('Origin', origin)
      .send({ name: 'Dólar', minorUnits: 2, active: false })
      .expect(400);
    await finance
      .put(prefix + '/currencies/VES')
      .set('Origin', origin)
      .send({ ...ves, active: true })
      .expect(200);
    const added = await finance
      .post(prefix + '/accounts')
      .set('Origin', origin)
      .send(account)
      .expect(201);
    await finance
      .put(prefix + '/currencies/VES')
      .set('Origin', origin)
      .send({ ...ves, active: false })
      .expect(200);
    await finance
      .post(prefix + '/accounts')
      .set('Origin', origin)
      .send({ ...account, name: marker('Otra caja') })
      .expect(409);
    await finance.get(prefix + '/accounts/' + added.body.id).expect(200);
  } finally {
    await admin
      .put(prefix + '/shop')
      .set('Origin', origin)
      .send(settings)
      .expect(200);
    await finance
      .put(prefix + '/currencies/VES')
      .set('Origin', origin)
      .send(ves)
      .expect(200);
  }
}, 15_000);

it('aplica en la sesión los permisos configurables de costos y utilidad', async () => {
  const admin = agent('ADMIN');
  const seller = agent('SELLER');
  const manager = agent('MANAGER');
  const roles = (await admin.get(prefix + '/roles').expect(200)).body;
  const previous = roles.find((role: { code: string }) => role.code === 'SELLER');
  const path = prefix + '/roles/SELLER/financial-permissions';
  try {
    await manager.put(path).set('Origin', origin).send({ costs: true, profits: true }).expect(403);
    await admin.put(path).set('Origin', origin).send({ costs: false, profits: true }).expect(200);
    const profile = sessionResponseSchema.parse(
      (await seller.get(prefix + '/auth/me').expect(200)).body,
    );
    expect(profile.user.permissions).toContain('profits.read');
    expect(profile.user.permissions).not.toContain('costs.read');
  } finally {
    await admin.put(path).set('Origin', origin).send(previous).expect(200);
  }
});

it('obliga a cambiar contraseña temporal y revoca sesiones al cambiar credenciales, rol o estado', async () => {
  const admin = agent('ADMIN');
  const username = marker('new');
  const email = marker('staff-contact') + '@example.test';
  const account = {
    username: username.toUpperCase(),
    email,
    displayName: marker('Staff'),
    roleCode: 'SELLER',
    temporaryPassword: password,
  };
  const created = userRecord.parse(
    (
      await admin
        .post(prefix + '/users')
        .set('Origin', origin)
        .send(account)
        .expect(201)
    ).body,
  );
  expect(created.username).toBe(username);
  await admin
    .post(prefix + '/users')
    .set('Origin', origin)
    .send({ ...account, username, email: marker('duplicate') + '@example.test' })
    .expect(409);
  const search = await admin
    .get(prefix + '/users')
    .query({ q: username })
    .expect(200);
  expect(search.body.items).toContainEqual(created);
  const staff = request.agent(app);
  const first = await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username, password })
    .expect(200);
  const [cookie = ''] = String(first.headers['set-cookie']).split(';', 1);
  expect(first.body.user.mustChangePassword).toBe(true);
  expect((await staff.get(prefix + '/customers').expect(403)).body.error.code).toBe(
    'PASSWORD_CHANGE_REQUIRED',
  );
  const newPassword = 'Nvo!42';
  await staff
    .post(prefix + '/auth/password')
    .set('Origin', origin)
    .send({ currentPassword: password, newPassword: newPassword.slice(0, 5) })
    .expect(400);
  await staff
    .post(prefix + '/auth/password')
    .set('Origin', origin)
    .send({ currentPassword: 'incorrecta', newPassword })
    .expect(400);
  await staff
    .post(prefix + '/auth/password')
    .set('Origin', origin)
    .send({ currentPassword: password, newPassword })
    .expect(204);
  await request(app)
    .get(prefix + '/auth/me')
    .set('Cookie', cookie)
    .expect(401);
  await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username, password })
    .expect(401);
  await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username, password: newPassword })
    .expect(200);
  await staff.get(prefix + '/customers').expect(200);

  const renamedUsername = marker('renamed');
  await admin
    .put(prefix + '/users/' + created.id)
    .set('Origin', origin)
    .send({
      email,
      username: renamedUsername,
      displayName: account.displayName,
      roleCode: 'SELLER',
    })
    .expect(200);
  await staff.get(prefix + '/auth/me').expect(401);
  await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username, password: newPassword })
    .expect(401);
  await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username: renamedUsername, password: newPassword })
    .expect(200);

  await admin
    .put(prefix + '/users/' + created.id)
    .set('Origin', origin)
    .send({ email, displayName: account.displayName, roleCode: 'INVENTORY' })
    .expect(200);
  await staff.get(prefix + '/auth/me').expect(401);
  await staff
    .post(prefix + '/auth/login')
    .set('Origin', origin)
    .send({ username: renamedUsername, password: newPassword })
    .expect(200);
  await staff.get(prefix + '/customers').expect(403);
  await admin
    .delete(prefix + '/users/' + created.id)
    .set('Origin', origin)
    .expect(204);
  await staff.get(prefix + '/auth/me').expect(401);
  await admin
    .delete(prefix + '/users/' + ids.get('ADMIN'))
    .set('Origin', origin)
    .expect(409);
  const events = await admin
    .get(prefix + '/audit')
    .query({ q: created.id })
    .expect(200);
  expect(JSON.stringify(events.body)).not.toContain(password);
  expect(JSON.stringify(events.body)).not.toContain(email);
  expect(JSON.stringify(events.body)).not.toContain(renamedUsername);
}, 25_000);
