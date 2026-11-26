import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  inventoryRowSchema,
  pageSchema,
  purchaseDetailSchema,
  purchaseSummarySchema,
} from '@max-sport/shared';
import { choose, create, createContact, login, read, staff } from './support';

test('una reposición conserva el código de la talla y se registra en Compras', async ({ page }) => {
  const user = await staff('ADMIN');
  await login(page, user);
  const api = page.request;
  const supplier = await createContact(api, '/suppliers', 'Proveedor stock ' + user.key);
  const model = 'Modelo stock ' + user.key;
  const draft = await create(
    api,
    '/purchases',
    {
      supplierId: supplier.id,
      documentAt: new Date().toISOString(),
      currencyCode: 'USD',
      groups: [
        {
          model: {
            mode: 'new',
            name: model,
            brand: { mode: 'new', name: 'Marca stock ' + user.key },
          },
          lines: [{ size: 38, quantity: 1, unitCostOriginal: '20', salePriceUsd: '45' }],
        },
      ],
    },
    purchaseDetailSchema,
  );
  const initialReceipt = await create(
    api,
    '/purchases/' + draft.id + '/receive',
    { operationId: randomUUID(), revision: draft.revision },
    purchaseDetailSchema,
    200,
  );
  const original = initialReceipt.items[0]!;
  const stock = () => read(api, '/inventory', pageSchema(inventoryRowSchema), { q: model });

  await page.goto('/compras');
  await expect(page.getByRole('link', { name: 'Agregar existencia' })).toHaveAttribute(
    'href',
    '/inventario/agregar?desde=compras',
  );
  await page.goto('/compras/nueva');
  await expect(page.getByRole('heading', { name: 'Agregar existencia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a compras' })).toBeVisible();

  await page.goto('/inventario?' + new URLSearchParams({ q: model }));
  await expect(page.getByRole('link', { name: 'Agregar existencia' })).toHaveAttribute(
    'href',
    '/inventario/agregar',
  );
  await expect(
    page.getByRole('navigation', { name: 'Secciones del módulo' }).getByText('Códigos por talla'),
  ).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Ver detalle de Marca stock ' + user.key + ' ' + model + ', talla 38',
    })
    .click();
  const details = page.getByRole('dialog', { name: 'Detalle de existencias' });
  await expect(details.getByRole('link', { name: 'Ver código y precio' })).toHaveAttribute(
    'href',
    '/inventario/variantes?q=' + original.sku,
  );
  await details.getByRole('link', { name: 'Agregar más pares' }).click();
  await expect(page.getByRole('heading', { name: 'Agregar más pares' })).toBeVisible();
  await expect(page.getByText('Talla 38', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Precio de venta en USD')).toHaveValue('45.00');
  await expect(page.getByLabel('Origen del modelo')).toHaveCount(0);
  await choose(page, page.getByLabel('Proveedor', { exact: true }), supplier.name, supplier.name);
  await page.getByLabel('Pares recibidos').fill('2');
  await page.getByLabel('Costo por par en USD').fill('21');
  await page.getByRole('button', { name: 'Continuar a recepción' }).click();
  await expect(page.getByRole('heading', { name: 'Detalle de compra' })).toBeVisible();
  expect((await stock()).items[0]?.physical).toBe(1);

  const path = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await page
    .getByRole('dialog', { name: 'Confirmar recepción' })
    .getByRole('button', { name: 'Confirmar recepción' })
    .click();
  await expect(page.getByText('Confirmada', { exact: true })).toBeVisible();
  expect((await stock()).items).toMatchObject([
    { id: original.variantId, sku: original.sku, size: 38, physical: 3, available: 3 },
  ]);
  const purchases = await read(api, '/purchases', pageSchema(purchaseSummarySchema), {
    q: supplier.name,
    status: 'CONFIRMED',
  });
  expect(purchases.items.map(({ id }) => '/compras/' + id).sort()).toEqual(
    [path, '/compras/' + draft.id].sort(),
  );
});
