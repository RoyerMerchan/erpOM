import { inventoryAdjustment, inventoryQuerySchema, listQuerySchema } from '@max-sport/shared';
import { json, Router } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import { buildPage, masterNotFound, pageArgs } from '../master-data/catalog.js';
import { adjustInventory } from './adjustment.js';
import { inventoryPage } from './read.js';

export function createInventoryRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  router.get('/', ...security.allow('inventory.read'), async (request, response) => {
    response.json(
      await inventoryPage(
        database,
        validate(inventoryQuerySchema, request.query),
        sessionActor(response),
      ),
    );
  });
  router.get('/:id/movements', ...security.allow('inventory.read'), async (request, response) => {
    const variantId = validate(idSchema, request.params.id);
    const query = validate(listQuerySchema, request.query);
    if (
      !(await database.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true },
      }))
    )
      throw masterNotFound();
    const actor = sessionActor(response);
    const where = { variantId };
    const { items, total } = await buildPage(
      database.stockMovement.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        include: {
          actor: { select: { displayName: true } },
          purchaseItem: { select: { purchaseId: true } },
        },
      }),
      database.stockMovement.count({ where }),
    );
    response.json({
      total,
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        quantityDelta: item.quantityDelta,
        reservedDelta: item.reservedDelta,
        reason: item.reason,
        occurredAt: item.occurredAt,
        actorName: item.actor.displayName,
        purchaseId: actor.permissions.includes('purchases.read')
          ? (item.purchaseItem?.purchaseId ?? null)
          : null,
      })),
    });
  });
  router.post(
    '/:id/adjustments',
    security.requireOrigin,
    ...security.allow('inventory.adjust'),
    json({ limit: '16kb' }),
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const movementId = await adjustInventory(
        database,
        id,
        validate(inventoryAdjustment, request.body),
        sessionActor(response),
      );
      response.status(201).json({ id: movementId });
    },
  );
  return router;
}
