import { randomUUID } from 'node:crypto';
import { inventoryRowSchema, pageSchema, purchaseDetailSchema } from '@max-sport/shared';
import type { PurchaseDetail, RoleCode } from '@max-sport/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadProjectEnv, parseRuntimeConfig } from '../src/config.js';
import { createDatabase } from '../src/database.js';

loadProjectEnv();
if (!process.env.TEST_DATABASE_URL)
  throw new Error('Define TEST_DATABASE_URL con las migraciones aplicadas.');
const config = parseRuntimeConfig({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  LOG_LEVEL: 'silent',
});
const db = createDatabase(config.DATABASE_URL);
const app = createApp(db, config);
const key = randomUUID().slice(0, 12);
const origin = config.APP_ORIGIN;
const api = '/api/v1';
const date = '2026-11-23T09:00:00-04:00';
const testRoles = ['ADMIN', 'INVENTORY', 'SELLER', 'FINANCE'] as const;
const sessions = new Map<RoleCode, ReturnType<typeof request.agent>>();
const modelName = 'Legend ' + key;
let supplierId: string;
let usdAccountId: string;
let copAccountId: string;

function user(role: RoleCode) {
  const current = sessions.get(role);
  if (!current) throw new Error('Falta la sesión de pruebas.');
  return current;
}

beforeAll(async () => {
  const password = 'fase-compras-' + randomUUID();
  const passwordHash = await hashPassword(password);
  for (const role of testRoles) {
    const username = 'p2-' + role.toLowerCase() + '-' + key;
    await db.user.create({
      data: {
        username,
        email: username + '@example.test',
        displayName: role + ' ' + key,
        passwordHash,
        role: { connect: { code: role } },
      },
    });
    const agent = request.agent(app);
    await agent
      .post(api + '/auth/login')
      .set('Origin', origin)
      .send({ username, password })
      .expect(200);
    sessions.set(role, agent);
  }
  supplierId = (await db.supplier.create({ data: { name: 'Proveedor QA ' + key } })).id;
  usdAccountId = (
    await db.moneyAccount.create({
      data: { name: 'Caja USD ' + key, currencyCode: 'USD', kind: 'CASH' },
    })
  ).id;
  copAccountId = (
    await db.moneyAccount.create({
      data: { name: 'Caja COP ' + key, currencyCode: 'COP', kind: 'CASH' },
    })
  ).id;
}, 25_000);

afterAll(async () => db.$disconnect());

const chooseModel = () => ({
  mode: 'new',
  name: modelName,
  brand: { mode: 'new', name: 'Marca ' + key },
});
const line = (size: number, quantity: number, unitCostOriginal: string) => ({
  size,
  quantity,
  unitCostOriginal,
  salePriceUsd: '50.00',
});
const getDetail = (body: unknown) => purchaseDetailSchema.parse(body);
const purchaseUrl = (id: string) => api + '/purchases/' + id;

async function create(
  lines: ReturnType<typeof line>[],
  currencyCode = 'COP',
  unitsPerUsd: string | null = '4000',
) {
  const response = await user('ADMIN')
    .post(api + '/purchases')
    .set('Origin', origin)
    .send({
      supplierId,
      documentAt: date,
      reference: key,
      currencyCode,
      unitsPerUsd,
      groups: [{ model: chooseModel(), lines }],
    })
    .expect(201);
  return getDetail(response.body);
}

async function stock(role: RoleCode, query: Record<string, string> = {}) {
  const { body } = await user(role)
    .get(api + '/inventory')
    .query({ q: modelName, ...query })
    .expect(200);
  return pageSchema(inventoryRowSchema).parse(body).items;
}

function confirm(purchase: PurchaseDetail, extra = {}, operationId = randomUUID()) {
  return user('ADMIN')
    .post(purchaseUrl(purchase.id) + '/receive')
    .set('Origin', origin)
    .send({ operationId, revision: purchase.revision, ...extra });
}

