import { randomUUID } from 'node:crypto';
import {
  contactRecord,
  pageSchema,
  purchaseDetailSchema,
  saleDetailSchema,
  salePreviewSchema,
  saleSummarySchema,
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
  throw new Error('Define TEST_DATABASE_URL con las migraciones aplicadas.');
const config = parseRuntimeConfig({
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  LOG_LEVEL: 'silent',
});
const db = createDatabase(config.DATABASE_URL);
const app = createApp(db, config);
const key = 'pos-' + randomUUID().slice(0, 12);
const origin = config.APP_ORIGIN;
const api = '/api/v1';
const sales = api + '/sales';
const actors = {
  admin: 'ADMIN',
  seller: 'SELLER',
  other: 'SELLER',
  finance: 'FINANCE',
  inventory: 'INVENTORY',
} as const satisfies Record<string, RoleCode>;
type Actor = keyof typeof actors;
const agents = new Map<Actor, { id: string; agent: ReturnType<typeof request.agent> }>();
let supplierId: string;
let cop: string;
let ves: string;
let usd: string;
let usdt: string;

function user(actor: Actor) {
  const entry = agents.get(actor);
  if (!entry) throw new Error('Falta una sesión de prueba.');
  return entry;
}

beforeAll(async () => {
  const password = 'pruebas-pos-' + randomUUID();
  const passwordHash = await hashPassword(password);
  for (const actor of Object.keys(actors) as Actor[]) {
    const username = key + '-' + actor;
    const { id } = await db.user.create({
      data: {
        username,
        email: username + '@example.test',
        displayName: key + '-' + actor,
        passwordHash,
        role: { connect: { code: actors[actor] } },
      },
    });
    const agent = request.agent(app);
    await agent
      .post(api + '/auth/login')
      .set('Origin', origin)
      .send({ username, password })
      .expect(200);
    agents.set(actor, { agent, id });
  }

  const [supplier, copAccount, vesAccount, usdAccount, usdtAccount] = await Promise.all([
    db.supplier.create({ data: { name: 'Proveedor ' + key } }),
    db.moneyAccount.create({
      data: { name: 'Caja COP ' + key, currencyCode: 'COP', kind: 'CASH' },
    }),
    db.moneyAccount.create({
      data: { name: 'Pago móvil ' + key, currencyCode: 'VES', kind: 'MOBILE' },
    }),
    db.moneyAccount.create({
      data: { name: 'Caja USD ' + key, currencyCode: 'USD', kind: 'CASH' },
    }),
    db.moneyAccount.create({
      data: { name: 'Billetera ' + key, currencyCode: 'USDT', kind: 'CRYPTO' },
    }),
  ]);
  supplierId = supplier.id;
  [cop, ves, usd, usdt] = [copAccount.id, vesAccount.id, usdAccount.id, usdtAccount.id];
}, 25_000);

afterAll(async () => db.$disconnect());

async function receive(name: string, quantity = 1, unitCostOriginal = '20', modelId?: string) {
  const admin = user('admin').agent;
  const model = modelId
    ? { mode: 'existing', id: modelId }
    : {
        mode: 'new',
        name: key + '-' + name,
        brand: { mode: 'new', name: 'Marca ' + key + '-' + name },
      };
  const draft = await admin
    .post(api + '/purchases')
    .set('Origin', origin)
    .send({
      supplierId,
      currencyCode: 'USD',
      documentAt: new Date().toISOString(),
      groups: [{ model, lines: [{ size: 38, quantity, unitCostOriginal, salePriceUsd: '50' }] }],
    })
    .expect(201);
  const { id, revision } = purchaseDetailSchema.parse(draft.body);
  const response = await admin
    .post(api + '/purchases/' + id + '/receive')
    .set('Origin', origin)
    .send({ revision, operationId: randomUUID() })
    .expect(200);
  const item = purchaseDetailSchema.parse(response.body).items[0];
  if (!item) throw new Error('La recepción de prueba no creó una variante.');
  const variant = await db.productVariant.findUniqueOrThrow({ where: { id: item.variantId } });
  return { variant, purchaseItemId: item.id };
}

function preview(actor: Actor, sale: object) {
  return user(actor)
    .agent.post(sales + '/preview')
    .set('Origin', origin)
    .send(sale);
}

function checkout(actor: Actor, sale: object, quoteDigest: string, operationId = randomUUID()) {
  return user(actor)
    .agent.post(sales)
    .set('Origin', origin)
    .send({ sale, quoteDigest, operationId });
}

it('liquida COP y VES una vez, conserva tasas y descuenta los dos lotes FIFO con auditoría', async () => {
  const first = await receive('mix');
  const second = await receive('mix', 2, '22', first.variant.modelId);
  const customer = await user('seller')
    .agent.post(api + '/customers')
    .set('Origin', origin)
    .send({
      name: 'Cliente ' + key,
      document: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
    })
    .expect(201);
  const customerId = contactRecord.parse(customer.body).id;
  const sale = {
    customerId,
    notes: 'Acuerdo de mostrador',
    items: [
      {
        variantId: first.variant.id,
        quantity: 2,
        discount: {
          kind: 'FIXED',
          amountOriginal: '8000',
          currencyCode: 'COP',
          unitsPerUsd: '4000',
        },
      },
    ],
    globalDiscount: { kind: 'PERCENT', percentage: '10' },
    payments: [
      { accountId: cop, amountOriginal: '80000', unitsPerUsd: '4000' },
      { accountId: ves, amountOriginal: '2728', unitsPerUsd: '40', reference: 'movil-qa' },
    ],
    displayQuote: { currencyCode: 'COP', unitsPerUsd: '4000' },
  };
  const response = await preview('seller', sale).expect(200);
  const quote = salePreviewSchema.parse(response.body);
  expect(quote).toMatchObject({
    ready: true,
    subtotalUsd: '100.00',
    discountUsd: '11.80',
    totalUsd: '88.20',
    balanceDueUsd: '0.00',
    changeDueUsd: '0.00',
    localTotal: { amount: '352800', currencyCode: 'COP' },
  });
  expect(response.body).not.toHaveProperty('cogsUsd');
  expect(response.body.items[0]).not.toHaveProperty('cogsUsd');

  const operationId = randomUUID();
  const [a, b] = await Promise.all([
    checkout('seller', sale, quote.quoteDigest, operationId).expect(201),
    checkout('seller', sale, quote.quoteDigest, operationId).expect(201),
  ]);
  const recorded = saleDetailSchema.parse(a.body);
  expect(recorded).toMatchObject({ pairCount: 2, notes: sale.notes, totalUsd: '88.20' });
  expect(recorded.receiptNumber).toMatch(/^V-\d{6,}$/);
  expect(saleDetailSchema.parse(b.body).id).toBe(recorded.id);
  expect(a.body).not.toHaveProperty('grossProfitUsd');
  expect(a.body.items[0]).not.toHaveProperty('cogsUsd');
  await checkout('seller', { ...sale, notes: 'otra nota' }, quote.quoteDigest, operationId).expect(
    409,
  );
  await checkout('other', sale, quote.quoteDigest, operationId).expect(409);
  await user('other')
    .agent.get(sales + '/' + recorded.id)
    .expect(404);
  await user('inventory').agent.get(sales).expect(403);

  const filtered = await user('finance')
    .agent.get(sales)
    .query({
      q: recorded.receiptNumber,
      currencyCode: 'VES',
      sellerId: user('seller').id,
      customerId,
      from: new Date(Date.parse(recorded.confirmedAt) - 1).toISOString(),
      to: new Date(Date.parse(recorded.confirmedAt) + 1).toISOString(),
    })
    .expect(200);
  expect(pageSchema(saleSummarySchema).parse(filtered.body).items).toEqual([
    expect.objectContaining({ id: recorded.id, cogsUsd: '42.00', grossProfitUsd: '46.20' }),
  ]);
  const ownerScope = await user('other')
    .agent.get(sales)
    .query({ q: recorded.receiptNumber })
    .expect(200);
  expect(ownerScope.body.total).toBe(0);
  const detail = await user('admin')
    .agent.get(sales + '/' + recorded.id)
    .expect(200);
  expect(saleDetailSchema.parse(detail.body)).toMatchObject({
    cogsUsd: '42.00',
    grossProfitUsd: '46.20',
    tenders: [
      { accountId: cop, amountUsd: '20.00', unitsPerUsd: '4000' },
      { accountId: ves, amountUsd: '68.20', unitsPerUsd: '40' },
    ],
  });

  const balance = await db.inventoryBalance.findUniqueOrThrow({
    where: { variantId: first.variant.id },
  });
  expect(balance).toMatchObject({ physical: 1, reserved: 0 });
  const movements = await db.stockMovement.findMany({
    where: { saleItem: { saleId: recorded.id } },
    include: { allocations: { include: { lot: true }, orderBy: { lot: { receivedAt: 'asc' } } } },
  });
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({ kind: 'SALE_OUT', quantityDelta: -2 });
  expect(
    movements[0]?.allocations.map(({ costUsd, quantity, lot }) => [
      lot.purchaseItemId,
      quantity,
      costUsd.toFixed(2),
      lot.remainingQuantity,
    ]),
  ).toEqual([
    [first.purchaseItemId, 1, '20.00', 0],
    [second.purchaseItemId, 1, '22.00', 1],
  ]);
  const charges = await db.moneyMovement.findMany({
    where: { saleTender: { saleId: recorded.id } },
    include: { saleTender: { include: { exchangeRate: true } } },
    orderBy: { saleTender: { position: 'asc' } },
  });
  expect(
    charges.map(({ accountId, kind, amountUsd, saleTender }) => [
      accountId,
      kind,
      amountUsd.toFixed(2),
      saleTender?.exchangeRate?.unitsPerUsd.toFixed(),
    ]),
  ).toEqual([
    [cop, 'SALE_PAYMENT', '20.00', '4000'],
    [ves, 'SALE_PAYMENT', '68.20', '40'],
  ]);
  expect(
    await db.saleDiscount.count({ where: { saleId: recorded.id, exchangeRateId: { not: null } } }),
  ).toBe(1);
  expect(
    await db.auditLog.count({ where: { entityId: recorded.id, action: 'sales.confirm' } }),
  ).toBe(1);
  await expect(
    db.sale.update({ where: { id: recorded.id }, data: { notes: 'alterada' } }),
  ).rejects.toThrow();
});

it('requiere tasa expresa y liquidación completa, y registra el vuelto como salida de efectivo', async () => {
  const { variant } = await receive('change');
  const cart = { items: [{ variantId: variant.id, quantity: 1 }] };
  const underpaid = { ...cart, payments: [{ accountId: usd, amountOriginal: '49.99' }] };
  const incomplete = salePreviewSchema.parse((await preview('seller', underpaid).expect(200)).body);
  expect(incomplete).toMatchObject({ balanceDueUsd: '0.01', ready: false });
  const partial = await checkout('seller', underpaid, incomplete.quoteDigest).expect(409);
  expect(partial.body.error.code).toBe('PAYMENT_MISMATCH');

  const missing = await preview('seller', {
    ...cart,
    payments: [{ accountId: cop, amountOriginal: '200000' }],
  }).expect(409);
  expect(missing.body.error.code).toBe('RATE_REQUIRED');
  await preview('seller', {
    ...cart,
    globalDiscount: {
      kind: 'FIXED',
      currencyCode: 'VES',
      amountOriginal: '1',
    },
  }).expect(409);
  const overpaid = {
    ...cart,
    payments: [{ accountId: usdt, amountOriginal: '60.005', unitsPerUsd: '1' }],
  };
  const over = salePreviewSchema.parse((await preview('seller', overpaid).expect(200)).body);
  expect(over).toMatchObject({ changeDueUsd: '10.01', ready: false });
  await checkout('seller', overpaid, over.quoteDigest).expect(409);
  const wrongChange = await preview('seller', {
    ...overpaid,
    change: {
      accountId: ves,
      amountOriginal: '400.40',
      unitsPerUsd: '40',
    },
  }).expect(400);
  expect(wrongChange.body.error.code).toBe('CHANGE_ACCOUNT');
  expect(await db.saleItem.count({ where: { variantId: variant.id } })).toBe(0);
  const sale = { ...overpaid, change: { accountId: usd, amountOriginal: '10.01' } };
  const ready = salePreviewSchema.parse((await preview('seller', sale).expect(200)).body);
  expect(ready).toMatchObject({
    ready: true,
    tenderedUsd: '60.01',
    changeUsd: '10.01',
    netCollectedUsd: '50.00',
  });
  const saved = saleDetailSchema.parse(
    (await checkout('seller', sale, ready.quoteDigest).expect(201)).body,
  );
  expect(saved.customerName).toBe('Consumidor final');
  const entries = await db.moneyMovement.findMany({
    where: { saleTender: { saleId: saved.id } },
    orderBy: { saleTender: { position: 'asc' } },
  });
  expect(
    entries.map(({ accountId, kind, amountUsd }) => [accountId, kind, amountUsd.toFixed(2)]),
  ).toEqual([
    [usdt, 'SALE_PAYMENT', '60.01'],
    [usd, 'SALE_CHANGE', '10.01'],
  ]);
});

it('protege el stock reservado cuando dos cobros compiten por la última unidad disponible', async () => {
  const { variant } = await receive('last', 2);
  await db.inventoryBalance.update({ where: { variantId: variant.id }, data: { reserved: 1 } });
  const sale = {
    items: [{ variantId: variant.id, quantity: 1 }],
    payments: [{ accountId: usd, amountOriginal: '50' }],
  };
  const quote = salePreviewSchema.parse((await preview('seller', sale).expect(200)).body);
  const [a, b] = await Promise.all([
    checkout('seller', sale, quote.quoteDigest),
    checkout('seller', sale, quote.quoteDigest),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  const rejected = a.status === 409 ? a : b;
  expect(rejected.body.error.code).toBe('INSUFFICIENT_STOCK');
  expect(
    await db.inventoryBalance.findUniqueOrThrow({ where: { variantId: variant.id } }),
  ).toMatchObject({
    physical: 1,
    reserved: 1,
  });
  expect(await db.stockMovement.count({ where: { variantId: variant.id, kind: 'SALE_OUT' } })).toBe(
    1,
  );
  expect(
    await db.moneyMovement.count({
      where: { saleTender: { sale: { items: { some: { variantId: variant.id } } } } },
    }),
  ).toBe(1);
});

it('pide recalcular tras un cambio de precio y controla la asignación de vendedor', async () => {
  const { variant } = await receive('reprice');
  const sale = {
    items: [{ variantId: variant.id, quantity: 1 }],
    payments: [{ accountId: usd, amountOriginal: '50' }],
  };
  const original = salePreviewSchema.parse((await preview('seller', sale).expect(200)).body);
  await db.productVariant.update({ where: { id: variant.id }, data: { salePriceUsd: '55' } });
  const stale = await checkout('seller', sale, original.quoteDigest).expect(409);
  expect(stale.body.error.code).toBe('QUOTE_CHANGED');

  const delegated = {
    ...sale,
    sellerId: user('other').id,
    payments: [{ accountId: usd, amountOriginal: '55' }],
  };
  const sellerQuote = salePreviewSchema.parse(
    (await preview('seller', delegated).expect(200)).body,
  );
  await checkout('seller', delegated, sellerQuote.quoteDigest).expect(403);
  const adminQuote = salePreviewSchema.parse((await preview('admin', delegated).expect(200)).body);
  expect(adminQuote).toMatchObject({ ready: true, cogsUsd: '20.00', grossProfitUsd: '35.00' });
  const recorded = saleDetailSchema.parse(
    (await checkout('admin', delegated, adminQuote.quoteDigest).expect(201)).body,
  );
  expect(recorded.sellerName).toBe(key + '-other');
  await user('other')
    .agent.get(sales + '/' + recorded.id)
    .expect(200);
  await user('seller')
    .agent.get(sales + '/' + recorded.id)
    .expect(404);
});
