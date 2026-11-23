import { currencyCodeSchema } from '@max-sport/shared';
import type {
  FinanceEntry,
  FinanceEntryConfirmation,
  FinanceEntryInput,
  FinanceEntryPreview,
  FinanceReversalInput,
  SessionUser,
} from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import type { FinanceLine, Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { postTenderMovement, quoteTenders } from '../money/tender.js';
import { decimal } from '../purchasing/money.js';
import { captureRate } from '../purchasing/rates.js';
import { digest, operation } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';

const missing = () =>
  new HttpError(404, 'FINANCE_ENTRY_NOT_FOUND', 'No se encontró el registro financiero.');
type DraftLine = FinanceEntryPreview['lines'][number];
type StoredLine = Pick<
  FinanceLine,
  | 'direction'
  | 'accountId'
  | 'accountName'
  | 'currencyCode'
  | 'exchangeRateId'
  | 'unitsPerUsd'
  | 'amountOriginal'
  | 'amountUsd'
>;

function authorize(input: FinanceEntryInput, actor: SessionUser) {
  const permission = input.kind === 'ADJUSTMENT' ? 'finance.adjust' : 'finance.post';
  if (!actor.permissions.includes(permission)) {
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite registrar esta operación.');
  }
}

async function prepare(tx: Transaction, input: FinanceEntryInput, actor: SessionUser) {
  authorize(input, actor);
  const category =
    input.kind === 'EXPENSE'
      ? await tx.financeCategory.findFirst({
          where: { id: input.categoryId, active: true },
          select: { id: true, name: true },
        })
      : null;
  if (input.kind === 'EXPENSE' && !category) {
    throw new HttpError(409, 'CATEGORY_INACTIVE', 'Selecciona una categoría de gasto activa.');
  }
  const quoted = await quoteTenders(
    tx,
    input.kind === 'TRANSFER'
      ? [
          { kind: 'OUT' as const, input: { ...input.source, reference: null } },
          { kind: 'IN' as const, input: { ...input.destination, reference: null } },
        ]
      : [
          {
            kind:
              input.kind === 'OTHER_INCOME'
                ? ('IN' as const)
                : input.kind === 'ADJUSTMENT'
                  ? input.direction
                  : ('OUT' as const),
            input: { ...input.payment, reference: null },
          },
        ],
  );
  const lines: DraftLine[] = quoted.map((line) => ({
    direction: line.kind,
    accountId: line.accountId,
    accountName: line.accountName,
    currencyCode: currencyCodeSchema.parse(line.currencyCode),
    amountOriginal: line.amountOriginal,
    unitsPerUsd: line.unitsPerUsd,
    amountUsd: line.amountUsd,
  }));
  const source = lines[0];
  const destination = lines[1];
  let differenceUsd: string | null = null;
  if (source && destination) {
    if (
      source.currencyCode === destination.currencyCode &&
      (source.amountOriginal !== destination.amountOriginal ||
        source.unitsPerUsd !== destination.unitsPerUsd)
    ) {
      throw new HttpError(
        400,
        'TRANSFER_AMOUNT',
        'Entre cuentas de la misma moneda usa el mismo importe y la misma tasa.',
      );
    }
    differenceUsd = decimal(destination.amountUsd).sub(source.amountUsd).toFixed(2);
  }
  const quote: FinanceEntryPreview = {
    lines,
    differenceUsd,
    quoteDigest: digest({ input, lines, category, differenceUsd }),
  };
  return { quote, category };
}

export async function previewFinanceEntry(
  tx: Transaction,
  input: FinanceEntryInput,
  actor: SessionUser,
) {
  return (await prepare(tx, input, actor)).quote;
}

async function existingOperation(
  tx: Transaction,
  operationKey: string,
  hash: string,
  actorId: string,
) {
  const found = await tx.financeEntry.findUnique({
    where: { operationKey },
    select: { id: true, actorId: true, operationDigest: true },
  });
  if (!found) return null;
  if (found.actorId !== actorId || found.operationDigest !== hash) {
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de operación ya se usó con otros datos.',
    );
  }
  return found.id;
}

async function post(
  tx: Transaction,
  entry: Prisma.FinanceEntryUncheckedCreateInput,
  lines: ((DraftLine & { exchangeRateId?: string | null }) | StoredLine)[],
) {
  const saved = await tx.financeEntry.create({
    data: entry,
    select: { id: true, number: true, occurredAt: true },
  });
  for (const [position, source] of lines.entries()) {
    const exchangeRateId =
      source.exchangeRateId !== undefined
        ? source.exchangeRateId
        : await captureRate(
            tx,
            source.currencyCode,
            source.unitsPerUsd.toString(),
            saved.occurredAt,
            entry.actorId,
          );
    const line = await tx.financeLine.create({
      data: { ...source, position, entryId: saved.id, exchangeRateId },
    });
    await postTenderMovement(
      tx,
      line,
      {
        kind: line.direction === 'IN' ? 'FINANCE_IN' : 'FINANCE_OUT',
        financeLineId: line.id,
      },
      entry.actorId,
      saved.occurredAt,
    );
  }
  await writeAudit(tx, entry.actorId, {
    action: entry.reversesId ? 'finance.reverse' : 'finance.post',
    entity: 'FinanceEntry',
    entityId: saved.id,
    after: {
      number: saved.number.toString(),
      kind: entry.kind,
      reversesId: entry.reversesId ?? null,
      lineCount: lines.length,
    },
  });
  return saved.id;
}

