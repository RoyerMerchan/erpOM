import { expect, test } from '@playwright/test';
import { staff } from './support';

test('el acceso oscuro funciona en escritorio y móvil', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const logo = page.getByRole('img', { name: 'OM Store' });
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.locator('.login-shell')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('.login-frame')).toHaveCSS('border-radius', '28px');
  const title = page.getByText('Controla tu negocio con claridad');
  await expect(title).toBeVisible();
  const username = page.getByRole('textbox', { name: 'Usuario', exact: true });
  const password = page.getByLabel('Clave de acceso', { exact: true });
  const access = page.getByRole('button', { name: 'Acceder al sistema' });
  await expect(username).toHaveCSS('height', '56px');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await page.screenshot({ path: testInfo.outputPath('login-escritorio.png') });

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(title).toBeHidden();
  await expect(logo).toBeVisible();
  expect(
    await page.locator('html').evaluate((html) => html.scrollWidth - html.clientWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('login-movil.png'), fullPage: true });

  await page.setViewportSize({ width: 360, height: 430 });
  await access.press('Enter');
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute('aria-invalid', 'true');
  await expect(username).toHaveAccessibleDescription(/usuario/i);

  const user = await staff('ADMIN');
  await username.fill(user.username);
  await password.fill('clave-incorrecta');
  let releaseLogin!: () => void;
  const loginGate = new Promise<void>((resolve) => (releaseLogin = resolve));
  await page.route(
    '**/api/v1/auth/login',
    async (route) => {
      await loginGate;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await password.press('Enter');
    const loading = page.getByRole('button', { name: 'Verificando credenciales...' });
    await expect(loading).toBeDisabled();
    await expect(loading.locator('.pi-spinner')).toBeVisible();
  } finally {
    releaseLogin();
  }
  await expect(page.getByRole('alert')).toContainText('no son correctos');
  await expect(access).toBeEnabled();

  await password.fill(user.password);
  await page.getByRole('button', { name: 'Mostrar contraseña' }).press('Space');
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  await password.press('Enter');
  await expect(page.getByRole('heading', { name: 'Panel de operaciones' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page
    .getByRole('dialog', { name: 'Menú' })
    .getByRole('button', { name: 'Cerrar sesión' })
    .click();
  await expect(username).toHaveValue('');
  await expect(password).toHaveValue('');
});
