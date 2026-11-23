import { confirmCorrectionInput, correctionInput, correctionQuery } from '@max-sport/shared';
import { json, Router } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import { confirmCorrection } from './confirm.js';
import { previewCorrection } from './quote.js';
import { correctionDetail, correctionPage } from './read.js';

export function createReturnsRouter(db: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '96kb' });
  router.get('/', ...security.allow('returns.read', 'sales.read'), async (request, response) => {
    response.json(
      await correctionPage(db, validate(correctionQuery, request.query), sessionActor(response)),
    );
  });
  router.get('/:id', ...security.allow('returns.read', 'sales.read'), async (request, response) => {
    response.json(
      await correctionDetail(db, validate(idSchema, request.params.id), sessionActor(response)),
    );
  });
  router.post(
    '/preview',
    security.requireOrigin,
    ...security.allow('returns.create', 'sales.read'),
    body,
    async (request, response) => {
      const input = validate(correctionInput, request.body);
      const actor = sessionActor(response);
      response.json(
        await db.$transaction((tx) => previewCorrection(tx, input, actor), {
          isolationLevel: 'RepeatableRead',
        }),
      );
    },
  );
  router.post(
    '/',
    security.requireOrigin,
    ...security.allow('returns.create', 'returns.read', 'sales.read'),
    body,
    async (request, response) => {
      const actor = sessionActor(response);
      const id = await confirmCorrection(db, validate(confirmCorrectionInput, request.body), actor);
      response.status(201).json(await correctionDetail(db, id, actor));
    },
  );
  return router;
}
