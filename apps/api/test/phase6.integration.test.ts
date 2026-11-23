import { randomUUID } from 'node:crypto';
import {
  analyticsResponseSchema,
  catalogPreviewSchema,
  catalogVersionSchema,
  correctionPreview,
  layawayDetail,
  pageSchema,
  purchaseDetailSchema,
  saleDetailSchema,
  salePreviewSchema,
  shopRecord,
} from '@max-sport/shared';
import type { AnalyticsBlock, AnalyticsResponse } from '@max-sport/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { Response } from 'supertest';
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
const key = 'p6-' + randomUUID().slice(0, 12);
const root = '/api/v1';
const roles = {
  admin: 'ADMIN',
  seller: 'SELLER',
  other: 'SELLER',
  inventory: 'INVENTORY',
} as const;
type Actor = keyof typeof roles;
const agents = new Map<Actor, { agent: ReturnType<typeof request.agent>; id: string }>();
let fixture: {
  modelId: string;
  brandId: string;
  stock38: string;
  stock39: string;
  stock40: string;
  stock44: string;
  supplierId: string;
};
let payments: { usd: string; cop: string; ves: string };
let range: { period: string; from: string; to: string };
let firstSaleId: string;
let secondSaleId: string;
let layawayId: string;

function actor(user: Actor) {
  const entry = agents.get(user);
  if (!entry) throw new Error('Falta un actor para la prueba.');
  return entry;
}
const post = (user: Actor, url: string, payload: object) =>
  actor(user)
    .agent.post(root + url)
    .set('Origin', config.APP_ORIGIN)
    .send(payload);
const get = (user: Actor, path: string) => actor(user).agent.get(root + path);
function first<T>(items: T[]) {
  const value = items[0];
  if (value === undefined) throw new Error('Faltan registros de prueba.');
  return value;
}
function binary(response: Response, callback: (error: Error | null, data?: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error));
}
function assertPdf(buffer: Buffer) {
  const document = buffer.toString('latin1');
  expect(document.startsWith('%PDF-')).toBe(true);
  expect(document).toMatch(/\/Type\s+\/Page\b/);
  expect(document).not.toMatch(/\/Subtype\s+\/Image\b/);
}

async function sell(user: Actor, sale: object) {
  const quote = salePreviewSchema.parse(
    (await post(user, '/sales/preview', sale).expect(200)).body,
  );
  return saleDetailSchema.parse(
    (
      await post(user, '/sales', {
        operationId: randomUUID(),
        quoteDigest: quote.quoteDigest,
        sale,
      }).expect(201)
    ).body,
  );
}