export function confirmFinanceEntry(
  db: Database,
  input: FinanceEntryConfirmation,
  actor: SessionUser,
) {
  authorize(input.entry, actor);
  const hash = digest({ action: 'post', ...input });
  return operation(db, async (tx) => {
    const stored = await existingOperation(tx, input.operationId, hash, actor.id);
    if (stored) return stored;
    const { quote, category } = await prepare(tx, input.entry, actor);
    if (quote.quoteDigest !== input.quoteDigest) {
      throw new HttpError(
        409,
        'QUOTE_CHANGED',
        'Los datos del movimiento cambiaron. Calcula la vista previa de nuevo.',
      );
    }
    return post(
      tx,
      {
        operationKey: input.operationId,
        operationDigest: hash,
        actorId: actor.id,
        actorName: actor.displayName,
        kind: input.entry.kind,
        description: input.entry.description,
        reference: input.entry.reference,
        occurredAt: new Date(input.entry.occurredAt),
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        differenceUsd: quote.differenceUsd,
      },
      quote.lines,
    );
  });
}

const entryInclude = {
  lines: { orderBy: { position: 'asc' } },
  reversal: { select: { id: true } },
} satisfies Prisma.FinanceEntryInclude;

export function reverseFinanceEntry(
  db: Database,
  id: string,
  input: FinanceReversalInput,
  actor: SessionUser,
) {
  const hash = digest({ action: 'reverse', id, ...input });
  return operation(db, async (tx) => {
    const stored = await existingOperation(tx, input.operationId, hash, actor.id);
    if (stored) return stored;
    await tx.$queryRaw`SELECT id FROM finance_entries WHERE id = ${id}::uuid FOR UPDATE`;
    const original = await tx.financeEntry.findUnique({ where: { id }, include: entryInclude });
    if (!original) throw missing();
    if (original.kind === 'ADJUSTMENT' && !actor.permissions.includes('finance.adjust')) {
      throw new HttpError(
        403,
        'PERMISSION_DENIED',
        'Tu rol no permite revertir un ajuste de saldo.',
      );
    }
    if (original.reversesId || original.reversal) {
      throw new HttpError(
        409,
        'FINANCE_ALREADY_REVERSED',
        'El registro ya tiene un reverso o es una rectificación.',
      );
    }
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (occurredAt < original.occurredAt) {
      throw new HttpError(
        400,
        'REVERSAL_DATE',
        'La fecha de reverso debe ser igual o posterior a la del registro original.',
      );
    }
    const lines: StoredLine[] = original.lines.map((line) => ({
      direction: line.direction === 'IN' ? 'OUT' : 'IN',
      accountId: line.accountId,
      accountName: line.accountName,
      currencyCode: line.currencyCode,
      unitsPerUsd: line.unitsPerUsd,
      exchangeRateId: line.exchangeRateId,
      amountOriginal: line.amountOriginal,
      amountUsd: line.amountUsd,
    }));
    return post(
      tx,
      {
        operationKey: input.operationId,
        operationDigest: hash,
        occurredAt,
        actorId: actor.id,
        actorName: actor.displayName,
        kind: original.kind,
        description: input.reason,
        reference: original.reference,
        categoryId: original.categoryId,
        categoryName: original.categoryName,
        reversesId: original.id,
        differenceUsd: original.differenceUsd?.neg() ?? null,
      },
      lines,
    );
  });
}

export async function financeEntry(db: Database, id: string): Promise<FinanceEntry> {
  const entry = await db.financeEntry.findUnique({ where: { id }, include: entryInclude });
  if (!entry) throw missing();
  return {
    id,
    number: 'F-' + entry.number.toString().padStart(6, '0'),
    kind: entry.kind,
    actorName: entry.actorName,
    occurredAt: entry.occurredAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    reference: entry.reference,
    description: entry.description,
    categoryName: entry.categoryName,
    differenceUsd: entry.differenceUsd?.toFixed(2) ?? null,
    reversesId: entry.reversesId,
    reversalId: entry.reversal?.id ?? null,
    lines: entry.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      accountName: line.accountName,
      direction: line.direction,
      currencyCode: currencyCodeSchema.parse(line.currencyCode),
      exchangeRateId: line.exchangeRateId,
      amountOriginal: line.amountOriginal.toFixed(),
      amountUsd: line.amountUsd.toFixed(2),
      unitsPerUsd: line.unitsPerUsd.toFixed(),
    })),
  };
}
