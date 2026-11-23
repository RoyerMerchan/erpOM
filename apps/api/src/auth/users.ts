import {
  listQuerySchema,
  resourcePermission,
  userCreateInput,
  userUpdateInput,
} from '@max-sport/shared';
import { json, Router } from 'express';
import type { RequestHandler } from 'express';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { idSchema, validate } from '../http/validation.js';
import {
  buildPage,
  filterActive,
  insensitive,
  masterNotFound,
  pageArgs,
} from '../master-data/catalog.js';
import { hashPassword } from './password.js';
import { lockUser, sessionActor } from './session.js';
import type { SessionSecurity } from './session.js';

const select = {
  id: true,
  active: true,
  displayName: true,
  email: true,
  mustChangePassword: true,
  role: { select: { code: true, label: true } },
} satisfies Prisma.UserSelect;
type User = Prisma.UserGetPayload<{ select: typeof select }>;

async function getUser(db: Prisma.TransactionClient, id: string) {
  const item = await db.user.findUnique({ where: { id }, select });
  if (!item) throw masterNotFound();
  return item;
}

function auditProfile({ active, role, mustChangePassword }: User) {
  return { active, roleCode: role.code, mustChangePassword };
}

async function lockAdministration(db: Prisma.TransactionClient, actorId: string) {
  await db.$queryRaw`SELECT id FROM "roles" WHERE code = 'ADMIN' FOR UPDATE`;
  const actor = await db.user.findFirst({
    where: { id: actorId, active: true, mustChangePassword: false, role: { code: 'ADMIN' } },
    select: { id: true },
  });
  if (!actor)
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite administrar usuarios.');
}

async function protectLastAdmin(db: Prisma.TransactionClient, previous: User) {
  if (!previous.active || previous.role.code !== 'ADMIN') return;
  const otherAdmins = await db.user.count({
    where: { id: { not: previous.id }, active: true, role: { code: 'ADMIN' } },
  });
  if (!otherAdmins)
    throw new HttpError(409, 'LAST_ADMIN', 'Debe quedar al menos un administrador activo.');
}

export function createUsersRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const auth = (action: 'read' | 'create' | 'update' | 'archive') =>
    security.allow(resourcePermission('users', action));
  const body = json({ limit: '16kb' });

  router.get('/', ...auth('read'), async (request, response) => {
    const query = validate(listQuerySchema, request.query);
    const where: Prisma.UserWhereInput = {
      ...filterActive(query.status),
      ...(query.q
        ? {
            OR: [
              { displayName: insensitive(query.q) },
              { email: insensitive(query.q) },
              { role: { label: insensitive(query.q) } },
            ],
          }
        : {}),
    };
    response.json(
      await buildPage(
        database.user.findMany({
          where,
          ...pageArgs(query),
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          select,
        }),
        database.user.count({ where }),
      ),
    );
  });

  router.get('/:id', ...auth('read'), async (request, response) => {
    response.json(await getUser(database, validate(idSchema, request.params.id)));
  });

  router.post('/', security.requireOrigin, ...auth('create'), body, async (request, response) => {
    const { displayName, email, roleCode, temporaryPassword } = validate(
      userCreateInput,
      request.body,
    );
    const actor = sessionActor(response);
    const passwordHash = await hashPassword(temporaryPassword);
    const user = await database.$transaction(async (tx) => {
      await lockAdministration(tx, actor.id);
      const created = await tx.user.create({
        data: {
          displayName,
          email,
          passwordHash,
          mustChangePassword: true,
          role: { connect: { code: roleCode } },
        },
        select,
      });
      await writeAudit(tx, actor.id, {
        action: 'users.create',
        entity: 'User',
        entityId: created.id,
        after: auditProfile(created),
      });
      return created;
    });
    response.status(201).json(user);
  });

  router.put('/:id', security.requireOrigin, ...auth('update'), body, async (request, response) => {
    const id = validate(idSchema, request.params.id);
    const { displayName, email, roleCode, temporaryPassword } = validate(
      userUpdateInput,
      request.body,
    );
    const actor = sessionActor(response);
    const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : undefined;
    const user = await database.$transaction(async (tx) => {
      await lockAdministration(tx, actor.id);
      await lockUser(tx, id);
      const previous = await getUser(tx, id);
      const roleChanged = previous.role.code !== roleCode;
      if (id === actor.id && (roleChanged || passwordHash)) {
        throw new HttpError(
          409,
          'SELF_MANAGEMENT',
          'Usa Mi cuenta para cambiar tu contraseña. Tu propio rol está protegido.',
        );
      }
      if (roleChanged) await protectLastAdmin(tx, previous);

      const updated = await tx.user.update({
        where: { id },
        data: {
          displayName,
          email,
          role: { connect: { code: roleCode } },
          ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
        },
        select,
      });
      if (roleChanged || passwordHash || previous.email !== email) {
        await tx.userSession.deleteMany({ where: { userId: id } });
      }
      await writeAudit(tx, actor.id, {
        action: 'users.update',
        entity: 'User',
        entityId: id,
        before: auditProfile(previous),
        after: {
          ...auditProfile(updated),
          emailChanged: previous.email !== email,
          nameChanged: previous.displayName !== displayName,
          temporaryPasswordSet: Boolean(passwordHash),
        },
      });
      return updated;
    });
    response.json(user);
  });

  function setStatus(active: boolean): RequestHandler {
    return async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const actor = sessionActor(response);
      if (!active && id === actor.id) {
        throw new HttpError(409, 'SELF_MANAGEMENT', 'Tu propia cuenta está protegida.');
      }
      await database.$transaction(async (tx) => {
        await lockAdministration(tx, actor.id);
        await lockUser(tx, id);
        const previous = await getUser(tx, id);
        if (previous.active === active) return;
        if (!active) await protectLastAdmin(tx, previous);
        const updated = await tx.user.update({ where: { id }, data: { active }, select });
        if (!active) await tx.userSession.deleteMany({ where: { userId: id } });
        await writeAudit(tx, actor.id, {
          action: active ? 'users.restore' : 'users.archive',
          entity: 'User',
          entityId: id,
          before: auditProfile(previous),
          after: auditProfile(updated),
        });
      });
      response.status(204).end();
    };
  }
  router.delete('/:id', security.requireOrigin, ...auth('archive'), setStatus(false));
  router.post('/:id/restore', security.requireOrigin, ...auth('archive'), setStatus(true));
  return router;
}
