import { listQuerySchema, resourcePermission } from '@max-sport/shared';
import type { ListQuery, ResourceKey } from '@max-sport/shared';
import { json, Router } from 'express';
import type { ZodType } from 'zod';
import { writeAudit } from '../audit/write.js';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { idSchema, validate } from '../http/validation.js';

type CatalogKey = Exclude<ResourceKey, 'users' | 'rates'>;
type CatalogRow = { id: string; active: boolean };
type Transaction = Prisma.TransactionClient;

export type CatalogDefinition<Input, Row extends CatalogRow> = {
  entity: string;
  schema: ZodType<Input>;
  list: (database: Database, query: ListQuery) => Promise<{ items: Row[]; total: number }>;
  find: (database: Transaction, id: string) => Promise<Row | null>;
  create: (database: Transaction, input: Input) => Promise<Row>;
  update: (database: Transaction, id: string, input: Input) => Promise<Row>;
  setActive: (database: Transaction, id: string, active: boolean) => Promise<Row>;
  audit: (row: Row) => Prisma.InputJsonObject;
};

export function filterActive(status: ListQuery['status']) {
  return status === 'all' ? {} : { active: status === 'active' };
}

export function pageArgs(query: Pick<ListQuery, 'page' | 'limit'>) {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

export async function buildPage<T>(itemsQuery: Promise<T[]>, countQuery: Promise<number>) {
  const [items, total] = await Promise.all([itemsQuery, countQuery]);
  return { items, total };
}

export const insensitive = (contains: string) => ({ contains, mode: 'insensitive' as const });
export const masterNotFound = () =>
  new HttpError(404, 'RECORD_NOT_FOUND', 'El registro no existe.');
export const normalizedKey = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export function createCatalogRouter<Input, Row extends CatalogRow>(
  database: Database,
  security: SessionSecurity,
  resource: CatalogKey,
  definition: CatalogDefinition<Input, Row>,
) {
  const router = Router();
  const allow = (action: 'read' | 'create' | 'update' | 'archive') =>
    security.allow(resourcePermission(resource, action));
  const body = json({ limit: '32kb' });
  async function find(database: Transaction, id: string) {
    const item = await definition.find(database, id);
    if (!item) throw masterNotFound();
    return item;
  }

  router.get('/', ...allow('read'), async (request, response) => {
    response.json(await definition.list(database, validate(listQuerySchema, request.query)));
  });
  router.get('/:id', ...allow('read'), async (request, response) => {
    response.json(await find(database, validate(idSchema, request.params.id)));
  });
  router.post('/', security.requireOrigin, ...allow('create'), body, async (request, response) => {
    const input = validate(definition.schema, request.body);
    const actor = sessionActor(response);
    const item = await database.$transaction(
      async (transaction) => {
        const created = await definition.create(transaction, input);
        await writeAudit(transaction, actor.id, {
          action: `${resource}.create`,
          entity: definition.entity,
          entityId: created.id,
          after: definition.audit(created),
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    response.status(201).json(item);
  });
  router.put(
    '/:id',
    security.requireOrigin,
    ...allow('update'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const input = validate(definition.schema, request.body);
      const actor = sessionActor(response);
      const item = await database.$transaction(
        async (transaction) => {
          const previous = await find(transaction, id);
          const updated = await definition.update(transaction, id, input);
          await writeAudit(transaction, actor.id, {
            action: `${resource}.update`,
            entity: definition.entity,
            entityId: id,
            before: definition.audit(previous),
            after: definition.audit(updated),
          });
          return updated;
        },
        { isolationLevel: 'Serializable' },
      );
      response.json(item);
    },
  );

  function setStatus(active: boolean) {
    const handler: import('express').RequestHandler = async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const actor = sessionActor(response);
      await database.$transaction(
        async (transaction) => {
          const previous = await find(transaction, id);
          if (previous.active === active) return;
          const updated = await definition.setActive(transaction, id, active);
          await writeAudit(transaction, actor.id, {
            action: `${resource}.${active ? 'restore' : 'archive'}`,
            entity: definition.entity,
            entityId: id,
            before: definition.audit(previous),
            after: definition.audit(updated),
          });
        },
        { isolationLevel: 'Serializable' },
      );
      response.status(204).end();
    };
    return handler;
  }

  router.delete('/:id', security.requireOrigin, ...allow('archive'), setStatus(false));
  router.post('/:id/restore', security.requireOrigin, ...allow('archive'), setStatus(true));
  return router;
}