beforeAll(async () => {
  const password = 'pruebas-reportes-' + randomUUID();
  const passwordHash = await hashPassword(password);
  for (const user of Object.keys(roles) as Actor[]) {
    const email = key + '-' + user + '@example.test';
    const saved = await db.user.create({
      data: {
        displayName: key + '-' + user,
        email,
        passwordHash,
        role: { connect: { code: roles[user] } },
      },
    });
    const agent = request.agent(app);
    await agent
      .post(root + '/auth/login')
      .set('Origin', config.APP_ORIGIN)
      .send({ email, password })
      .expect(200);
    agents.set(user, { agent, id: saved.id });
  }
  const supplier = await db.supplier.create({ data: { name: 'Proveedor ' + key } });
  const customer = await db.customer.create({ data: { name: 'Cliente ' + key } });
  const usd = await db.moneyAccount.create({
    data: { name: 'USD ' + key, currencyCode: 'USD', kind: 'CASH' },
  });
  const cop = await db.moneyAccount.create({
    data: { name: 'COP ' + key, currencyCode: 'COP', kind: 'BANK' },
  });
  const ves = await db.moneyAccount.create({
    data: { name: 'VES ' + key, currencyCode: 'VES', kind: 'MOBILE' },
  });
  payments = { usd: usd.id, cop: cop.id, ves: ves.id };
  const time = new Date();
  const zone = shopRecord.parse((await get('admin', '/shop').expect(200)).body).timezone;
  range = {
    period: 'RANGE',
    from: calendarDate(new Date(time.getTime() - 86_400_000), zone),
    to: calendarDate(new Date(time.getTime() + 86_400_000), zone),
  };

  const brandName = 'Águila ' + key;
  const draft = purchaseDetailSchema.parse(
    (
      await post('admin', '/purchases', {
        supplierId: supplier.id,
        currencyCode: 'USD',
        documentAt: time.toISOString(),
        reference: key,
        groups: [
          {
            model: {
              mode: 'new',
              name: 'Línea Andina ' + key,
              brand: { mode: 'new', name: brandName },
            },
            lines: [
              [38, 4, '20', '50'],
              [39, 3, '22', '60'],
              [40, 1, '23', '65'],
              [44, 1, '24', '75'],
            ].map(([size, quantity, unitCostOriginal, salePriceUsd]) => ({
              size,
              quantity,
              unitCostOriginal,
              salePriceUsd,
            })),
          },
        ],
      }).expect(201)
    ).body,
  );
  const received = purchaseDetailSchema.parse(
    (
      await post('admin', '/purchases/' + draft.id + '/receive', {
        operationId: randomUUID(),
        revision: draft.revision,
      }).expect(200)
    ).body,
  );
  const [stock38, stock39, stock40, stock44] = [38, 39, 40, 44].map(
    (size) => received.items.find((item) => item.size === size)?.variantId,
  );
  if (!stock38 || !stock39 || !stock40 || !stock44) throw new Error('Faltan tallas de prueba.');
  const model = await db.productVariant.findUniqueOrThrow({
    where: { id: stock38 },
    select: { model: true },
  });
  await db.productModel.update({
    where: { id: model.model.id },
    data: { description: 'Calzado de prueba con descripción y acentos.' },
  });
  await db.productVariant.update({ where: { id: stock38 }, data: { lowStockThreshold: 0 } });
  await db.productVariant.update({ where: { id: stock39 }, data: { lowStockThreshold: 2 } });
  await db.productVariant.update({ where: { id: stock44 }, data: { active: false } });
  fixture = {
    modelId: model.model.id,
    brandId: model.model.brandId,
    stock38,
    stock39,
    stock40,
    stock44,
    supplierId: supplier.id,
  };

  const sold = await sell('seller', {
    customerId: customer.id,
    items: [
      {
        variantId: stock38,
        quantity: 1,
        discount: { kind: 'FIXED', currencyCode: 'USD', amountOriginal: '10' },
      },
      { variantId: stock39, quantity: 1 },
    ],
    payments: [
      { accountId: cop.id, amountOriginal: '200000', unitsPerUsd: '4000' },
      { accountId: ves.id, amountOriginal: '2000.10', unitsPerUsd: '40.002' },
    ],
  });
  firstSaleId = sold.id;
  const second = await sell('other', {
    customerId: customer.id,
    items: [{ variantId: stock39, quantity: 1 }],
    payments: [{ accountId: usd.id, amountOriginal: '60' }],
  });
  secondSaleId = second.id;
  const returned = sold.items.find((item) => item.variantId === stock38);
  if (!returned) throw new Error('Falta la línea devuelta.');
  const correction = {
    saleId: sold.id,
    reason: 'Devuelto al inventario',
    items: [{ saleItemId: returned.id, quantity: 1, condition: 'SELLABLE' }],
    refunds: [{ accountId: usd.id, amountOriginal: '40' }],
  };
  const quote = correctionPreview.parse(
    (await post('admin', '/returns/preview', correction).expect(200)).body,
  );
  await post('admin', '/returns', {
    operationId: randomUUID(),
    quoteDigest: quote.quoteDigest,
    correction,
  }).expect(201);
  const hold = layawayDetail.parse(
    (
      await post('seller', '/layaways', {
        operationId: randomUUID(),
        customerId: customer.id,
        items: [{ variantId: stock40, quantity: 1 }],
        payments: [{ accountId: usd.id, amountOriginal: '5' }],
      }).expect(201)
    ).body,
  );
  layawayId = hold.id;
}, 32_000);
afterAll(async () => db.$disconnect());

