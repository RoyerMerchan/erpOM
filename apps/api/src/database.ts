import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createDatabase(connectionString: string) {
  const url = new URL(connectionString);
  const options = url.searchParams.get('options') ?? process.env.PGOPTIONS;
  // The Prisma adapter decodes PostgreSQL timestamps as UTC.
  url.searchParams.set('options', [options, '-c timezone=UTC'].filter(Boolean).join(' '));
  const adapter = new PrismaPg({ connectionString: url.href, connectionTimeoutMillis: 5_000 });
  return new PrismaClient({ adapter });
}

export type Database = ReturnType<typeof createDatabase>;
