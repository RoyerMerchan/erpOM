import { randomUUID } from 'node:crypto';
import {
  correctionPreview,
  financeCategorySchema,
  financeDebtPageSchema,
  financeEntryPreviewSchema,
  financeEntrySchema,
  financeLedgerPageSchema,
  financeReportSchema,
  layawayDetail,
  purchaseDetailSchema,
  saleDetailSchema,
  salePreviewSchema,
  shopRecord,
} from '@max-sport/shared';
import type { FinanceEntryInput } from '@max-sport/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadProjectEnv, parseRuntimeConfig } from '../src/config.js';
import { createDatabase } from '../src/database.js';
import { calendarDate } from '../src/finance/calendar.js';
import { decimal } from '../src/purchasing/money.js';

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
const key = 'p5-' + randomUUID().slice(0, 12);
const root = '/api/v1';
const finance = root + '/finance';
const origin = config.APP_ORIGIN;
const roles = { admin: 'ADMIN', manager: 'MANAGER', seller: 'SELLER', finance: 'FINANCE' } as const;
type Actor = keyof typeof roles;
const agents = new Map<Actor, ReturnType<typeof request.agent>>();
let currencyAccounts: Record<'usd' | 'cop' | 'ves' | 'usdt' | 'bank', string>;
let customerId: string;
let supplierId: string;
let categoryId: string;

function agent(actor: Actor) {
  const value = agents.get(actor);
  if (!value) throw new Error('Falta sesión de prueba.');
  return value;
}
const post = (actor: Actor, url: string, body: object) =>
  agent(actor).post(url).set('Origin', origin).send(body);

