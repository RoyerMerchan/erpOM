import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, staff } from './support';

test('el superusuario puede cambiar su contraseña y restablecer la de otra cuenta', async ({
  page,
}) => {
  const operator = await staff('SUPERUSER');
  const seller = await staff('SELLER');
  const replacement = 'qa-' + randomUUID();
  await login(page, operator);
  await page.goto('/usuarios');

  const search = page.getByRole('textbox', { name: 'Buscar por nombre, usuario, correo o rol' });
  const editor = page.getByRole('dialog', { name: 'Editar registro' });
  const editUser = async (username: string) => {
    await search.fill(username);
    await search.press('Enter');
    const row = page.getByRole('row').filter({ has: page.getByText(username, { exact: true }) });
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    return row;
  };

  const sellerRow = await editUser(seller.username);
  await expect(editor.getByRole('button', { name: 'Cambiar mi contraseña' })).toHaveCount(0);
  const temporary = editor.getByLabel('Nueva contraseña temporal');
  await expect(temporary).toHaveValue('');
  await temporary.fill('qa-' + randomUUID());
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(sellerRow).toContainText('Cambio de contraseña pendiente', { timeout: 12_000 });

  await editUser(operator.username);
  await expect(editor.getByLabel('Nueva contraseña temporal')).toHaveCount(0);
  const change = editor.getByRole('button', { name: 'Cambiar mi contraseña' });
  await change.click();
  const passwordEditor = page.getByRole('dialog', { name: 'Cambiar mi contraseña' });
  const current = passwordEditor.getByLabel('Contraseña actual', { exact: true });
  await expect(current).toBeFocused();
  await current.fill(operator.password);
  await passwordEditor.getByRole('button', { name: 'Volver a editar' }).click();
  await expect(change).toBeFocused();
  await change.press('Enter');
  await expect(current).toHaveValue('');
  await current.fill(operator.password);
  await passwordEditor.getByLabel('Contraseña nueva', { exact: true }).fill(replacement);
  const confirmation = passwordEditor.getByLabel('Repetir contraseña nueva', { exact: true });
  await confirmation.fill('confirmacion-distinta');
  const submit = passwordEditor.getByRole('button', { name: 'Cambiar contraseña', exact: true });
  await submit.click();
  await expect(passwordEditor.getByText('Las contraseñas no coinciden.')).toBeVisible();
  await confirmation.fill(replacement);
  await submit.click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  await login(page, { ...operator, password: replacement });
});
