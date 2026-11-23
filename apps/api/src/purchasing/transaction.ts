import { createHash } from 'node:crypto';
import type { Database } from '../database.js';
import { Prisma } from '../generated/prisma/client.js';
import { isTransactionConflict } from '../http/errors.js';

export type Transaction = Prisma.TransactionClient;

export function digest(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function operation<T>(
  database: Database,
  execute: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await database.$transaction(execute, {
        isolationLevel: 'Serializable',
        timeout: 15_000,
      });
    } catch (error) {
      const canRetry =
        isTransactionConflict(error) ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
      if (!canRetry || retry >= 3) throw error;
    }
  }
}