it('recibe Legend una vez ante concurrencia, conserva su tasa y permite recomprar sin duplicar el modelo', async () => {
  const draft = await create([line(38, 3, '80000'), line(39, 5, '80000'), line(40, 7, '84000')]);
  expect(draft).toMatchObject({
    status: 'DRAFT',
    pairCount: 15,
    financial: { totalOriginal: '1228000', totalUsd: '307.00' },
  });
  expect(await stock('ADMIN')).toEqual([]);
  expect(await db.stockMovement.count({ where: { purchaseItem: { purchaseId: draft.id } } })).toBe(
    0,
  );

  const operationId = randomUUID();
  const [first, second] = await Promise.all([
    confirm(draft, {}, operationId).expect(200),
    confirm(draft, {}, operationId).expect(200),
  ]);
  const receipt = getDetail(first.body);
  expect(receipt.status).toBe('CONFIRMED');
  expect(receipt.paymentStatus).toBe('PENDING');
  expect(getDetail(second.body).items.map(({ id }) => id)).toEqual(
    receipt.items.map(({ id }) => id),
  );
  expect(receipt.items.map(({ costs }) => costs?.unitCostUsd)).toEqual(['20', '20', '21']);
  expect(await db.inventoryLot.count({ where: { purchaseItem: { purchaseId: draft.id } } })).toBe(
    3,
  );
  expect(await db.stockMovement.count({ where: { purchaseItem: { purchaseId: draft.id } } })).toBe(
    3,
  );
  expect(await db.moneyMovement.count({ where: { payment: { purchaseId: draft.id } } })).toBe(0);
  await confirm(draft, { revision: 999 }, operationId).expect(409);

  const variantId = receipt.items[0]?.variantId;
  if (!variantId || !receipt.financial?.exchangeRateId)
    throw new Error('Recepción sin variante o tasa.');
  await db.productVariant.update({ where: { id: variantId }, data: { lowStockThreshold: 3 } });
  const low = await stock('ADMIN', { stock: 'LOW', size: '38' });
  expect(low).toEqual([
    expect.objectContaining({
      physical: 3,
      reserved: 0,
      available: 3,
      lowStock: true,
      unitCostUsd: '20',
    }),
  ]);
  const seller = (await stock('SELLER', { size: '38' }))[0];
  expect(seller).not.toHaveProperty('unitCostUsd');
  expect(seller).not.toHaveProperty('marginUsd');
  const internal = (await user('INVENTORY').get(purchaseUrl(receipt.id)).expect(200)).body;
  expect(internal).not.toHaveProperty('financial');
  expect(internal.items[0]).not.toHaveProperty('costs');
  const variantBase = await db.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  await user('INVENTORY')
    .put(api + '/variants/' + variantId)
    .set('Origin', origin)
    .send({
      modelId: variantBase.modelId,
      size: 29,
      color: variantBase.color,
      sku: variantBase.sku,
      salePriceUsd: '50.00',
      lowStockThreshold: 3,
    })
    .expect(409);
  await user('SELLER').get(purchaseUrl(receipt.id)).expect(403);
  await user('INVENTORY')
    .post(api + '/purchases')
    .set('Origin', origin)
    .send({})
    .expect(403);

  await user('ADMIN')
    .put(api + '/rates/' + receipt.financial.exchangeRateId)
    .set('Origin', origin)
    .send({ unitsPerUsd: '4100', effectiveAt: date })
    .expect(200);
  const historical = getDetail((await user('ADMIN').get(purchaseUrl(receipt.id)).expect(200)).body);
  expect(historical.financial).toMatchObject({ unitsPerUsd: '4000', totalUsd: '307.00' });

  const restock = await create([line(38, 2, '88000')]);
  const secondReceipt = getDetail((await confirm(restock).expect(200)).body);
  expect(secondReceipt.items[0]?.variantId).toBe(variantId);
  expect(await db.productModel.count({ where: { name: modelName } })).toBe(1);
  expect((await stock('ADMIN', { size: '38' }))[0]?.physical).toBe(5);

  await db.inventoryBalance.update({ where: { variantId }, data: { reserved: 4 } });
  const adjust = () =>
    user('INVENTORY')
      .post(api + '/inventory/' + variantId + '/adjustments')
      .set('Origin', origin)
      .send({ operationId: randomUUID(), quantityDelta: -1, reason: 'Diferencia de conteo' });
  const results = await Promise.all([adjust(), adjust()]);
  expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
  const firstAllocation = await db.stockLotAllocation.findFirst({
    where: { movement: { variantId, kind: 'ADJUST_OUT' } },
    include: { lot: { include: { purchaseItem: true } } },
  });
  expect(firstAllocation?.lot.purchaseItem?.purchaseId).toBe(receipt.id);
  expect(firstAllocation?.costUsd.toFixed(2)).toBe('20.00');
  expect((await stock('ADMIN', { size: '38' }))[0]).toMatchObject({
    physical: 4,
    reserved: 4,
    available: 0,
  });
  await user('ADMIN')
    .post(purchaseUrl(receipt.id) + '/void')
    .set('Origin', origin)
    .send({ reason: 'Lote usado' })
    .expect(409);
}, 40_000);

