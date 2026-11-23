import type { CorrectionInput, CorrectionPreview, SessionUser } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { quoteTenders } from '../money/tender.js';
import { decimal } from '../purchasing/money.js';
import { digest } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import { fullPriceLine } from '../sales/post.js';
import { quoteProducts } from '../sales/products.js';
import { saleScope } from '../sales/read.js';
import { refundableSlice, restockedLots } from './amounts.js';

const originalInclude = {
  items: {
    include: {
      corrections: { select: { quantity: true } },
      movement: {
        select: {
          allocations: {
            orderBy: [{ lot: { receivedAt: 'asc' } }, { lotId: 'asc' }],
            select: { lotId: true, quantity: true, costUsd: true },
          },
        },
      },
    },
  },
} satisfies Prisma.SaleInclude;
type Original = Prisma.SaleGetPayload<{ include: typeof originalInclude }>;

export async function originalSale(tx: Transaction, saleId: string, actor: SessionUser) {
  const row = await tx.sale.findFirst({
    where: { id: saleId, ...saleScope(actor) },
    include: originalInclude,
  });
  if (!row) throw new HttpError(404, 'SALE_NOT_FOUND', 'No se encontró la venta original.');
  return row;
}

function returnedLines(input: CorrectionInput, original: Original) {
  const items = new Map(original.items.map((line) => [line.id, line]));
  const previous = new Map(
    original.items.map((line) => [
      line.id,
      line.corrections.reduce((total, entry) => total + entry.quantity, 0),
    ]),
  );
  return input.items.map(({ saleItemId, condition, quantity }) => {
    const line = items.get(saleItemId);
    if (!line) throw new HttpError(400, 'RETURN_LINE', 'Selecciona líneas de la venta original.');
    const offset = previous.get(saleItemId) ?? 0;
    if (offset + quantity > line.quantity) {
      throw new HttpError(
        409,
        'RETURN_LIMIT',
        'La cantidad supera los pares aún devolubles de ' + line.sku + '.',
      );
    }
    previous.set(saleItemId, offset + quantity);
    const credit = refundableSlice(line.netUsd, line.quantity, offset, quantity);
    const lots =
      condition === 'SELLABLE'
        ? restockedLots(line.movement?.allocations ?? [], offset, quantity)
        : [];
    return {
      variantId: line.variantId,
      lots,
      restoredCogsUsd: lots.reduce((sum, lot) => sum.add(lot.costUsd), decimal(0)).toFixed(2),
      publicLine: {
        saleItemId,
        condition,
        quantity,
        sku: line.sku,
        modelName: line.modelName,
        size: line.size,
        creditUsd: credit.toFixed(2),
      },
    };
  });
}

export async function prepareCorrection(
  tx: Transaction,
  input: CorrectionInput,
  original: Original,
) {
  const lines = returnedLines(input, original);
  const products = await quoteProducts(tx, input.replacement);
  const tenders = await quoteTenders(tx, [
    ...input.payments.map((input) => ({ kind: 'PAYMENT' as const, input })),
    ...input.refunds.map((input) => ({ kind: 'REFUND' as const, input })),
  ]);
  const replacement = products.map(({ product }) => fullPriceLine(product));
  const returned = lines.reduce((sum, line) => sum.add(line.publicLine.creditUsd), decimal(0));
  const restoredCogsUsd = lines
    .reduce((sum, line) => sum.add(line.restoredCogsUsd), decimal(0))
    .toFixed(2);
  const replacementTotal = replacement.reduce((sum, line) => sum.add(line.netUsd), decimal(0));
  const difference = replacementTotal.sub(returned);
  const collected = tenders.reduce(
    (sum, tender) => (tender.kind === 'PAYMENT' ? sum.add(tender.amountUsd) : sum),
    decimal(0),
  );
  const refunded = tenders.reduce(
    (sum, tender) => (tender.kind === 'REFUND' ? sum.add(tender.amountUsd) : sum),
    decimal(0),
  );
  const items = lines.map(({ publicLine }) => publicLine);
  const ready = difference.gte(0)
    ? collected.eq(difference) && refunded.isZero()
    : refunded.eq(difference.abs()) && collected.isZero();
  const quote: CorrectionPreview = {
    items,
    tenders,
    ready,
    differenceUsd: difference.toFixed(2),
    returnedUsd: returned.toFixed(2),
    replacementTotalUsd: replacementTotal.toFixed(2),
    collectedUsd: collected.toFixed(2),
    refundedUsd: refunded.toFixed(2),
    quoteDigest: digest({ input, items, tenders, replacement }),
  };
  return { quote, restoredCogsUsd, lines, replacement };
}

export async function previewCorrection(
  tx: Transaction,
  input: CorrectionInput,
  actor: SessionUser,
) {
  const { quote, restoredCogsUsd, lines } = await prepareCorrection(
    tx,
    input,
    await originalSale(tx, input.saleId, actor),
  );
  if (!actor.permissions.includes('costs.read')) return quote;
  return {
    ...quote,
    restoredCogsUsd,
    items: lines.map(({ publicLine, restoredCogsUsd }) => ({ ...publicLine, restoredCogsUsd })),
  };
}