async function analytics(user: Actor, filters: Record<string, string> = {}) {
  return analyticsResponseSchema.parse(
    (
      await get(user, '/analytics')
        .query({ ...range, ...filters })
        .expect(200)
    ).body,
  );
}
function section(report: AnalyticsResponse, name: AnalyticsBlock['section']) {
  return first(report.sections.filter((block) => block.section === name));
}
const amount = (block: AnalyticsBlock, id: string) =>
  block.metrics.find((item) => item.id === id)?.value;

it('concilia líneas, cobros, devoluciones, recepciones y alertas por talla', async () => {
  const all = await analytics('admin', {
    modelId: fixture.modelId,
    supplierId: fixture.supplierId,
  });
  const sales = section(all, 'SALES');
  expect(amount(sales, 'net-sales')).toBe('120.00');
  expect(amount(sales, 'gross-sales')).toBe('170.00');
  expect(amount(sales, 'sales-count')).toBe('2');
  expect(amount(sales, 'pairs-sold')).toBe('2');
  expect(amount(sales, 'average-ticket')).toBe('60.00');
  expect(amount(sales, 'discounts')).toBe('10.00');
  expect(amount(sales, 'refunds')).toBe('40.00');
  expect(amount(sales, 'cogs')).toBe('44.00');
  expect(amount(sales, 'gross-profit')).toBe('76.00');
  expect(
    sales.trend?.current.reduce((sum, point) => sum.add(point.value), decimal(0)).toFixed(2),
  ).toBe('120.00');
  expect(sales.trend?.previous.every(({ value }) => value === '0.00')).toBe(true);
  const narrower = section(
    await analytics('admin', {
      section: 'SALES',
      size: '39',
      modelId: fixture.modelId,
      interval: 'WEEK',
    }),
    'SALES',
  );
  expect(amount(narrower, 'net-sales')).toBe('120.00');
  const mixed = section(
    await analytics('admin', { section: 'SALES', modelId: fixture.modelId, method: 'BANK' }),
    'SALES',
  );
  expect(amount(mixed, 'sales-count')).toBe('1');
  expect(amount(mixed, 'net-sales')).toBe('60.00');
  const cash = section(
    await analytics('admin', {
      section: 'CASH',
      accountId: payments.cop,
      currencyCode: 'COP',
      method: 'BANK',
    }),
    'CASH',
  );
  expect(amount(cash, 'collectedUsd')).toBe('50.00');
  expect(cash.tables.find(({ id }) => id === 'cash-accounts')?.rows[0]?.cells.slice(2, 5)).toEqual([
    'COP',
    '200000',
    '50.00',
  ]);
  const historicalCurrency = await db.currency.findUniqueOrThrow({ where: { code: 'VES' } });
  await db.currency.update({ where: { code: 'VES' }, data: { minorUnits: 0 } });
  try {
    const ves = section(
      await analytics('admin', { section: 'CASH', accountId: payments.ves }),
      'CASH',
    );
    expect(ves.tables.find(({ id }) => id === 'cash-accounts')?.rows[0]?.cells.slice(2, 5)).toEqual(
      ['VES', '2000.1', '50.00'],
    );
  } finally {
    await db.currency.update({
      where: { code: 'VES' },
      data: { minorUnits: historicalCurrency.minorUnits },
    });
  }
  expect(amount(section(all, 'PURCHASES'), 'received-pairs')).toBe('9');
  expect(amount(section(all, 'PURCHASES'), 'supplier-debt')).toBe('193.00');
  expect(amount(section(all, 'RETURNS'), 'restocked-pairs')).toBe('1');
  const stock = section(all, 'STOCK');
  expect(amount(stock, 'stock-physical')).toBe('7');
  expect(amount(stock, 'stock-held')).toBe('1');
  expect(amount(stock, 'stock-available')).toBe('6');
  expect(amount(stock, 'stock-low')).toBe('2');
  const alerts = stock.tables.find(({ id }) => id === 'stock-alerts');
  expect(alerts?.rows.map(({ cells }) => cells[1]).sort()).toEqual(['39', '40']);
  const oneSize = section(
    await analytics('admin', { section: 'STOCK', modelId: fixture.modelId, size: '40' }),
    'STOCK',
  );
  expect(amount(oneSize, 'stock-empty')).toBe('1');
  expect(amount(oneSize, 'stock-empty-models')).toBe('0');
  const exhausted = await db.productModel.create({
    data: {
      name: 'Agotado ' + key,
      nameKey: 'agotado ' + key,
      brandId: fixture.brandId,
      variants: { create: { size: 42, salePriceUsd: '50', sku: 'agotado-' + key } },
    },
  });
  const empty = section(
    await analytics('admin', { section: 'STOCK', modelId: exhausted.id }),
    'STOCK',
  );
  expect(amount(empty, 'stock-empty-models')).toBe('1');
  expect(empty.tables.find(({ id }) => id === 'empty-models')?.rows[0]?.action?.query).toEqual({
    modelId: exhausted.id,
    stock: 'OUT',
  });
  const layaways = section(all, 'LAYAWAYS');
  expect(amount(layaways, 'customer-debt')).toBe('60.00');
  expect(layaways.tables[0]?.rows[0]?.action?.id).toBe(layawayId);
});