it('registra pagos mixtos, idempotencia y reversión sin afectar stock ni duplicar caja', async () => {
  const draft = await create([line(42, 1, '1228000')]);
  const received = getDetail((await confirm(draft).expect(200)).body);
  const purchase = purchaseUrl(received.id);
  const payments = (input: object) =>
    user('FINANCE')
      .post(purchase + '/payments')
      .set('Origin', origin)
      .send(input);
  const first = {
    operationId: randomUUID(),
    accountId: usdAccountId,
    paidAt: date,
    amountOriginal: '100',
  };
  const paid = getDetail((await payments(first).expect(200)).body);
  expect(paid).toMatchObject({
    paymentStatus: 'PARTIAL',
    financial: { balanceUsd: '207.00', balanceOriginal: null },
  });
  await payments(first).expect(200);
  await user('FINANCE')
    .put(api + '/accounts/' + usdAccountId)
    .set('Origin', origin)
    .send({ name: 'Caja USD ' + key, currencyCode: 'VES', kind: 'CASH' })
    .expect(409);
  await payments({ ...first, amountOriginal: '101' }).expect(409);
  await payments({ ...first, operationId: randomUUID(), amountOriginal: '300' }).expect(409);

  const open = await user('FINANCE')
    .get(api + '/purchases/payables')
    .query({ q: key })
    .expect(200);
  expect(open.body.items.some(({ id }: { id: string }) => id === received.id)).toBe(true);
  const complete = getDetail(
    (
      await payments({
        operationId: randomUUID(),
        accountId: copAccountId,
        paidAt: date,
        amountOriginal: '828000',
        unitsPerUsd: '4000',
      }).expect(200)
    ).body,
  );
  expect(complete).toMatchObject({ paymentStatus: 'PAID', financial: { balanceUsd: '0.00' } });
  expect(await db.moneyMovement.count({ where: { payment: { purchaseId: received.id } } })).toBe(2);
  await user('ADMIN')
    .post(purchase + '/void')
    .set('Origin', origin)
    .send({ reason: 'Cancelar el documento' })
    .expect(409);
  const paymentId = paid.payments?.[0]?.id;
  if (!paymentId) throw new Error('Falta el pago original.');
  const reverse = () =>
    user('FINANCE')
      .post(purchase + '/payments/' + paymentId + '/reverse')
      .set('Origin', origin)
      .send({ reason: 'Devolución recibida' });
  const reverted = getDetail((await reverse().expect(200)).body);
  await reverse().expect(200);
  expect(reverted.financial?.balanceUsd).toBe('100.00');
  expect(
    await db.moneyMovement.count({
      where: { payment: { purchaseId: received.id }, kind: 'SUPPLIER_PAYMENT_REVERSAL' },
    }),
  ).toBe(1);
  expect(
    await db.stockMovement.count({ where: { purchaseItem: { purchaseId: received.id } } }),
  ).toBe(1);
}, 35_000);

it('exige tasa, detecta borradores desactualizados y revierte una recepción intacta', async () => {
  const missing = await create([line(44, 2, '80000')], 'COP', null);
  const rateError = await confirm(missing).expect(409);
  expect(rateError.body.error.code).toBe('RATE_REQUIRED');
  const updated = getDetail(
    (
      await user('ADMIN')
        .put(purchaseUrl(missing.id))
        .set('Origin', origin)
        .send({ revision: missing.revision, draft: { ...missing.draft, unitsPerUsd: '4000' } })
        .expect(200)
    ).body,
  );
  await confirm(missing).expect(409);
  await confirm(updated, {
    initialPayment: {
      operationId: randomUUID(),
      accountId: usdAccountId,
      amountOriginal: '41',
      paidAt: date,
    },
  }).expect(409);
  expect(await db.purchaseItem.count({ where: { purchaseId: updated.id } })).toBe(0);
  expect(await stock('ADMIN', { size: '44' })).toEqual([]);

  const received = getDetail(
    (
      await confirm(updated, {
        initialPayment: {
          operationId: randomUUID(),
          accountId: usdAccountId,
          amountOriginal: '40',
          paidAt: date,
        },
      }).expect(200)
    ).body,
  );
  const payment = received.payments?.[0];
  if (!payment) throw new Error('Falta el pago inicial.');
  expect(received.paymentStatus).toBe('PAID');
  await user('FINANCE')
    .post(purchaseUrl(received.id) + '/payments/' + payment.id + '/reverse')
    .set('Origin', origin)
    .send({ reason: 'Anulación de pago devuelto' })
    .expect(200);
  const voidDocument = () =>
    user('ADMIN')
      .post(purchaseUrl(received.id) + '/void')
      .set('Origin', origin)
      .send({ reason: 'Recepción equivocada' });
  const voided = getDetail((await voidDocument().expect(200)).body);
  await voidDocument().expect(200);
  expect(voided.status).toBe('VOIDED');
  expect((await stock('ADMIN', { size: '44' }))[0]).toMatchObject({ physical: 0, available: 0 });
  expect(
    await db.stockMovement.count({
      where: { purchaseItem: { purchaseId: received.id }, kind: 'RECEIPT_REVERSAL' },
    }),
  ).toBe(1);
  await expect(
    db.stockMovement.deleteMany({ where: { purchaseItem: { purchaseId: received.id } } }),
  ).rejects.toThrow();
}, 35_000);
