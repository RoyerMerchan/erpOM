import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  accountRecord,
  analyticsResponseSchema,
  auditRecord,
  catalogPreviewSchema,
  correctionDetail,
  correctionPreview,
  financeCategorySchema,
  financeEntryPreviewSchema,
  financeEntrySchema,
  financeReportSchema,
  inventoryRowSchema,
  layawayDetail,
  pageSchema,
  purchaseDetailSchema,
  rateRecord,
  saleDetailSchema,
  shopRecord,
  variantRecord,
} from '@max-sport/shared';
import { calendarDate } from '../../api/dist/finance/calendar.js';
import { decimal } from '../../api/dist/purchasing/money.js';
import {
  choose,
  create,
  createContact,
  login,
  parse,
  post,
  read,
  responseAt,
  staff,
} from './support';

test('concilia una compra COP, una venta mixta, un apartado y una devolución', async ({
  page,
  browser,
}) => {
  const administrator = await staff('ADMIN');
  const key = administrator.key;
  const model = 'Legend QA ' + key;
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await login(page, administrator);
  const api = page.request;
  const shop = await read(api, '/shop', shopRecord);
  const now = new Date();
  const occurredAt = now.toISOString();
  const dates = {
    from: calendarDate(new Date(now.getTime() - 86_400_000), shop.timezone),
    to: calendarDate(new Date(now.getTime() + 86_400_000), shop.timezone),
  };
  const range = { period: 'RANGE', ...dates };
  const initial = await read(api, '/finance/report', financeReportSchema, range);

  const supplier = await createContact(api, '/suppliers', 'Proveedor QA ' + key);
  const customer = await createContact(api, '/customers', 'Cliente QA ' + key);
  const account = (currencyCode: string, kind: string) =>
    create(
      api,
      '/accounts',
      { name: 'Caja ' + currencyCode + ' QA ' + key, currencyCode, kind },
      accountRecord,
    );
  const [cop, ves, usdt, usd] = await Promise.all([
    account('COP', 'BANK'),
    account('VES', 'MOBILE'),
    account('USDT', 'CRYPTO'),
    account('USD', 'CASH'),
  ]);
  await create(
    api,
    '/rates',
    {
      currencyCode: 'COP',
      unitsPerUsd: '4000',
      effectiveAt: new Date(now.getTime() - 60_000).toISOString(),
    },
    rateRecord,
  );

  const draft = await create(
    api,
    '/purchases',
    {
      supplierId: supplier.id,
      currencyCode: 'COP',
      documentAt: occurredAt,
      reference: key,
      unitsPerUsd: '4000',
      groups: [
        {
          model: { mode: 'new', name: model, brand: { mode: 'new', name: 'Marca QA ' + key } },
          lines: [
            { size: 38, quantity: 3, unitCostOriginal: '80000', salePriceUsd: '45' },
            { size: 39, quantity: 5, unitCostOriginal: '80000', salePriceUsd: '50' },
            { size: 40, quantity: 7, unitCostOriginal: '84000', salePriceUsd: '55' },
          ],
        },
      ],
    },
    purchaseDetailSchema,
  );
  expect(draft.status).toBe('DRAFT');
  expect(draft.preview).toMatchObject({
    totalOriginal: '1228000',
    totalUsd: '307.00',
    pairCount: 15,
  });
  const stock = () => read(api, '/inventory', pageSchema(inventoryRowSchema), { q: model });
  expect((await stock()).items).toHaveLength(0);

  const receivePath = '/purchases/' + draft.id + '/receive';
  const receiptInput = { operationId: randomUUID(), revision: draft.revision };
  const [received, retried] = await Promise.all([
    create(api, receivePath, receiptInput, purchaseDetailSchema, 200),
    create(api, receivePath, receiptInput, purchaseDetailSchema, 200),
  ]);
  expect(received.items.map((item) => item.costs?.unitCostUsd)).toEqual(['20', '20', '21']);
  expect(retried.items.map(({ id }) => id)).toEqual(received.items.map(({ id }) => id));
  const bySize = (size: number) => {
    const item = received.items.find((line) => line.size === size);
    if (!item) throw new Error('Falta una talla recibida.');
    return item;
  };
  const currentVariant = await read(api, '/variants/' + bySize(38).variantId, variantRecord);
  const paid = await create(
    api,
    '/purchases/' + draft.id + '/payments',
    {
      operationId: randomUUID(),
      accountId: cop.id,
      paidAt: occurredAt,
      amountOriginal: '40000',
      unitsPerUsd: '4000',
    },
    purchaseDetailSchema,
    200,
  );
  expect(paid.financial?.balanceUsd).toBe('297.00');
  await create(
    api,
    '/rates',
    { currencyCode: 'COP', unitsPerUsd: '4100', effectiveAt: occurredAt },
    rateRecord,
  );
  const historical = await read(api, '/purchases/' + draft.id, purchaseDetailSchema);
  expect(historical.financial).toMatchObject({ totalUsd: '307.00', unitsPerUsd: '4000' });

  await page.goto('/ventas/pos');
  await page.getByLabel('Modelo, marca o SKU').fill(model);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  for (const size of [38, 40]) {
    await page
      .getByRole('button', { name: 'Agregar ' + model + ', talla ' + size, exact: true })
      .click();
  }
  const discounted = page
    .locator('article')
    .filter({ has: page.getByRole('button', { name: 'Quitar ' + model + ', talla 40' }) });
  await discounted.getByText('Descuento de línea', { exact: true }).click();
  await choose(page, discounted.getByLabel('Tipo de descuento'), 'Importe fijo');
  await discounted.getByLabel('Importe', { exact: true }).fill('10');

  const tender = (index: number) => page.locator('.pos-tender').nth(index);
  await choose(page, tender(0).getByLabel('Cuenta de cobro'), cop.name, cop.name);
  await tender(0).getByLabel('Importe en COP').fill('160000');
  await tender(0).getByLabel('1 USD equivale a COP').fill('4000');
  await page.getByRole('button', { name: 'Agregar cobro' }).click();
  await choose(page, tender(1).getByLabel('Cuenta de cobro'), ves.name, ves.name);
  await tender(1).getByLabel('Importe en VES').fill('2000');
  await tender(1).getByLabel('1 USD equivale a VES').fill('40');
  await page.getByRole('button', { name: 'Calcular venta' }).click();
  const quotedTotal = page.getByText('Total de la venta', { exact: true });
  await expect(quotedTotal).toBeVisible();
  await tender(1).getByLabel('Importe en VES').fill('1600');
  await expect(quotedTotal).toBeHidden();
  await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
  await page.getByRole('button', { name: 'Calcular venta' }).click();
  await expect(page.getByText('Falta cobrar', { exact: true }).locator('..')).toContainText(
    '10,00 USD',
  );
  await tender(1).getByLabel('Importe en VES').fill('2000');
  await page.getByRole('button', { name: 'Calcular venta' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  const completed = responseAt(page, '/sales');
  await page
    .getByRole('alertdialog', { name: 'Confirmar venta' })
    .getByRole('button', { name: 'Registrar venta' })
    .click();
  const confirmation = await completed;
  const sale = await parse(confirmation, saleDetailSchema, 201);
  expect(sale).toMatchObject({ totalUsd: '90.00', cogsUsd: '41.00', grossProfitUsd: '49.00' });
  expect(sale.tenders.map(({ currencyCode, amountUsd }) => [currencyCode, amountUsd])).toEqual([
    ['COP', '40.00'],
    ['VES', '50.00'],
  ]);
  await expect(page).toHaveURL(new RegExp('/ventas/' + sale.id + '$'));
  const exactRetry = await create(
    api,
    '/sales',
    confirmation.request().postDataJSON(),
    saleDetailSchema,
  );
  expect(exactRetry.id).toBe(sale.id);

  const layaway = await create(
    api,
    '/layaways',
    {
      operationId: randomUUID(),
      customerId: customer.id,
      items: [{ variantId: bySize(39).variantId, quantity: 1 }],
      payments: [{ accountId: usdt.id, amountOriginal: '10', unitsPerUsd: '1' }],
    },
    layawayDetail,
  );
  expect(layaway.balanceUsd).toBe('40.00');
  expect((await stock()).items.find(({ size }) => size === 39)).toMatchObject({
    physical: 5,
    reserved: 1,
    available: 4,
  });
  expect(
    (await read(api, '/finance/report', financeReportSchema, range)).recognition.salesCount,
  ).toBe(initial.recognition.salesCount + 1);
  const layawayPath = '/layaways/' + layaway.id;
  const settled = await create(
    api,
    layawayPath + '/payments',
    {
      operationId: randomUUID(),
      payments: [{ accountId: cop.id, amountOriginal: '160000', unitsPerUsd: '4000' }],
    },
    layawayDetail,
    200,
  );
  expect(settled.status).toBe('PAID');
  const delivered = await create(
    api,
    layawayPath + '/deliver',
    { operationId: randomUUID() },
    layawayDetail,
    200,
  );
  expect(delivered.status).toBe('DELIVERED');
  const relatedSale = await read(api, '/sales/' + delivered.saleId, saleDetailSchema);
  expect(relatedSale.tenders.map(({ kind, amountUsd }) => [kind, amountUsd])).toEqual([
    ['ADVANCE', '10.00'],
    ['ADVANCE', '40.00'],
  ]);

  const returning = sale.items.find(({ size }) => size === 38);
  if (!returning) throw new Error('Falta el par vendido que se devuelve.');
  const correction = {
    saleId: sale.id,
    reason: 'Devolución QA ' + key,
    items: [{ saleItemId: returning.id, quantity: 1, condition: 'SELLABLE' }],
    refunds: [{ accountId: cop.id, unitsPerUsd: '4000', amountOriginal: '180000' }],
  };
  const correctionQuote = await create(api, '/returns/preview', correction, correctionPreview, 200);
  const returned = await create(
    api,
    '/returns',
    {
      operationId: randomUUID(),
      correction,
      quoteDigest: correctionQuote.quoteDigest,
    },
    correctionDetail,
  );
  expect(returned.originalSaleId).toBe(sale.id);
  const stocked = (await stock()).items.sort((first, second) => first.size - second.size);
  expect(stocked.map(({ size, physical, reserved }) => [size, physical, reserved])).toEqual([
    [38, 3, 0],
    [39, 4, 0],
    [40, 6, 0],
  ]);

  const category = await create(
    api,
    '/finance/categories',
    { name: 'Gasto QA ' + key },
    financeCategorySchema,
  );
  const entry = {
    kind: 'EXPENSE',
    categoryId: category.id,
    occurredAt,
    description: key,
    payment: { accountId: usd.id, amountOriginal: '12' },
  };
  const expense = await create(
    api,
    '/finance/entries/preview',
    entry,
    financeEntryPreviewSchema,
    200,
  );
  const expenseRecord = await create(
    api,
    '/finance/entries',
    {
      operationId: randomUUID(),
      entry,
      quoteDigest: expense.quoteDigest,
    },
    financeEntrySchema,
  );
  const actual = await read(api, '/finance/report', financeReportSchema, range);
  const change = (value?: string, base?: string) =>
    decimal(value ?? 0)
      .sub(base ?? 0)
      .toFixed(2);
  expect(actual.recognition.salesCount - initial.recognition.salesCount).toBe(2);
  expect(change(actual.recognition.netSalesUsd, initial.recognition.netSalesUsd)).toBe('95.00');
  expect(change(actual.recognition.cogsUsd, initial.recognition.cogsUsd)).toBe('41.00');
  expect(change(actual.recognition.grossProfitUsd, initial.recognition.grossProfitUsd)).toBe(
    '54.00',
  );
  expect(change(actual.recognition.netProfitUsd, initial.recognition.netProfitUsd)).toBe('42.00');
  expect(change(actual.cash.collectedUsd, initial.cash.collectedUsd)).toBe('140.00');
  expect(change(actual.cash.cashFlowUsd, initial.cash.cashFlowUsd)).toBe('73.00');
  for (const id of [draft.id, sale.id, layaway.id, returned.id, expenseRecord.id]) {
    const audit = await read(api, '/audit', pageSchema(auditRecord), { q: id });
    expect(audit.items.some((event) => event.entityId === id)).toBe(true);
  }

  const scoped = { ...range, section: 'SALES', modelId: currentVariant.modelId };
  const report = await read(api, '/analytics', analyticsResponseSchema, scoped);
  expect(report.sections[0]?.metrics.find(({ id }) => id === 'net-sales')?.value).toBe('95.00');
  await page.goto('/reportes?' + new URLSearchParams(scoped).toString());
  await expect(page.getByRole('heading', { name: 'Reportes', exact: true })).toBeVisible();
  await expect(page.getByText('95,00 USD', { exact: true }).first()).toBeVisible();
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar CSV' }).click();
  const csv = await reportDownload;
  expect(csv.suggestedFilename()).toMatch(/^reporte-sales-.+\.csv$/);
  expect(await readFile(await csv.path(), 'utf8')).toContain('Ventas netas');

  await page.goto('/catalogo');
  const catalogDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  const catalogPath = await (await catalogDownload).path();
  if (!catalogPath) throw new Error('Falta el archivo descargado.');
  const pdf = await readFile(catalogPath, 'latin1');
  expect(pdf.slice(0, 5)).toBe('%PDF-');
  expect(pdf).not.toMatch(/\/Subtype\s+\/Image\b/);

  const seller = await staff('SELLER');
  const sellerPage = await browser.newPage({ baseURL: 'http://localhost:4173' });
  try {
    await login(sellerPage, seller);
    await expect(sellerPage.getByRole('list', { name: 'Operación' })).toBeVisible();
    const administration = sellerPage.getByRole('list', { name: 'Administración' });
    await expect(administration.getByRole('link', { name: 'Configuración' })).toBeVisible();
    await expect(administration.getByRole('link', { name: 'Usuarios y roles' })).toHaveCount(0);
    await expect(administration.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
    const own = await read(sellerPage.request, '/analytics', analyticsResponseSchema, scoped);
    expect(own.sections[0]?.metrics.find(({ id }) => id === 'net-sales')?.value).toBe('0.00');
    expect(own.sections[0]?.metrics.some(({ id }) => ['cogs', 'gross-profit'].includes(id))).toBe(
      false,
    );
    expect((await sellerPage.request.get('/api/v1/sales/' + sale.id)).status()).toBe(404);
    expect(
      (
        await post(sellerPage.request, '/rates', {
          currencyCode: 'COP',
          unitsPerUsd: '1',
          effectiveAt: occurredAt,
        })
      ).status(),
    ).toBe(403);
    const catalog = await read(sellerPage.request, '/catalog/preview', catalogPreviewSchema, {
      modelId: currentVariant.modelId,
      currencyCode: 'COP',
      unitsPerUsd: '4000',
    });
    expect(catalog.items.map(({ priceLocal }) => priceLocal)).toEqual([
      '180000',
      '200000',
      '220000',
    ]);
    expect(
      catalog.items.every((item) => item.sizes.every((size) => size.available === undefined)),
    ).toBe(true);
  } finally {
    await sellerPage.context().close();
  }
  expect(runtimeErrors).toEqual([]);
});