it('respeta la vista propia del vendedor y redacción al consultar y exportar', async () => {
  const own = await analytics('seller', { modelId: fixture.modelId });
  expect(own.sections.map(({ section }) => section)).toEqual([
    'SALES',
    'STOCK',
    'LAYAWAYS',
    'RETURNS',
  ]);
  const sales = section(own, 'SALES');
  expect(amount(sales, 'net-sales')).toBe('60.00');
  expect(amount(sales, 'sales-count')).toBe('1');
  expect(
    sales.tables.find(({ id }) => id === 'recent-sales')?.rows.map((line) => line.action?.id),
  ).toEqual([firstSaleId]);
  expect(JSON.stringify(own)).not.toContain(secondSaleId);
  expect(JSON.stringify(own)).not.toMatch(/Costo FIFO|Utilidad bruta|Valor FIFO/);
  const userFilter = section(
    await analytics('seller', {
      section: 'SALES',
      modelId: fixture.modelId,
      sellerId: actor('other').id,
    }),
    'SALES',
  );
  expect(amount(userFilter, 'net-sales')).toBe('0.00');
  await get('seller', '/analytics').query({ section: 'CASH' }).expect(403);
  await get('seller', '/analytics/export').query({ section: 'SALES', format: 'CSV' }).expect(403);
  await get('inventory', '/analytics/export')
    .query({ section: 'SALES', format: 'PDF' })
    .expect(403);
  const query = { ...range, section: 'SALES', modelId: fixture.modelId };
  const csv = await get('admin', '/analytics/export')
    .query({ ...query, format: 'CSV' })
    .expect('Content-Type', /text\/csv/)
    .expect(200);
  expect(csv.text).toContain('Ventas netas');
  expect(csv.text).toContain('120.00');
  const xlsx = await get('admin', '/analytics/export')
    .query({ ...query, format: 'XLSX' })
    .buffer(true)
    .parse(binary)
    .expect(200);
  expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  expect(workbook.worksheets[0]?.getCell('A1').value).toBe('Ventas');
  expect(workbook.worksheets[1]?.getCell('C2').value).toBe(120);
  const pdf = await get('admin', '/analytics/export')
    .query({ ...query, format: 'PDF' })
    .buffer(true)
    .parse(binary)
    .expect(200);
  assertPdf(pdf.body);
});