beforeAll(async () => {
  const password = 'verificacion-finanzas-' + randomUUID();
  const passwordHash = await hashPassword(password);
  for (const role of Object.keys(roles) as Actor[]) {
    const email = key + '-' + role + '@example.test';
    await db.user.create({
      data: {
        email,
        passwordHash,
        displayName: key + '-' + role,
        role: { connect: { code: roles[role] } },
      },
    });
    const session = request.agent(app);
    await session
      .post(root + '/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    agents.set(role, session);
  }
  const records = await Promise.all([
    db.moneyAccount.create({
      data: { name: 'Efectivo USD ' + key, currencyCode: 'USD', kind: 'CASH' },
    }),
    db.moneyAccount.create({
      data: { name: 'Efectivo COP ' + key, currencyCode: 'COP', kind: 'CASH' },
    }),
    db.moneyAccount.create({
      data: { name: 'Pago móvil ' + key, currencyCode: 'VES', kind: 'MOBILE' },
    }),
    db.moneyAccount.create({
      data: { name: 'Billetera ' + key, currencyCode: 'USDT', kind: 'CRYPTO' },
    }),
    db.moneyAccount.create({
      data: { name: 'Banco USD ' + key, currencyCode: 'USD', kind: 'BANK' },
    }),
    db.customer.create({ data: { name: 'Cliente financiero ' + key } }),
    db.supplier.create({ data: { name: 'Proveedor financiero ' + key } }),
  ]);
  const [usd, cop, ves, usdt, bank, customer, supplier] = records.map(({ id }) => id);
  if (!usd || !cop || !ves || !usdt || !bank || !customer || !supplier)
    throw new Error('Faltan datos de prueba.');
  currencyAccounts = { usd, cop, ves, usdt, bank };
  customerId = customer;
  supplierId = supplier;
  categoryId = financeCategorySchema.parse(
    (
      await post('finance', finance + '/categories', {
        name: 'Operación ' + key,
      }).expect(201)
    ).body,
  ).id;
}, 25_000);
afterAll(async () => db.$disconnect());

function first<T>(items: T[]) {
  const value = items[0];
  if (!value) throw new Error('Falta un registro del caso.');
  return value;
}

async function inventory(occurredAt: string) {
  const draft = purchaseDetailSchema.parse(
    (
      await post('admin', root + '/purchases', {
        supplierId,
        currencyCode: 'USD',
        documentAt: occurredAt,
        reference: key,
        groups: [
          {
            model: {
              mode: 'new',
              name: 'Modelo ' + key,
              brand: { mode: 'new', name: 'Marca ' + key },
            },
            lines: [{ size: 39, quantity: 4, salePriceUsd: '50', unitCostOriginal: '20' }],
          },
        ],
      }).expect(201)
    ).body,
  );
  const received = purchaseDetailSchema.parse(
    (
      await post('admin', root + '/purchases/' + draft.id + '/receive', {
        operationId: randomUUID(),
        revision: draft.revision,
      }).expect(200)
    ).body,
  );
  await post('admin', root + '/purchases/' + draft.id + '/payments', {
    operationId: randomUUID(),
    accountId: currencyAccounts.usd,
    amountOriginal: '30',
    paidAt: new Date().toISOString(),
  }).expect(200);
  return { purchaseId: draft.id, variantId: first(received.items).variantId };
}

const quoteEntry = async (entry: object, actor: Actor = 'finance') =>
  financeEntryPreviewSchema.parse(
    (await post(actor, finance + '/entries/preview', entry).expect(200)).body,
  );
const confirmEntry = (
  entry: object,
  quoteDigest: string,
  operationId = randomUUID(),
  actor: Actor = 'finance',
) => post(actor, finance + '/entries', { entry, quoteDigest, operationId });
async function register(entry: object) {
  const quote = await quoteEntry(entry);
  return financeEntrySchema.parse((await confirmEntry(entry, quote.quoteDigest).expect(201)).body);
}
const report = async (query: Record<string, string>, daily = false, actor: Actor = 'finance') =>
  financeReportSchema.parse(
    (
      await agent(actor)
        .get(finance + (daily ? '/daily' : '/report'))
        .query(query)
        .expect(200)
    ).body,
  );
function differences(
  after: Record<string, unknown>,
  before: Record<string, unknown>,
  wanted: Record<string, string>,
) {
  for (const [field, expected] of Object.entries(wanted)) {
    const current = after[field];
    const previous = before[field];
    if (typeof current !== 'string' || typeof previous !== 'string')
      throw new Error('Falta el importe de ' + field);
    expect(decimal(current).sub(previous).toFixed(2), field).toBe(expected);
  }
}

it('concilia compras, POS, apartados, reembolsos y la rentabilidad del período', async () => {
  const occurredAt = new Date().toISOString();
  const timezone = shopRecord.parse(
    (
      await agent('admin')
        .get(root + '/shop')
        .expect(200)
    ).body,
  ).timezone;
  const today = calendarDate(new Date(occurredAt), timezone);
  const from = calendarDate(new Date(Date.parse(occurredAt) - 86_400_000), timezone);
  const to = calendarDate(new Date(Date.parse(occurredAt) + 86_400_000), timezone);
  const range = { period: 'RANGE', from, to };
  const before = await report(range);
  await agent('seller')
    .get(finance + '/report')
    .expect(403);
  const { variantId, purchaseId } = await inventory(occurredAt);
  const { usd, cop, ves, usdt } = currencyAccounts;

  const sale = {
    customerId,
    items: [{ variantId, quantity: 2 }],
    payments: [
      {
        accountId: cop,
        amountOriginal: '200000',
        unitsPerUsd: '4000',
        reference: 'Referencia POS ' + key,
      },
      { accountId: ves, amountOriginal: '2000', unitsPerUsd: '40' },
    ],
  };
  const offered = salePreviewSchema.parse(
    (await post('seller', root + '/sales/preview', sale).expect(200)).body,
  );
  const sold = saleDetailSchema.parse(
    (
      await post('seller', root + '/sales', {
        operationId: randomUUID(),
        quoteDigest: offered.quoteDigest,
        sale,
      }).expect(201)
    ).body,
  );
  const correction = {
    saleId: sold.id,
    reason: 'Devuelto a inventario',
    items: [{ saleItemId: first(sold.items).id, quantity: 1, condition: 'SELLABLE' }],
    refunds: [{ accountId: usd, amountOriginal: '50' }],
  };
  const correctionQuote = correctionPreview.parse(
    (await post('admin', root + '/returns/preview', correction).expect(200)).body,
  );
  await post('admin', root + '/returns', {
    operationId: randomUUID(),
    quoteDigest: correctionQuote.quoteDigest,
    correction,
  }).expect(201);

  const reservation = { customerId, items: [{ variantId, quantity: 1 }] };
  const firstLayaway = layawayDetail.parse(
    (
      await post('seller', root + '/layaways', {
        ...reservation,
        operationId: randomUUID(),
        payments: [{ accountId: usdt, amountOriginal: '10', unitsPerUsd: '1' }],
      }).expect(201)
    ).body,
  );
  const layawayPath = root + '/layaways/' + firstLayaway.id;
  await post('seller', layawayPath + '/payments', {
    operationId: randomUUID(),
    payments: [{ accountId: cop, amountOriginal: '160000', unitsPerUsd: '4000' }],
  }).expect(200);
  await post('seller', layawayPath + '/deliver', { operationId: randomUUID() }).expect(200);
  const pending = layawayDetail.parse(
    (
      await post('seller', root + '/layaways', {
        ...reservation,
        operationId: randomUUID(),
        payments: [{ accountId: usd, amountOriginal: '5' }],
      }).expect(201)
    ).body,
  );

  const header = { occurredAt, description: 'Registro ' + key };
  await register({
    ...header,
    kind: 'EXPENSE',
    categoryId,
    payment: { accountId: usd, amountOriginal: '12' },
  });
  await register({
    ...header,
    kind: 'OTHER_INCOME',
    payment: { accountId: usd, amountOriginal: '8' },
  });
  const transfer = await register({
    ...header,
    kind: 'TRANSFER',
    source: { accountId: usd, amountOriginal: '20' },
    destination: { accountId: cop, amountOriginal: '78000', unitsPerUsd: '4000' },
  });
  expect(transfer.differenceUsd).toBe('-0.50');

  const all = await report(range);
  differences(all.recognition, before.recognition, {
    grossSalesUsd: '150.00',
    returnedUsd: '50.00',
    netSalesUsd: '100.00',
    cogsUsd: '40.00',
    grossProfitUsd: '60.00',
    expensesUsd: '12.00',
    netProfitUsd: '48.00',
  });
  expect(all.recognition.salesCount - before.recognition.salesCount).toBe(2);
  differences(all.cash, before.cash, {
    salesCollectedUsd: '100.00',
    advancesCollectedUsd: '55.00',
    collectedUsd: '155.00',
    refundsUsd: '50.00',
    supplierNetUsd: '30.00',
    expensesUsd: '12.00',
    otherIncomeUsd: '8.00',
    cashInUsd: '163.00',
    cashOutUsd: '92.00',
    cashFlowUsd: '71.00',
    transferNetUsd: '-0.50',
    accountNetUsd: '70.50',
  });
  expect(all.expenseCategories.find(({ id }) => id === categoryId)?.usd).toBe('12.00');
  expect(all.accounts.find(({ id }) => id === usd)).toMatchObject({
    openingOriginal: '0',
    incomingOriginal: '13',
    outgoingOriginal: '112',
    closingOriginal: '-99',
    closingUsd: '-99.00',
  });
  const filtered = await report({ ...range, accountId: cop, currencyCode: 'COP' });
  expect(filtered.accounts).toEqual([
    expect.objectContaining({ id: cop, closingOriginal: '438000', closingUsd: '109.50' }),
  ]);
  expect(filtered.cash).toMatchObject({
    collectedUsd: '90.00',
    cashFlowUsd: '90.00',
    transferNetUsd: '19.50',
  });
  expect(filtered.recognition).toEqual(all.recognition);
  expect((await report({ date: today }, true)).window.startDate).toBe(today);

  const ledger = financeLedgerPageSchema.parse(
    (
      await agent('finance')
        .get(finance + '/movements')
        .query({
          ...range,
          accountId: cop,
          currencyCode: 'COP',
          filter: 'TRANSFER',
        })
        .expect(200)
    ).body,
  );
  expect(ledger).toMatchObject({
    total: 1,
    items: [
      {
        sourceId: transfer.id,
        kind: 'FINANCE_IN',
        entryKind: 'TRANSFER',
        amountOriginal: '78000',
        amountUsd: '19.50',
        unitsPerUsd: '4000',
        direction: 'IN',
      },
    ],
  });
  const salePayments = financeLedgerPageSchema.parse(
    (
      await agent('finance')
        .get(finance + '/movements')
        .query({
          ...range,
          q: 'Referencia POS ' + key,
          filter: 'COLLECTION',
          accountId: cop,
        })
        .expect(200)
    ).body,
  );
  expect(salePayments.items).toEqual([
    expect.objectContaining({ sourceId: sold.id, sourceKind: 'SALE' }),
  ]);
  const due = financeDebtPageSchema.parse(
    (
      await agent('finance')
        .get(finance + '/receivables')
        .query({ q: key })
        .expect(200)
    ).body,
  );
  expect(due).toMatchObject({
    balanceUsd: '45.00',
    total: 1,
    items: [{ id: pending.id, paidUsd: '5.00' }],
  });
  const payables = financeDebtPageSchema.parse(
    (
      await agent('finance')
        .get(finance + '/payables')
        .query({ q: key })
        .expect(200)
    ).body,
  );
  expect(payables).toMatchObject({
    balanceUsd: '50.00',
    total: 1,
    items: [{ id: purchaseId, paidUsd: '30.00' }],
  });
});

it('publica dos movimientos por transferencia y los revierte una vez conservando importes y tasas', async () => {
  const { bank, ves } = currencyAccounts;
  const firstDate = '2025-03-01';
  const secondDate = '2025-03-02';
  const firstWindow = (await report({ date: firstDate, accountId: bank }, true)).window;
  const secondWindow = (await report({ date: secondDate, accountId: bank }, true)).window;
  expect(firstWindow.to).toBe(secondWindow.from);
  const entry = {
    kind: 'TRANSFER',
    occurredAt: firstWindow.from,
    description: 'Cambio ' + key,
    source: { accountId: bank, amountOriginal: '10', unitsPerUsd: null },
    destination: { accountId: ves, amountOriginal: '380', unitsPerUsd: '40' },
    reference: null,
  } satisfies FinanceEntryInput;
  const quote = await quoteEntry(entry);
  expect(quote).toMatchObject({
    differenceUsd: '-0.50',
    lines: [
      { direction: 'OUT', amountUsd: '10.00' },
      { direction: 'IN', amountUsd: '9.50' },
    ],
  });
  const operationId = randomUUID();
  const results = await Promise.all([
    confirmEntry(entry, quote.quoteDigest, operationId).expect(201),
    confirmEntry(entry, quote.quoteDigest, operationId).expect(201),
  ]);
  const confirmed = financeEntrySchema.parse(first(results).body);
  expect(results.map(({ body }) => financeEntrySchema.parse(body).id)).toEqual([
    confirmed.id,
    confirmed.id,
  ]);
  await confirmEntry(
    { ...entry, description: 'Texto diferente' },
    quote.quoteDigest,
    operationId,
  ).expect(409);
  expect(await db.moneyMovement.count({ where: { financeLine: { entryId: confirmed.id } } })).toBe(
    2,
  );

  const reversePath = finance + '/entries/' + confirmed.id + '/reverse';
  const beforeOriginal = await post('finance', reversePath, {
    operationId: randomUUID(),
    reason: 'Fecha inválida',
    occurredAt: new Date(Date.parse(firstWindow.from) - 1).toISOString(),
  }).expect(400);
  expect(beforeOriginal.body.error.code).toBe('REVERSAL_DATE');
  const reverse = {
    operationId: randomUUID(),
    reason: 'Transferencia rectificada',
    occurredAt: secondWindow.from,
  };
  const replay = await Promise.all([
    post('finance', reversePath, reverse).expect(201),
    post('finance', reversePath, reverse).expect(201),
  ]);
  const reversed = financeEntrySchema.parse(first(replay).body);
  expect(replay.map(({ body }) => financeEntrySchema.parse(body).id)).toEqual([
    reversed.id,
    reversed.id,
  ]);
  expect(reversed).toMatchObject({
    reversesId: confirmed.id,
    differenceUsd: '0.50',
    lines: [
      { direction: 'IN', amountUsd: '10.00' },
      {
        direction: 'OUT',
        amountUsd: '9.50',
        exchangeRateId: confirmed.lines[1]?.exchangeRateId,
        unitsPerUsd: '40',
      },
    ],
  });
  await post('admin', reversePath, { ...reverse, operationId: randomUUID() }).expect(409);
  expect(
    await db.auditLog.count({ where: { action: 'finance.reverse', entityId: reversed.id } }),
  ).toBe(1);
  await expect(
    db.financeEntry.update({ where: { id: confirmed.id }, data: { description: 'Cambiar' } }),
  ).rejects.toThrow();

  const firstDay = await report({ date: firstDate, accountId: bank }, true);
  const secondDay = await report({ date: secondDate, accountId: bank }, true);
  expect(first(firstDay.accounts)).toMatchObject({
    openingOriginal: '0',
    outgoingOriginal: '10',
    closingOriginal: '-10',
  });
  expect(first(secondDay.accounts)).toMatchObject({
    openingOriginal: '-10',
    incomingOriginal: '10',
    closingOriginal: '0',
  });
  expect(secondDay.cash).toMatchObject({
    cashInUsd: '0.00',
    cashOutUsd: '0.00',
    accountNetUsd: '10.00',
  });
});

it('exige tasas y resguarda los ajustes, las categorías y la visibilidad financiera', async () => {
  const { usd, bank, ves } = currencyAccounts;
  const firstWindow = (await report({ date: '2025-04-01', accountId: bank }, true)).window;
  const header = { occurredAt: firstWindow.from, description: key };
  const invalidRate = await post('finance', finance + '/entries/preview', {
    ...header,
    kind: 'OTHER_INCOME',
    payment: { accountId: ves, amountOriginal: '400' },
  }).expect(409);
  expect(invalidRate.body.error.code).toBe('RATE_REQUIRED');
  const uneven = await post('finance', finance + '/entries/preview', {
    ...header,
    kind: 'TRANSFER',
    source: { accountId: usd, amountOriginal: '11' },
    destination: { accountId: bank, amountOriginal: '10' },
  }).expect(400);
  expect(uneven.body.error.code).toBe('TRANSFER_AMOUNT');
  const adjustment = {
    ...header,
    kind: 'ADJUSTMENT',
    direction: 'IN',
    payment: { accountId: bank, amountOriginal: '30' },
  };
  await post('manager', finance + '/entries/preview', adjustment).expect(403);
  const valid = await register(adjustment);
  await post('manager', finance + '/entries/' + valid.id + '/reverse', {
    operationId: randomUUID(),
    reason: 'Permiso insuficiente',
  }).expect(403);

  const expense = await register({
    ...header,
    kind: 'EXPENSE',
    categoryId,
    payment: { accountId: bank, amountOriginal: '7' },
  });
  const renamed = await agent('admin')
    .put(finance + '/categories/' + categoryId)
    .set('Origin', origin)
    .send({ name: 'Operación archivada ' + key, active: false })
    .expect(200);
  expect(financeCategorySchema.parse(renamed.body).active).toBe(false);
  await post('finance', finance + '/entries/preview', {
    ...header,
    kind: 'EXPENSE',
    categoryId,
    payment: { accountId: bank, amountOriginal: '7' },
  }).expect(409);
  const reversal = await post('finance', finance + '/entries/' + expense.id + '/reverse', {
    operationId: randomUUID(),
    reason: 'Salida devuelta',
    occurredAt: firstWindow.to,
  }).expect(201);
  expect(financeEntrySchema.parse(reversal.body).categoryName).toBe(expense.categoryName);
  const nextDay = await report({ date: '2025-04-02', accountId: bank }, true);
  expect(nextDay.cash).toMatchObject({
    expensesUsd: '-7.00',
    cashInUsd: '7.00',
    accountNetUsd: '7.00',
  });
  expect(nextDay.expenseCategories).toEqual([
    { id: categoryId, name: 'Operación archivada ' + key, usd: '-7.00' },
  ]);

  const previous = await agent('admin')
    .get(root + '/roles')
    .expect(200);
  const rights = (previous.body as { code: string; costs: boolean; profits: boolean }[]).find(
    ({ code }) => code === 'MANAGER',
  );
  if (!rights) throw new Error('Falta el rol gerente.');
  await agent('admin')
    .put(root + '/roles/MANAGER/financial-permissions')
    .set('Origin', origin)
    .send({ costs: false, profits: true })
    .expect(200);
  try {
    const restricted = await agent('manager')
      .get(finance + '/report')
      .query({ period: 'DAY' })
      .expect(200);
    expect(restricted.body.recognition).not.toHaveProperty('cogsUsd');
    expect(restricted.body.recognition).not.toHaveProperty('grossProfitUsd');
    expect(restricted.body.recognition).not.toHaveProperty('netProfitUsd');
    await agent('manager')
      .get(finance + '/payables')
      .expect(403);
  } finally {
    await agent('admin')
      .put(root + '/roles/MANAGER/financial-permissions')
      .set('Origin', origin)
      .send({ costs: rights.costs, profits: rights.profits })
      .expect(200);
  }
});
