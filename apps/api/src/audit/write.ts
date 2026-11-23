import type { Prisma } from '../generated/prisma/client.js';

type Entry = {
  action: string;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
};

export async function writeAudit(
  transaction: Prisma.TransactionClient,
  actorId: string,
  entry: Entry,
) {
  await transaction.auditLog.create({ data: { userId: actorId, ...entry } });
}
