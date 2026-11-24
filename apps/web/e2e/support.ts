import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { APIRequestContext, APIResponse, Locator, Page, Response } from '@playwright/test';
import { contactRecord } from '@max-sport/shared';
import type { ZodType } from 'zod';
import { hashPassword } from '../../api/dist/auth/password.js';
import { createDatabase } from '../../api/src/database.js';

const root = '/api/v1';
const origin = { Origin: 'http://localhost:4173' };

export async function staff(role: 'ADMIN' | 'SELLER') {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_e2e'))
    throw new Error('Falta una base dedicada para las pruebas E2E.');
  const db = createDatabase(databaseUrl);
  const key = randomUUID().slice(0, 12);
  const username = 'qa-' + key;
  const password = 'qa-' + randomUUID();
  try {
    const user = await db.user.create({
      data: {
        username,
        email: username + '@example.test',
        displayName: 'Operador QA ' + key,
        passwordHash: await hashPassword(password),
        role: { connect: { code: role } },
      },
      select: { id: true },
    });
    return { username, password, key, id: user.id };
  } finally {
    await db.$disconnect();
  }
}

export async function login(page: Page, user: Awaited<ReturnType<typeof staff>>) {
  await page.goto('/login');
  await expect(page.locator('.login-brand .brand-mark')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.login-statement')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByLabel('Usuario', { exact: true }).fill(user.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Panel de operaciones' })).toBeVisible();
}

export async function choose(page: Page, field: Locator, option: string | RegExp, search?: string) {
  await field.click();
  const choice = page.getByRole('option', { name: option });
  if (search && !(await choice.isVisible())) await page.getByRole('searchbox').fill(search);
  await choice.click();
}

export async function parse<T>(response: APIResponse | Response, schema: ZodType<T>, status = 200) {
  const body = await response.json();
  const path = new URL(response.url()).pathname;
  expect(response.status(), `${path} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`).toBe(
    status,
  );
  return schema.parse(body);
}

export function read<T>(
  request: APIRequestContext,
  path: string,
  schema: ZodType<T>,
  params?: Record<string, string>,
) {
  return request.get(root + path, { params }).then((response) => parse(response, schema));
}

export function post(request: APIRequestContext, path: string, data: object) {
  return request.post(root + path, { headers: origin, data });
}

export function create<T>(
  request: APIRequestContext,
  path: string,
  data: object,
  schema: ZodType<T>,
  status = 201,
) {
  return post(request, path, data).then((response) => parse(response, schema, status));
}

export function createContact(
  request: APIRequestContext,
  path: '/customers' | '/suppliers',
  name: string,
) {
  return create(
    request,
    path,
    { name, document: null, phone: null, email: null, address: null, notes: null },
    contactRecord,
  );
}

export const responseAt = (page: Page, path: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === root + path && response.request().method() === 'POST',
  );
