import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { cents, decimal } from '../purchasing/money.js';

type Amount = Prisma.Decimal | string;
export function refundableSlice(
  amount: Amount,
  totalUnits: number,
  alreadyReturned: number,
  returnedNow: number,
) {
  const proportion = (units: number) => cents(decimal(amount).mul(units).div(totalUnits));
  return proportion(alreadyReturned + returnedNow).sub(proportion(alreadyReturned));
}

export function restockedLots(
  original: { lotId: string; quantity: number; costUsd: Amount }[],
  alreadyReturned: number,
  returnedNow: number,
) {
  let offset = alreadyReturned;
  let remaining = returnedNow;
  const lots: { originLotId: string; quantity: number; costUsd: Prisma.Decimal }[] = [];
  for (const allocation of original) {
    const skip = Math.min(offset, allocation.quantity);
    offset -= skip;
    const quantity = Math.min(remaining, allocation.quantity - skip);
    if (!quantity) continue;
    lots.push({
      originLotId: allocation.lotId,
      quantity,
      costUsd: refundableSlice(allocation.costUsd, allocation.quantity, skip, quantity),
    });
    remaining -= quantity;
    if (remaining === 0) return lots;
  }
  throw new HttpError(
    409,
    'STOCK_INCONSISTENT',
    'No se encontró la asignación original de costo para los pares devueltos.',
  );
}
