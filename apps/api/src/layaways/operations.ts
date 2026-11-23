import { randomUUID } from 'node:crypto';
import type {
  CloseLayawayInput,
  CreateLayawayInput,
  DepositLayawayInput,
  SessionUser,
} from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import type { Layaway, LayawayActionKind, LayawayItem } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { lockVariants } from '../inventory/stock.js';
import { postTenderMovement, quoteTenders } from '../money/tender.js';
import { decimal } from '../purchasing/money.js';
import { captureRate } from '../purchasing/rates.js';
import { digest, operation } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import { fullPriceLine, postSale } from '../sales/post.js';
import { quoteProducts } from '../sales/products.js';
import { holdsStock, layawayMissing, layawayScope } from './read.js';

type Event = {
  id: string;
  kind: LayawayActionKind;
  fingerprint: string;
  occurredAt: Date;
  actor: SessionUser;
};
type Deposit = Awaited<ReturnType<typeof quoteTenders<'DEPOSIT'>>>[number];

function applyAction(
  db: Database,
  actor: SessionUser,
  kind: LayawayActionKind,
  operationId: string,
  request: unknown,
  execute: (tx: Transaction, event: Event) => Promise<string>,
) {
  const fingerprint = digest({ kind, request });
  return operation(db, async (tx) => {
    const stored = await tx.layawayAction.findUnique({ where: { id: operationId } });
    if (stored) {
      if (stored.actorId === actor.id && stored.fingerprint === fingerprint)
        return stored.layawayId;
      throw new HttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'La clave de operación ya se usó con otros datos.',
      );
    }
    return execute(tx, { id: operationId, kind, fingerprint, occurredAt: new Date(), actor });
  });
}

async function writeAction(
  tx: Transaction,
  event: Event,
  layawayId: string,
  reason: string | null = null,
) {
  await tx.layawayAction.create({
    data: {
      id: event.id,
      layawayId,
      kind: event.kind,
      fingerprint: event.fingerprint,
      occurredAt: event.occurredAt,
      actorId: event.actor.id,
      actorName: event.actor.displayName,
      reason,
    },
  });
  await writeAudit(tx, event.actor.id, {
    action: 'layaways.' + event.kind.toLowerCase(),
    entity: 'Layaway',
    entityId: layawayId,
    after: { actionId: event.id, reasonProvided: !!reason },
  });
}

