import { randomUUID } from 'node:crypto';
import {
  correctionDetail,
  correctionPreview,
  layawayDetail,
  layawaySummary,
  pageSchema,
  purchaseDetailSchema,
  saleDetailSchema,
  salePreviewSchema,
  shopRecord,
} from '@max-sport/shared';
import type { SaleDetail } from '@max-sport/shared';
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
const key = 'p4-' + randomUUID().slice(0, 12);
const api = '/api/v1';
const origin = config.APP_ORIGIN;
const layaways = api + '/layaways';
const sales = api + '/sales';
const returnsPath = api + '/returns';
const roles = { admin: 'ADMIN', seller: 'SELLER', coworker: 'SELLER', finance: 'FINANCE' } as const;
type Actor = keyof typeof roles;
const agents = new Map<Actor, ReturnType<typeof request.agent>>();
let supplierId: string;
let customerId: string;
let usd: string;
let usdt: string;
let cop: string;
let ves: string;

function agent(actor: Actor) {
  const session = agents.get(actor);
  if (!session) throw new Error('Falta sesión de pruebas.');
  return session;
}
const post = (by: Actor, path: string, body: object) =>
  agent(by).post(path).set('Origin', origin).send(body);

beforeAll(async () => {
  const password = 'fase-reservas-' + randomUUID();
  const passwordHash = await hashPassword(password);
  for (const actor of Object.keys(roles) as Actor[]) {
    const email = key + '-' + actor + '@example.test';
    await db.user.create({
      data: {
        email,
        passwordHash,
        displayName: key + '-' + actor,
        role: { connect: { code: roles[actor] } },
      },
    });
    const session = request.agent(app);
    await session
      .post(api + '/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    agents.set(actor, session);
  }
  const records = await Promise.all([
    db.supplier.create({ data: { name: 'Proveedor ' + key } }),
    db.customer.create({ data: { name: 'Cliente ' + key } }),
    db.moneyAccount.create({
      data: { name: 'Caja USD ' + key, kind: 'CASH', currencyCode: 'USD' },
    }),
    db.moneyAccount.create({
      data: { name: 'Billetera ' + key, kind: 'CRYPTO', currencyCode: 'USDT' },
    }),
    db.moneyAccount.create({
      data: { name: 'Caja COP ' + key, kind: 'CASH', currencyCode: 'COP' },
    }),
    db.moneyAccount.create({
      data: { name: 'Banco VES ' + key, kind: 'BANK', currencyCode: 'VES' },
    }),
  ]);
  [supplierId, customerId, usd, usdt, cop, ves] = records.map(({ id }) => id) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}, 25_000);

afterAll(async () => db.$disconnect());

async function receive(label: string, quantity = 1, includeReplacement = false) {
  const draft = await post('admin', api + '/purchases', {
    supplierId,
    currencyCode: 'USD',
    documentAt: new Date().toISOString(),
    groups: [
      {
        model: {
          mode: 'new',
          name: key + '-' + label,
          brand: { mode: 'new', name: 'Marca ' + key + '-' + label },
        },
        lines: [
          { size: 38, quantity, salePriceUsd: '50', unitCostOriginal: '20' },
          ...(includeReplacement
            ? [{ size: 39, quantity: 1, salePriceUsd: '60', unitCostOriginal: '23' }]
            : []),
        ],
      },
    ],
  }).expect(201);
  const { id, revision } = purchaseDetailSchema.parse(draft.body);
  const confirmed = await post('admin', api + '/purchases/' + id + '/receive', {
    revision,
    operationId: randomUUID(),
  }).expect(200);
  return purchaseDetailSchema.parse(confirmed.body).items.map((item) => item.variantId);
}

function entry<T>(value: T | undefined): T {
  if (value == null) throw new Error('Falta un registro del caso de prueba.');
  return value;
}

async function sell(
  variantId: string,
  quantity: number,
  amountUsd: string,
  discountUsd?: string,
): Promise<SaleDetail> {
  const sale = {
    customerId,
    items: [{ variantId, quantity }],
    payments: [{ accountId: usd, amountOriginal: amountUsd }],
    ...(discountUsd
      ? { globalDiscount: { kind: 'FIXED', currencyCode: 'USD', amountOriginal: discountUsd } }
      : {}),
  };
  const quote = salePreviewSchema.parse(
    (await post('seller', sales + '/preview', sale).expect(200)).body,
  );
  return saleDetailSchema.parse(
    (
      await post('seller', sales, {
        operationId: randomUUID(),
        quoteDigest: quote.quoteDigest,
        sale,
      }).expect(201)
    ).body,
  );
}

const balance = (variantId: string) =>
  db.inventoryBalance.findUniqueOrThrow({ where: { variantId } });
const correctionQuote = async (correction: object) =>
  correctionPreview.parse(
    (await post('admin', returnsPath + '/preview', correction).expect(200)).body,
  );
const finishCorrection = (correction: object, quoteDigest: string, operationId = randomUUID()) =>
  post('admin', returnsPath, { correction, quoteDigest, operationId });
const atPolicy = async (policy: 'FULL_REFUND' | 'RETAIN') => {
  const settings = shopRecord.parse(
    (
      await agent('admin')
        .get(api + '/shop')
        .expect(200)
    ).body,
  );
  await agent('admin')
    .put(api + '/shop')
    .set('Origin', origin)
    .send({ ...settings, layawayRefundPolicy: policy })
    .expect(200);
};

it('reserva y entrega un apartado con abonos USDT y COP sin duplicar cobros', async () => {
  const variantId = entry((await receive('entrega'))[0]);
  const body = {
    operationId: randomUUID(),
    customerId,
    items: [{ variantId, quantity: 1, expectedPriceUsd: '50' }],
    payments: [{ accountId: usdt, amountOriginal: '10', unitsPerUsd: '1' }],
  };
  const created = layawayDetail.parse((await post('seller', layaways, body).expect(201)).body);
  const replay = layawayDetail.parse((await post('seller', layaways, body).expect(201)).body);
  expect(replay.id).toBe(created.id);
  expect(created).toMatchObject({
    status: 'ACTIVE',
    paidUsd: '10.00',
    totalUsd: '50.00',
    balanceUsd: '40.00',
  });
  expect(await balance(variantId)).toMatchObject({ physical: 1, reserved: 1 });
  await post('seller', sales + '/preview', { items: [{ variantId, quantity: 1 }] }).expect(409);
  await agent('coworker')
    .get(layaways + '/' + created.id)
    .expect(404);
  const matches = await agent('finance').get(layaways).query({ q: created.number }).expect(200);
  expect(pageSchema(layawaySummary).parse(matches.body).total).toBe(1);
  expect(await db.sale.count({ where: { layawayId: created.id } })).toBe(0);
  const path = layaways + '/' + created.id;
  await post('seller', path + '/deliver', { operationId: randomUUID() }).expect(409);
  await post('seller', path + '/payments', {
    operationId: randomUUID(),
    payments: [{ accountId: cop, amountOriginal: '164000', unitsPerUsd: '4000' }],
  }).expect(409);
  const paid = layawayDetail.parse(
    (
      await post('seller', path + '/payments', {
        operationId: randomUUID(),
        payments: [{ accountId: cop, amountOriginal: '160000', unitsPerUsd: '4000' }],
      }).expect(200)
    ).body,
  );
  expect(paid).toMatchObject({ status: 'PAID', balanceUsd: '0.00', saleId: null });

  await db.productVariant.update({ where: { id: variantId }, data: { salePriceUsd: '70' } });
  const operationId = randomUUID();
  const results = await Promise.all([
    post('seller', path + '/deliver', { operationId }).expect(200),
    post('seller', path + '/deliver', { operationId }).expect(200),
  ]);
  const delivered = layawayDetail.parse(entry(results[0]).body);
  const saleId = entry(delivered.saleId ?? undefined);
  expect(layawayDetail.parse(entry(results[1]).body)).toMatchObject({
    saleId,
    status: 'DELIVERED',
  });
  await post('seller', path + '/deliver', { operationId: randomUUID() }).expect(409);
  const receipt = saleDetailSchema.parse(
    (
      await agent('admin')
        .get(sales + '/' + saleId)
        .expect(200)
    ).body,
  );
  expect(receipt).toMatchObject({
    totalUsd: '50.00',
    cogsUsd: '20.00',
    grossProfitUsd: '30.00',
    layawayId: created.id,
  });
  expect(receipt.tenders).toMatchObject([
    { kind: 'ADVANCE', amountUsd: '10.00', currencyCode: 'USDT', unitsPerUsd: '1' },
    { kind: 'ADVANCE', amountUsd: '40.00', currencyCode: 'COP', unitsPerUsd: '4000' },
  ]);
  expect(await balance(variantId)).toMatchObject({ physical: 0, reserved: 0 });
  const payments = await db.moneyMovement.findMany({
    where: { layawayPayment: { action: { layawayId: created.id } } },
  });
  expect(payments.map(({ kind }) => kind)).toEqual(['LAYAWAY_DEPOSIT', 'LAYAWAY_DEPOSIT']);
  expect(await db.moneyMovement.count({ where: { saleTender: { saleId } } })).toBe(0);
  expect(await db.stockMovement.count({ where: { variantId, kind: 'SALE_OUT' } })).toBe(1);
});

it('libera la reserva y aplica la política de reembolso congelada al cancelar o vencer', async () => {
  const variantId = entry((await receive('cancelacion', 2))[0]);
  await atPolicy('FULL_REFUND');
  const make = (expiresAt?: string) =>
    post('seller', layaways, {
      operationId: randomUUID(),
      customerId,
      ...(expiresAt ? { expiresAt } : {}),
      items: [{ variantId, quantity: 1 }],
      payments: [{ accountId: ves, amountOriginal: '400', unitsPerUsd: '40' }],
    });
  const pending = layawayDetail.parse((await make().expect(201)).body);
  const path = layaways + '/' + pending.id;
  await atPolicy('RETAIN');
  try {
    await post('seller', path + '/cancel', {
      operationId: randomUUID(),
      reason: 'Solicitud del cliente',
    }).expect(403);
    const cancel = { operationId: randomUUID(), reason: 'Solicitud del cliente' };
    const closed = layawayDetail.parse(
      (await post('admin', path + '/cancel', cancel).expect(200)).body,
    );
    expect(closed).toMatchObject({
      status: 'CANCELLED',
      refundPolicy: 'FULL_REFUND',
      refundedUsd: '10.00',
      retainedUsd: '0.00',
    });
    await post('admin', path + '/cancel', cancel).expect(200);
    await post('admin', path + '/cancel', { ...cancel, operationId: randomUUID() }).expect(409);
    const refund = await db.layawayPayment.findFirstOrThrow({
      where: { kind: 'REFUND', action: { layawayId: pending.id } },
      include: { reversed: true, movement: true },
    });
    expect(refund.exchangeRateId).toBe(refund.reversed?.exchangeRateId);
    expect(refund.accountId).toBe(ves);
    expect(refund.movement?.kind).toBe('LAYAWAY_REFUND');
    expect(refund.amountOriginal.toFixed()).toBe('400');
    expect(await db.sale.count({ where: { layawayId: pending.id } })).toBe(0);
    expect(await balance(variantId)).toMatchObject({ physical: 2, reserved: 0 });

    const second = layawayDetail.parse(
      (await make(new Date(Date.now() + 60_000).toISOString()).expect(201)).body,
    );
    const later = layaways + '/' + second.id;
    await post('admin', later + '/expire', {
      operationId: randomUUID(),
      reason: 'Verificación',
    }).expect(409);
    await db.layaway.update({
      where: { id: second.id },
      data: {
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const list = await agent('admin')
      .get(layaways)
      .query({ overdue: 'true', q: second.number })
      .expect(200);
    expect(pageSchema(layawaySummary).parse(list.body).total).toBe(1);
    const expired = layawayDetail.parse(
      (
        await post('admin', later + '/expire', {
          operationId: randomUUID(),
          reason: 'Vencimiento del plazo',
        }).expect(200)
      ).body,
    );
    expect(expired).toMatchObject({ status: 'EXPIRED', retainedUsd: '10.00', refundedUsd: '0.00' });
    expect(await balance(variantId)).toMatchObject({ physical: 2, reserved: 0 });
  } finally {
    await atPolicy('FULL_REFUND');
  }
});

it('devuelve una parte al costo original, conserva el costo defectuoso y rechaza el doble reembolso', async () => {
  const variantId = entry((await receive('devolucion', 2))[0]);
  const sale = await sell(variantId, 2, '96.99', '3.01');
  const saleItemId = entry(sale.items[0]).id;
  const correction = {
    saleId: sale.id,
    reason: 'Par devuelto',
    items: [{ saleItemId, quantity: 1, condition: 'SELLABLE' }],
    refunds: [
      { accountId: ves, amountOriginal: '1940', unitsPerUsd: '40', reference: 'refund-qa' },
    ],
  };
  await post('seller', returnsPath + '/preview', correction).expect(403);
  const quote = await correctionQuote(correction);
  expect(quote).toMatchObject({
    returnedUsd: '48.50',
    restoredCogsUsd: '20.00',
    differenceUsd: '-48.50',
    ready: true,
  });
  const operationId = randomUUID();
  const results = await Promise.all([
    finishCorrection(correction, quote.quoteDigest, operationId).expect(201),
    finishCorrection(correction, quote.quoteDigest, operationId).expect(201),
  ]);
  const first = correctionDetail.parse(entry(results[0]).body);
  expect(correctionDetail.parse(entry(results[1]).body).id).toBe(first.id);
  expect(await balance(variantId)).toMatchObject({ physical: 1, reserved: 0 });
  const lot = await db.inventoryLot.findFirstOrThrow({
    where: { correctionItem: { correctionId: first.id } },
  });
  expect(lot.originLotId).not.toBeNull();
  expect(lot.totalCostUsd.toFixed(2)).toBe('20.00');
  const scope = await agent('coworker').get(returnsPath + '/' + first.id);
  expect(scope.status).toBe(404);
  const owner = await agent('seller')
    .get(returnsPath + '/' + first.id)
    .expect(200);
  expect(owner.body).not.toHaveProperty('restoredCogsUsd');
  const rectified = saleDetailSchema.parse(
    (
      await agent('admin')
        .get(sales + '/' + sale.id)
        .expect(200)
    ).body,
  );
  expect(rectified).toMatchObject({
    adjustedTotalUsd: '48.49',
    adjustedCogsUsd: '20.00',
    adjustedProfitUsd: '28.49',
  });
  expect(entry(rectified.items[0]).returnableQuantity).toBe(1);
  await post('admin', returnsPath + '/preview', {
    ...correction,
    items: [{ saleItemId, quantity: 2, condition: 'SELLABLE' }],
  }).expect(409);

  const damaged = {
    ...correction,
    items: [{ saleItemId, quantity: 1, condition: 'DEFECTIVE' }],
    refunds: [{ accountId: usd, amountOriginal: '48.49' }],
  };
  const last = await correctionQuote(damaged);
  expect(last).toMatchObject({ returnedUsd: '48.49', restoredCogsUsd: '0.00', ready: true });
  const concurrent = await Promise.all([
    finishCorrection(damaged, last.quoteDigest),
    finishCorrection(damaged, last.quoteDigest),
  ]);
  expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);
  expect(concurrent.find(({ status }) => status === 409)?.body.error.code).toBe('RETURN_LIMIT');
  expect(await balance(variantId)).toMatchObject({ physical: 1, reserved: 0 });
  const final = saleDetailSchema.parse(
    (
      await agent('admin')
        .get(sales + '/' + sale.id)
        .expect(200)
    ).body,
  );
  expect(final).toMatchObject({
    adjustedTotalUsd: '0.00',
    adjustedCogsUsd: '20.00',
    adjustedProfitUsd: '-20.00',
  });
  expect(
    await db.moneyMovement.count({
      where: { kind: 'SALE_REFUND', correctionTender: { correction: { saleId: sale.id } } },
    }),
  ).toBe(2);
});

it('cambia la talla y cobra solo la diferencia al registrar el reemplazo FIFO', async () => {
  const [original, replacement] = await receive('cambio', 1, true);
  const oldId = entry(original);
  const newId = entry(replacement);
  const sale = await sell(oldId, 1, '50.00');
  const saleItemId = entry(sale.items[0]).id;
  const input = {
    saleId: sale.id,
    reason: 'Cambio de talla',
    items: [{ saleItemId, quantity: 1, condition: 'SELLABLE' }],
    replacement: [{ variantId: newId, quantity: 1 }],
    payments: [{ accountId: usdt, amountOriginal: '10.1', unitsPerUsd: '1.01' }],
  };
  const quote = await correctionQuote(input);
  expect(quote).toMatchObject({
    ready: true,
    returnedUsd: '50.00',
    replacementTotalUsd: '60.00',
    differenceUsd: '10.00',
    collectedUsd: '10.00',
    refundedUsd: '0.00',
  });
  const record = correctionDetail.parse(
    (await finishCorrection(input, quote.quoteDigest).expect(201)).body,
  );
  expect(record.kind).toBe('EXCHANGE');
  const newSaleId = entry(record.replacementSaleId ?? undefined);
  const next = saleDetailSchema.parse(
    (
      await agent('admin')
        .get(sales + '/' + newSaleId)
        .expect(200)
    ).body,
  );
  expect(next).toMatchObject({
    totalUsd: '60.00',
    cogsUsd: '23.00',
    grossProfitUsd: '37.00',
    exchangeCreditUsd: '50.00',
  });
  expect(next.tenders).toMatchObject([
    { kind: 'PAYMENT', amountUsd: '10.00', currencyCode: 'USDT', unitsPerUsd: '1.01' },
  ]);
  expect(await balance(oldId)).toMatchObject({ physical: 1, reserved: 0 });
  expect(await balance(newId)).toMatchObject({ physical: 0, reserved: 0 });
  expect(
    await db.moneyMovement.count({
      where: { kind: 'EXCHANGE_PAYMENT', correctionTender: { correctionId: record.id } },
    }),
  ).toBe(1);
  expect(await db.moneyMovement.count({ where: { saleTender: { saleId: newSaleId } } })).toBe(0);
  expect(
    await db.auditLog.count({ where: { action: 'returns.exchange', entityId: record.id } }),
  ).toBe(1);
});

it('devuelve la diferencia cuando el reemplazo cuesta menos que el par original', async () => {
  const [cheaper, dearer] = await receive('cambio-reembolso', 1, true);
  const sale = await sell(entry(dearer), 1, '60.00');
  const input = {
    saleId: sale.id,
    reason: 'Talla alternativa',
    items: [{ saleItemId: entry(sale.items[0]).id, quantity: 1, condition: 'SELLABLE' }],
    replacement: [{ variantId: entry(cheaper), quantity: 1 }],
    refunds: [{ accountId: cop, amountOriginal: '40000', unitsPerUsd: '4000' }],
  };
  const quote = await correctionQuote(input);
  expect(quote).toMatchObject({
    returnedUsd: '60.00',
    replacementTotalUsd: '50.00',
    differenceUsd: '-10.00',
    refundedUsd: '10.00',
    collectedUsd: '0.00',
    ready: true,
  });
  const posted = correctionDetail.parse(
    (await finishCorrection(input, quote.quoteDigest).expect(201)).body,
  );
  const replacement = saleDetailSchema.parse(
    (
      await agent('seller')
        .get(sales + '/' + posted.replacementSaleId)
        .expect(200)
    ).body,
  );
  expect(replacement).toMatchObject({ totalUsd: '50.00', exchangeCreditUsd: '50.00', tenders: [] });
  expect(
    await db.moneyMovement.count({
      where: { kind: 'SALE_REFUND', correctionTender: { correctionId: posted.id } },
    }),
  ).toBe(1);
});
