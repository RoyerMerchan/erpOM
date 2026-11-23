import {
  closeLayawayInput,
  createLayawayInput,
  deliverLayawayInput,
  depositLayawayInput,
  layawayQuery,
} from '@max-sport/shared';
import { json, Router } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import { closeLayaway, createLayaway, deliverLayaway, depositLayaway } from './operations.js';
import { layawayDetail, layawayPage } from './read.js';

export function createLayawayRouter(db: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '80kb' });
  router.get('/', ...security.allow('layaways.read'), async (request, response) => {
    response.json(
      await layawayPage(db, validate(layawayQuery, request.query), sessionActor(response)),
    );
  });
  router.get('/:id', ...security.allow('layaways.read'), async (request, response) => {
    response.json(
      await layawayDetail(db, validate(idSchema, request.params.id), sessionActor(response)),
    );
  });
  router.post(
    '/',
    security.requireOrigin,
    ...security.allow('layaways.create', 'layaways.read', 'customers.read'),
    body,
    async (request, response) => {
      const actor = sessionActor(response);
      const id = await createLayaway(db, validate(createLayawayInput, request.body), actor);
      response.status(201).json(await layawayDetail(db, id, actor));
    },
  );
  router.post(
    '/:id/payments',
    security.requireOrigin,
    ...security.allow('layaways.pay', 'layaways.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const actor = sessionActor(response);
      await depositLayaway(db, id, validate(depositLayawayInput, request.body), actor);
      response.json(await layawayDetail(db, id, actor));
    },
  );
  router.post(
    '/:id/deliver',
    security.requireOrigin,
    ...security.allow('layaways.deliver', 'layaways.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const actor = sessionActor(response);
      await deliverLayaway(db, id, validate(deliverLayawayInput, request.body).operationId, actor);
      response.json(await layawayDetail(db, id, actor));
    },
  );
  for (const [path, expired] of [
    ['cancel', false],
    ['expire', true],
  ] as const) {
    router.post(
      '/:id/' + path,
      security.requireOrigin,
      ...security.allow('layaways.cancel', 'layaways.read'),
      body,
      async (request, response) => {
        const id = validate(idSchema, request.params.id);
        const actor = sessionActor(response);
        await closeLayaway(db, id, validate(closeLayawayInput, request.body), actor, expired);
        response.json(await layawayDetail(db, id, actor));
      },
    );
  }
  return router;
}
