import type { SaleTenderInput } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { cents, requiredRate, scaledAmount } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';

export async function quoteTenders<Kind extends string>(
  tx: Transaction,
  entries: { kind: Kind; input: SaleTenderInput }[],
) {
  if (!entries.length) return [];
  const ids = [...new Set(entries.map(({ input }) => input.accountId))];
  const accounts = await tx.moneyAccount.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      active: true,
      name: true,
      kind: true,
      currencyCode: true,
      currency: { select: { active: true, minorUnits: true } },
    },
  });
  const byId = new Map(accounts.map((item) => [item.id, item]));
  return entries.map(({ kind, input }) => {
    const account = byId.get(input.accountId);
    if (!account?.active || !account.currency.active) {
      throw new HttpError(409, 'ACCOUNT_INACTIVE', 'Selecciona una cuenta y moneda habilitadas.');
    }
    if (kind === 'CHANGE' && account.kind !== 'CASH') {
      throw new HttpError(
        400,
        'CHANGE_ACCOUNT',
        'Selecciona una caja de efectivo para entregar el vuelto.',
      );
    }
    const unitsPerUsd = requiredRate(account.currencyCode, input.unitsPerUsd);
    const original = scaledAmount(input.amountOriginal, account.currency.minorUnits, 'El importe');
    const usd = cents(original.div(unitsPerUsd));
    if (usd.lte(0))
      throw new HttpError(
        400,
        'PAYMENT_ROUNDING',
        'El importe se redondea a menos de un centavo USD.',
      );
    return {
      kind,
      accountId: account.id,
      accountName: account.name,
      currencyCode: account.currencyCode,
      amountOriginal: original.toFixed(),
      unitsPerUsd,
      amountUsd: usd.toFixed(2),
      reference: input.reference,
    };
  });
}

type MoneyFigure = Prisma.Decimal | string;
type MovementSource =
  | { kind: 'SALE_PAYMENT' | 'SALE_CHANGE'; saleTenderId: string }
  | { kind: 'LAYAWAY_DEPOSIT' | 'LAYAWAY_REFUND'; layawayPaymentId: string }
  | { kind: 'EXCHANGE_PAYMENT' | 'SALE_REFUND'; correctionTenderId: string }
  | { kind: 'FINANCE_IN' | 'FINANCE_OUT'; financeLineId: string };

export function postTenderMovement(
  tx: Transaction,
  {
    accountId,
    currencyCode,
    amountOriginal,
    unitsPerUsd,
    amountUsd,
  }: {
    accountId: string;
    currencyCode: string;
    amountOriginal: MoneyFigure;
    unitsPerUsd: MoneyFigure;
    amountUsd: MoneyFigure;
  },
  source: MovementSource,
  actorId: string,
  occurredAt: Date,
) {
  return tx.moneyMovement.create({
    data: {
      ...source,
      accountId,
      currencyCode,
      amountOriginal,
      unitsPerUsd,
      amountUsd,
      actorId,
      occurredAt,
    },
  });
}
