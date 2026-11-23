import { accountInput } from '@max-sport/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { buildPage, filterActive, insensitive, pageArgs } from './catalog.js';
import type { CatalogDefinition } from './catalog.js';

const select = {
  id: true,
  active: true,
  name: true,
  currencyCode: true,
  kind: true,
} satisfies Prisma.MoneyAccountSelect;
type Account = Prisma.MoneyAccountGetPayload<{ select: typeof select }>;

export async function requireActiveCurrency(database: Prisma.TransactionClient, code: string) {
  const currency = await database.currency.findUnique({
    where: { code },
    select: { active: true, minorUnits: true },
  });
  if (!currency?.active)
    throw new HttpError(409, 'CURRENCY_INACTIVE', 'Habilita esa moneda antes de usarla.');
  return currency;
}

export const accounts: CatalogDefinition<z.output<typeof accountInput>, Account> = {
  entity: 'MoneyAccount',
  schema: accountInput,
  list(db, query) {
    const where = {
      ...filterActive(query.status),
      ...(query.q ? { name: insensitive(query.q) } : {}),
      ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
    };
    return buildPage(
      db.moneyAccount.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select,
      }),
      db.moneyAccount.count({ where }),
    );
  },
  find: (db, id) => db.moneyAccount.findUnique({ where: { id }, select }),
  async create(db, input) {
    await requireActiveCurrency(db, input.currencyCode);
    return db.moneyAccount.create({ data: input, select });
  },
  async update(db, id, input) {
    const previous = await db.moneyAccount.findUniqueOrThrow({
      where: { id },
      select: { currencyCode: true },
    });
    if (previous.currencyCode !== input.currencyCode) {
      const posted = await db.moneyMovement.findFirst({
        where: { accountId: id },
        select: { id: true },
      });
      if (posted) {
        throw new HttpError(
          409,
          'ACCOUNT_CURRENCY_LOCKED',
          'La cuenta ya tiene movimientos. Crea otra cuenta para la nueva moneda.',
        );
      }
      await requireActiveCurrency(db, input.currencyCode);
    }
    return db.moneyAccount.update({ where: { id }, data: input, select });
  },
  async setActive(db, id, active) {
    if (active) {
      const account = await db.moneyAccount.findUniqueOrThrow({
        where: { id },
        select: { currencyCode: true },
      });
      await requireActiveCurrency(db, account.currencyCode);
    }
    return db.moneyAccount.update({ where: { id }, data: { active }, select });
  },
  audit: ({ name, currencyCode, kind, active }) => ({ name, currencyCode, kind, active }),
};