it('usa medianoches locales, incluso durante el cambio de hora', async () => {
  const original = shopRecord.parse((await get('admin', '/shop').expect(200)).body);
  await actor('admin')
    .agent.put(root + '/shop')
    .set('Origin', config.APP_ORIGIN)
    .send({ ...original, timezone: 'America/New_York' })
    .expect(200);
  try {
    const report = await analytics('admin', {
      section: 'STOCK',
      period: 'RANGE',
      from: '2025-03-09',
      to: '2025-03-09',
    });
    expect(report.window).toMatchObject({
      from: '2025-03-09T05:00:00.000Z',
      to: '2025-03-10T04:00:00.000Z',
      timezone: 'America/New_York',
    });
    expect(Date.parse(report.window.to) - Date.parse(report.window.from)).toBe(23 * 3_600_000);
    expect(report.comparison.endDate).toBe('2025-03-08');
  } finally {
    await actor('admin')
      .agent.put(root + '/shop')
      .set('Origin', config.APP_ORIGIN)
      .send(original)
      .expect(200);
  }
});

it('genera un catálogo público por talla y conserva versiones idénticas con acceso autorizado', async () => {
  const filters = {
    brandId: fixture.brandId,
    modelId: fixture.modelId,
    currencyCode: 'COP',
    unitsPerUsd: '4000',
  };
  const preview = catalogPreviewSchema.parse(
    (await get('seller', '/catalog/preview').query(filters).expect(200)).body,
  );
  expect(preview.items.map((item) => [item.priceUsd, item.priceLocal, item.sizes])).toEqual([
    ['50.00', '200000', [{ size: 38 }]],
    ['60.00', '240000', [{ size: 39 }]],
  ]);
  expect(preview.items[0]?.description).toContain('acentos');
  expect(JSON.stringify(preview)).not.toMatch(/available|cost|margin|profit|sku/i);
  await get('seller', '/catalog/preview')
    .query({ ...filters, includeQuantity: 'true' })
    .expect(403);
  await post('seller', '/catalog/pdf', { ...filters, includeQuantity: true }).expect(403);
  await post('seller', '/catalog/pdf', { ...filters, unitsPerUsd: null }).expect(409);
  const exact = catalogPreviewSchema.parse(
    (
      await get('inventory', '/catalog/preview')
        .query({ ...filters, includeQuantity: 'true', size: '38' })
        .expect(200)
    ).body,
  );
  expect(exact.items[0]?.sizes).toEqual([{ size: 38, available: 4 }]);
  const ordinary = await post('seller', '/catalog/pdf', filters)
    .buffer(true)
    .parse(binary)
    .expect('Content-Type', /application\/pdf/)
    .expect(200);
  assertPdf(ordinary.body);
  expect(ordinary.headers['x-catalog-version']).toBeUndefined();

  const input = { ...filters, includeQuantity: true, save: true, operationId: randomUUID() };
  const saved = await post('admin', '/catalog/pdf', input).buffer(true).parse(binary).expect(200);
  assertPdf(saved.body);
  const id = String(saved.headers['x-catalog-version']);
  const versions = pageSchema(catalogVersionSchema).parse(
    (await get('admin', '/catalog/versions').query({ q: key }).expect(200)).body,
  );
  expect(versions.items).toEqual([
    expect.objectContaining({
      id,
      productCount: 2,
      currencyCode: 'COP',
      unitsPerUsd: '4000',
      includeQuantity: true,
      byteCount: saved.body.length,
    }),
  ]);
  await get('seller', '/catalog/versions/' + id).expect(404);
  await get('inventory', '/catalog/versions/' + id).expect(404);
  await db.productVariant.update({ where: { id: fixture.stock38 }, data: { salePriceUsd: '55' } });
  const duplicate = await post('admin', '/catalog/pdf', input)
    .buffer(true)
    .parse(binary)
    .expect(200);
  expect(duplicate.body.equals(saved.body)).toBe(true);
  const history = await get('admin', '/catalog/versions/' + id)
    .buffer(true)
    .parse(binary)
    .expect(200);
  expect(history.body.equals(saved.body)).toBe(true);
  expect(await db.auditLog.count({ where: { entityId: id, action: 'catalog.save' } })).toBe(1);
});
