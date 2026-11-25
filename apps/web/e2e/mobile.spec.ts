import { expect, test } from '@playwright/test';
import { choose, createContact, login, staff } from './support';

test.use({ viewport: { width: 360, height: 800 } });

test('la navegación y la matriz de tallas caben a 360 px', async ({ page }, testInfo) => {
  const user = await staff('ADMIN');
  await login(page, user);
  const supplier = await createContact(page.request, '/suppliers', 'Proveedor móvil ' + user.key);
  const withoutOverflow = async (route: string) => {
    const overflow = () =>
      page.locator('html').evaluate((html) => html.scrollWidth - html.clientWidth);
    await expect
      .poll(overflow, { message: 'Desbordamiento horizontal en ' + route })
      .toBeLessThanOrEqual(1);
  };

  await expect(page.getByText('Ventas netas', { exact: true }).first()).toBeVisible();
  await withoutOverflow('/dashboard');
  await page.screenshot({ path: testInfo.outputPath('inicio-360.png') });
  await page.getByRole('button', { name: 'Abrir menú' }).press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Menú' });
  await expect(drawer).toBeVisible();
  await expect(page.locator('.mobile-header .brand-emblem')).toHaveAttribute(
    'src',
    /\/om-erp-favicon\.png$/,
  );
  await expect(
    drawer.getByRole('list', { name: 'Operación' }).getByRole('link', { name: 'Apartados' }),
  ).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Mi cuenta', exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await drawer.getByRole('link', { name: 'Reportes', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reportes', exact: true })).toBeVisible();
  await expect(page.getByText('Ventas netas', { exact: true }).first()).toBeVisible();
  const skip = page.getByRole('link', { name: 'Ir al contenido' });
  await skip.focus();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await withoutOverflow('/reportes');

  await page.goto('/inventario');
  await page.getByRole('link', { name: 'Agregar existencia' }).click();
  await expect(page.getByRole('heading', { name: 'Agregar existencia' })).toBeVisible();
  await choose(page, page.getByLabel('Proveedor', { exact: true }), supplier.name, supplier.name);
  await choose(page, page.getByLabel('Moneda de la compra'), /^COP/);
  await page.getByLabel('1 USD = X COP').fill('4000');
  await choose(page, page.getByLabel('Origen del modelo'), 'Crear modelo');
  await page.getByLabel('Nombre del modelo').fill('Legend móvil ' + user.key);
  await choose(page, page.getByLabel('Origen de la marca'), 'Crear marca');
  await page.getByLabel('Marca', { exact: true }).fill('Marca móvil ' + user.key);
  await page.getByRole('checkbox', { name: '38', exact: true }).check();
  await page.getByRole('checkbox', { name: '39', exact: true }).check();
  await page.getByLabel('Cantidad común').fill('2');
  await page.getByLabel('Costo unitario común').fill('80000');
  await page.getByLabel('Precio común en USD').fill('45');
  await page.getByRole('button', { name: 'Aplicar a marcadas' }).click();
  await page.getByLabel('Cantidad talla 39').fill('1');
  await expect(page.getByLabel('Cantidad talla 38')).toHaveValue('2');
  await expect(page.getByLabel('Costo unitario talla 39')).toHaveValue('80000');
  await page.getByRole('button', { name: 'Calcular importes' }).click();
  await expect(page.getByText('60,00 USD', { exact: true }).last()).toBeVisible();
  await page.getByLabel('Cantidad talla 38').scrollIntoViewIfNeeded();
  await withoutOverflow('/inventario/agregar');
  await page.screenshot({ path: testInfo.outputPath('matriz-360.png') });

  await page.getByRole('button', { name: 'Continuar a recepción' }).click();
  await expect(page.getByRole('heading', { name: 'Detalle de compra' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  const reception = page.getByRole('dialog', { name: 'Confirmar recepción' });
  await reception.getByRole('button', { name: 'Confirmar recepción' }).click();
  await expect(reception).not.toBeVisible();
  await expect(page.getByText('Confirmada', { exact: true })).toBeVisible();
  await page.goto('/inventario');
  await page.getByRole('textbox', { name: 'Buscar por SKU, marca o modelo' }).fill(user.key);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const stockTable = page.getByRole('region', { name: 'Existencias por talla' });
  await expect(stockTable.getByRole('columnheader')).toHaveText([
    'Producto',
    'Talla',
    'Disponibles',
    'Precio',
  ]);
  await expect
    .poll(() => stockTable.evaluate((region) => region.scrollWidth - region.clientWidth))
    .toBeLessThanOrEqual(1);
  const received = page.getByRole('row').filter({ hasText: 'Legend móvil ' + user.key });
  await expect(received).toHaveCount(2);
  for (const [size, quantity] of [
    ['38', '2'],
    ['39', '1'],
  ] as const) {
    const row = received.filter({ has: page.getByRole('cell', { name: size, exact: true }) });
    await expect(row.getByRole('cell').nth(2)).toHaveText(quantity);
  }
  await page.screenshot({ path: testInfo.outputPath('existencias-360.png') });
  await received.getByRole('button', { name: /Ver detalle de .*talla 38/ }).click();
  const stockDetails = page.getByRole('dialog', { name: 'Detalle de existencias' });
  await expect(stockDetails.getByText('Pares en tienda')).toBeVisible();
  await expect(stockDetails.locator('dd').first()).toHaveText('2');
  await expect(stockDetails.getByText('Costo FIFO por par')).toBeVisible();
  await stockDetails.getByRole('button', { name: 'Ver movimientos' }).click();
  const movements = page.getByRole('dialog', { name: 'Movimientos de stock' });
  await expect(movements.getByText('Recepción · +2')).toBeVisible();

  for (const [route, title] of [
    ['/inventario', 'Existencias'],
    ['/ventas/pos', 'Punto de venta'],
    ['/apartados/nuevo', 'Nuevo apartado'],
    ['/finanzas/diario', 'Reporte diario'],
    ['/catalogo', 'Catálogo PDF'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await withoutOverflow(route);
  }

  await page.goto('/apartados');
  const filters = page.getByRole('search', { name: 'Filtrar apartados' });
  const search = filters.getByRole('searchbox', { name: 'Número, cliente, modelo o SKU' });
  const status = filters.getByRole('combobox', { name: 'Estado' });
  const overdue = filters.getByRole('checkbox', { name: 'Vencidos sin cerrar' });
  await search.fill('QA');
  await status.selectOption('PAID');
  await overdue.focus();
  await overdue.press('Space');
  await expect(overdue).toBeChecked();
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/layaways' &&
      url.searchParams.get('q') === 'QA' &&
      url.searchParams.get('status') === 'PAID' &&
      url.searchParams.get('overdue') === 'true'
    );
  });
  await filters.getByRole('button', { name: 'Filtrar' }).click();
  expect((await filtered).ok()).toBe(true);
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const statusBox = (await status.boundingBox())!;
    const checkboxBox = (await filters.locator('.activity-check').boundingBox())!;
    expect(
      checkboxBox.x >= statusBox.x + statusBox.width ||
        checkboxBox.y >= statusBox.y + statusBox.height,
    ).toBe(true);
    await withoutOverflow('/apartados');
    await page.screenshot({ path: testInfo.outputPath(`apartados-${width}.png`) });
  }
});
