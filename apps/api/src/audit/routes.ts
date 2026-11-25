import { listQuerySchema, superuserRoleCode } from '@max-sport/shared';
import { Router } from 'express';
import { sessionActor, visibleUser } from '../auth/session.js';
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
  user: { select: { id: true, displayName: true, role: { select: { code: true } } } },
  before: true,
  after: true,
} satisfies Prisma.AuditLogSelect;

export function createAuditRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  router.get('/', ...security.allow('audit.read'), async (request, response) => {
    const query = validate(listQuerySchema, request.query);
    const actorId = sessionActor(response).id;
    const privateUsers = await database.user.findMany({
      where: { id: { not: actorId }, role: { code: superuserRoleCode } },
      select: { id: true },
    });
    const where: Prisma.AuditLogWhereInput = {
      NOT: { AND: [{ entity: 'User' }, { entityId: { in: privateUsers.map(({ id }) => id) } }] },
      ...(query.q
        ? {
            OR: [
              { action: insensitive(query.q) },
              { entity: insensitive(query.q) },
              { entityId: insensitive(query.q) },
              { user: { ...visibleUser(actorId), displayName: insensitive(query.q) } },
            ],
          }
        : {}),
    };
    const page = await buildPage(
      database.auditLog.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select,
      }),
      database.auditLog.count({ where }),
    );
    response.json({
      ...page,
      items: page.items.map(({ user, ...entry }) => ({
        ...entry,
        user:
          user && (user.id === actorId || user.role.code !== superuserRoleCode)
            ? { displayName: user.displayName }
            : null,
      })),
    });
  });
  return router;
}