async function lockedLayaway(tx: Transaction, id: string, actor: SessionUser) {
  await tx.$queryRaw`SELECT id FROM layaways WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.layaway.findFirst({
    where: { id, ...layawayScope(actor) },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!row) throw layawayMissing();
  return row;
}

function checkOpen(row: Layaway, at: Date, closing = false) {
  if (!holdsStock(row.status))
    throw new HttpError(409, 'LAYAWAY_CLOSED', 'El apartado ya fue cerrado.');
  if (!closing && row.expiresAt && row.expiresAt <= at)
    throw new HttpError(409, 'LAYAWAY_OVERDUE', 'El apartado está vencido. Solicita su cierre.');
}

async function reserve(
  tx: Transaction,
  item: Pick<LayawayItem, 'id' | 'variantId' | 'quantity'>,
  event: Event,
  release: boolean,
) {
  const inventory = await tx.inventoryBalance.findUnique({ where: { variantId: item.variantId } });
  const reservedDelta = release ? -item.quantity : item.quantity;
  const reserved = (inventory?.reserved ?? 0) + reservedDelta;
  if (!inventory || reserved < 0 || reserved > inventory.physical)
    throw new HttpError(
      409,
      'INSUFFICIENT_STOCK',
      'La reserva excede las existencias de la talla.',
    );
  await tx.inventoryBalance.update({ where: { variantId: item.variantId }, data: { reserved } });
  await tx.stockMovement.create({
    data: {
      variantId: item.variantId,
      layawayItemId: item.id,
      kind: release ? 'RELEASE_RESERVATION' : 'RESERVE',
      quantityDelta: 0,
      reservedDelta,
      actorId: event.actor.id,
      occurredAt: event.occurredAt,
    },
  });
}

async function postDeposits(tx: Transaction, event: Event, tenders: Deposit[]) {
  for (const [position, tender] of tenders.entries()) {
    const exchangeRateId = await captureRate(
      tx,
      tender.currencyCode,
      tender.unitsPerUsd,
      event.occurredAt,
      event.actor.id,
    );
    const payment = await tx.layawayPayment.create({
      data: { ...tender, actionId: event.id, position, exchangeRateId },
      select: { id: true },
    });
    await postTenderMovement(
      tx,
      tender,
      { kind: 'LAYAWAY_DEPOSIT', layawayPaymentId: payment.id },
      event.actor.id,
      event.occurredAt,
    );
  }
}

function acceptedTotal(paid: Layaway['paidUsd'], tenders: Deposit[], total: Layaway['totalUsd']) {
  const next = tenders.reduce((sum, tender) => sum.add(tender.amountUsd), paid);
  if (next.gt(total))
    throw new HttpError(409, 'LAYAWAY_OVERPAYMENT', 'El abono supera el saldo del apartado.');
  return {
    paidUsd: next.toFixed(2),
    status: next.eq(total) ? ('PAID' as const) : ('ACTIVE' as const),
  };
}

const depositQuotes = (tx: Transaction, entries: CreateLayawayInput['payments']) =>
  quoteTenders(
    tx,
    entries.map((input) => ({ kind: 'DEPOSIT' as const, input })),
  );

export function createLayaway(db: Database, input: CreateLayawayInput, actor: SessionUser) {
  return applyAction(db, actor, 'CREATE', input.operationId, input, async (tx, event) => {
    const { items, expiresAt: expires, notes } = input;
    const expiresAt = expires ? new Date(expires) : null;
    if (expiresAt && expiresAt <= event.occurredAt)
      throw new HttpError(
        400,
        'LAYAWAY_EXPIRY',
        'El vencimiento debe ser posterior a la creación.',
      );
    await lockVariants(
      tx,
      items.map(({ variantId }) => variantId),
    );
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, active: true },
      select: { id: true, name: true },
    });
    if (!customer)
      throw new HttpError(
        409,
        'CUSTOMER_INACTIVE',
        'Selecciona un cliente activo para el apartado.',
      );
    const shop = await tx.shopSettings.findUniqueOrThrow({
      where: { id: 1 },
      select: { layawayRefundPolicy: true },
    });
    const products = await quoteProducts(tx, items);
    const tenders = await depositQuotes(tx, input.payments);
    const totalUsd = products.reduce(
      (sum, { product }) => sum.add(decimal(product.unitPriceUsd).mul(product.quantity)),
      decimal(0),
    );
    const balance = acceptedTotal(decimal(0), tenders, totalUsd);
    const row = await tx.layaway.create({
      data: {
        ...balance,
        totalUsd,
        notes,
        expiresAt,
        createdAt: event.occurredAt,
        refundPolicy: shop.layawayRefundPolicy,
        sellerId: actor.id,
        sellerName: actor.displayName,
        customerId: customer.id,
        customerName: customer.name,
      },
      select: { id: true },
    });
    for (const [position, { product }] of products.entries()) {
      const item = await tx.layawayItem.create({
        data: {
          ...product,
          position,
          layawayId: row.id,
          totalUsd: decimal(product.unitPriceUsd).mul(product.quantity).toFixed(2),
        },
      });
      await reserve(tx, item, event, false);
    }
    await writeAction(tx, event, row.id);
    await postDeposits(tx, event, tenders);
    return row.id;
  });
}

export function depositLayaway(
  db: Database,
  id: string,
  input: DepositLayawayInput,
  actor: SessionUser,
) {
  return applyAction(db, actor, 'PAY', input.operationId, { id, input }, async (tx, event) => {
    const row = await lockedLayaway(tx, id, actor);
    checkOpen(row, event.occurredAt);
    const tenders = await depositQuotes(tx, input.payments);
    const balance = acceptedTotal(row.paidUsd, tenders, row.totalUsd);
    await tx.layaway.update({ where: { id }, data: balance });
    await writeAction(tx, event, id);
    await postDeposits(tx, event, tenders);
    return id;
  });
}

export function deliverLayaway(db: Database, id: string, operationId: string, actor: SessionUser) {
  return applyAction(db, actor, 'DELIVER', operationId, { id }, async (tx, event) => {
    const row = await lockedLayaway(tx, id, actor);
    checkOpen(row, event.occurredAt);
    if (row.status !== 'PAID')
      throw new HttpError(409, 'LAYAWAY_PENDING', 'Completa el saldo antes de entregar.');
    await lockVariants(
      tx,
      row.items.map(({ variantId }) => variantId),
    );
    for (const item of row.items) await reserve(tx, item, event, true);
    const shop = await tx.shopSettings.findUniqueOrThrow({
      where: { id: 1 },
      select: { name: true },
    });
    const total = row.totalUsd.toFixed(2);
    await postSale(
      tx,
      {
        layawayId: id,
        customerId: row.customerId,
        customerName: row.customerName,
        shopName: shop.name,
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        actorId: actor.id,
        notes: row.notes,
        operationKey: randomUUID(),
        operationDigest: event.fingerprint,
        confirmedAt: event.occurredAt,
        subtotalUsd: total,
        totalUsd: total,
        discountUsd: '0.00',
      },
      row.items.map(
        ({ variantId, sku, brandName, modelName, size, color, quantity, unitPriceUsd }) =>
          fullPriceLine({
            variantId,
            sku,
            brandName,
            modelName,
            size,
            color,
            quantity,
            unitPriceUsd: unitPriceUsd.toFixed(2),
          }),
      ),
    );
    await tx.layaway.update({
      where: { id },
      data: { status: 'DELIVERED', closedAt: event.occurredAt },
    });
    await writeAction(tx, event, id);
    return id;
  });
}

async function refundDeposits(tx: Transaction, event: Event, layawayId: string) {
  const deposits = await tx.layawayPayment.findMany({
    where: { kind: 'DEPOSIT', action: { layawayId } },
    orderBy: [{ action: { occurredAt: 'asc' } }, { actionId: 'asc' }, { position: 'asc' }],
  });
  for (const [position, deposit] of deposits.entries()) {
    const {
      accountId,
      accountName,
      currencyCode,
      exchangeRateId,
      amountOriginal,
      amountUsd,
      unitsPerUsd,
      reference,
    } = deposit;
    const refund = await tx.layawayPayment.create({
      data: {
        accountId,
        accountName,
        currencyCode,
        exchangeRateId,
        amountOriginal,
        amountUsd,
        unitsPerUsd,
        reference,
        kind: 'REFUND',
        reversedId: deposit.id,
        actionId: event.id,
        position,
      },
      select: { id: true },
    });
    await postTenderMovement(
      tx,
      deposit,
      { kind: 'LAYAWAY_REFUND', layawayPaymentId: refund.id },
      event.actor.id,
      event.occurredAt,
    );
  }
}

export function closeLayaway(
  db: Database,
  id: string,
  input: CloseLayawayInput,
  actor: SessionUser,
  expired: boolean,
) {
  return applyAction(
    db,
    actor,
    expired ? 'EXPIRE' : 'CANCEL',
    input.operationId,
    { id, input },
    async (tx, event) => {
      const row = await lockedLayaway(tx, id, actor);
      checkOpen(row, event.occurredAt, true);
      if (expired && (!row.expiresAt || row.expiresAt > event.occurredAt)) {
        throw new HttpError(409, 'LAYAWAY_NOT_OVERDUE', 'El apartado aún no está vencido.');
      }
      await lockVariants(
        tx,
        row.items.map(({ variantId }) => variantId),
      );
      for (const item of row.items) await reserve(tx, item, event, true);
      await writeAction(tx, event, id, input.reason);
      if (row.refundPolicy === 'FULL_REFUND') await refundDeposits(tx, event, id);
      await tx.layaway.update({
        where: { id },
        data: {
          status: expired ? 'EXPIRED' : 'CANCELLED',
          closedAt: event.occurredAt,
        },
      });
      return id;
    },
  );
}
