import type { PaymentInput } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Purchase } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { cents, decimal, requiredRate, scaledAmount } from './money.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { captureRate } from './rates.js';
import { digest } from './transaction.js';
import type { Transaction } from './transaction.js';

export async function recordPayment(
  tx: Transaction,
  purchase: Purchase,
  input: PaymentInput,
  actorId: string,
) {
  const hash = digest(input);
  const existing = await tx.supplierPayment.findUnique({
    where: {
      purchaseId_operationKey: { purchaseId: purchase.id, operationKey: input.operationId },
    },
    select: { id: true, operationDigest: true },
  });
  if (existing) {
    if (existing.operationDigest !== hash)
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'La operación ya se usó con otros datos.');
    return existing.id;
  }
  if (purchase.status !== 'CONFIRMED' || purchase.totalUsd === null) {
    throw new HttpError(
      409,
      'PURCHASE_NOT_CONFIRMED',
      'Confirma la recepción antes de registrar el pago.',
    );
  }

  const account = await tx.moneyAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, active: true, currencyCode: true },
  });
  if (!account?.active)
    throw new HttpError(409, 'ACCOUNT_INACTIVE', 'Selecciona una cuenta habilitada.');
  const { minorUnits } = await requireActiveCurrency(tx, account.currencyCode);
  const rate = requiredRate(account.currencyCode, input.unitsPerUsd);
  const original = scaledAmount(input.amountOriginal, minorUnits, 'El importe del pago');
  const amountUsd = cents(original.div(rate));
  if (amountUsd.lte(0))
    throw new HttpError(
      400,
      'PAYMENT_ROUNDING',
      'El importe es menor que un centavo USD al convertirlo.',
    );
  const newPaid = decimal(purchase.paidUsd).add(amountUsd);
  if (newPaid.gt(purchase.totalUsd))
    throw new HttpError(409, 'OVERPAYMENT', 'El pago supera el saldo pendiente en USD.');

  const paidAt = new Date(input.paidAt);
  const rateId = await captureRate(tx, account.currencyCode, rate, paidAt, actorId);
  const movement = {
    accountId: account.id,
    currencyCode: account.currencyCode,
    unitsPerUsd: rate,
    amountOriginal: original.toFixed(),
    amountUsd: amountUsd.toFixed(2),
  };
  const paid = await tx.supplierPayment.create({
    data: {
      ...movement,
      purchaseId: purchase.id,
      exchangeRateId: rateId,
      paidAt,
      reference: input.reference,
      operationKey: input.operationId,
      operationDigest: hash,
      createdById: actorId,
    },
  });
  await tx.moneyMovement.create({
    data: {
      ...movement,
      kind: 'SUPPLIER_PAYMENT',
      paymentId: paid.id,
      actorId,
      occurredAt: paidAt,
    },
  });
  await tx.purchase.update({ where: { id: purchase.id }, data: { paidUsd: newPaid.toFixed(2) } });
  await writeAudit(tx, actorId, {
    action: 'purchases.payment.create',
    entity: 'Purchase',
    entityId: purchase.id,
    after: {
      paymentId: paid.id,
      accountId: account.id,
      currencyCode: account.currencyCode,
      exchangeRateId: rateId,
    },
  });
  return paid.id;
}

export async function reversePayment(
  tx: Transaction,
  purchase: Purchase,
  paymentId: string,
  reason: string,
  actorId: string,
) {
  const payment = await tx.supplierPayment.findFirst({
    where: { id: paymentId, purchaseId: purchase.id },
  });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'No existe ese pago en la compra.');
  if (payment.reversedAt) {
    if (payment.reversalReason === reason) return;
    throw new HttpError(409, 'PAYMENT_REVERSED', 'El pago ya fue revertido con otro motivo.');
  }
  if (purchase.status !== 'CONFIRMED')
    throw new HttpError(409, 'PURCHASE_NOT_CONFIRMED', 'La compra debe estar confirmada.');

  const reversedAt = new Date();
  await tx.supplierPayment.update({
    where: { id: payment.id },
    data: { reversedAt, reversedById: actorId, reversalReason: reason },
  });
  await tx.moneyMovement.create({
    data: {
      kind: 'SUPPLIER_PAYMENT_REVERSAL',
      paymentId,
      accountId: payment.accountId,
      currencyCode: payment.currencyCode,
      unitsPerUsd: payment.unitsPerUsd,
      amountOriginal: payment.amountOriginal,
      amountUsd: payment.amountUsd,
      actorId,
      occurredAt: reversedAt,
    },
  });
  await tx.purchase.update({
    where: { id: purchase.id },
    data: { paidUsd: { decrement: payment.amountUsd } },
  });
  await writeAudit(tx, actorId, {
    action: 'purchases.payment.reverse',
    entity: 'Purchase',
    entityId: purchase.id,
    after: { paymentId, reason },
  });
}
