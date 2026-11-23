import { listQuerySchema } from '@max-sport/shared';
import { Router } from 'express';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { validate } from '../http/validation.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';

const select = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  createdAt: true,
  user: { select: { displayName: true } },
  before: true,
  after: true,
} satisfies Prisma.AuditLogSelect;

export function createAuditRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  router.get('/', ...security.allow('audit.read'), async (request, response) => {
    const query = validate(listQuerySchema, request.query);
    const where: Prisma.AuditLogWhereInput = query.q
      ? {
          OR: [
            { action: insensitive(query.q) },
            { entity: insensitive(query.q) },
            { entityId: insensitive(query.q) },
            { user: { displayName: insensitive(query.q) } },
          ],
        }
      : {};
    response.json(
      await buildPage(
        database.auditLog.findMany({
          where,
          ...pageArgs(query),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select,
        }),
        database.auditLog.count({ where }),
      ),
    );
  });
  return router;
}
