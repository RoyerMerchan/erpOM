import { catalogPdfInput, catalogPreviewQuery, listQuerySchema } from '@max-sport/shared';
import { json, Router } from 'express';
import type { Response } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import { catalogVersions, generateCatalog, previewCatalog, storedCatalog } from './catalog.js';

function sendPdf(
  response: Response,
  document: { id: string | null; filename: string; pdf: Uint8Array },
) {
  if (document.id) response.setHeader('X-Catalog-Version', document.id);
  response.attachment(document.filename).type('application/pdf').send(Buffer.from(document.pdf));
}
export function createCatalogRouter(db: Database, security: SessionSecurity) {
  const router = Router();
  const allow = security.allow('catalog.export', 'inventory.read');
  router.get('/preview', ...allow, async (request, response) => {
    const { page, limit, ...input } = validate(catalogPreviewQuery, request.query);
    response.json(await previewCatalog(db, input, sessionActor(response), page, limit));
  });
  router.post(
    '/pdf',
    security.requireOrigin,
    ...allow,
    json({ limit: '12kb' }),
    async (request, response) => {
      sendPdf(
        response,
        await generateCatalog(db, validate(catalogPdfInput, request.body), sessionActor(response)),
      );
    },
  );
  router.get('/versions', ...allow, async (request, response) => {
    response.json(
      await catalogVersions(db, sessionActor(response), validate(listQuerySchema, request.query)),
    );
  });
  router.get('/versions/:id', ...allow, async (request, response) => {
    sendPdf(
      response,
      await storedCatalog(db, sessionActor(response), validate(idSchema, request.params.id)),
    );
  });
  return router;
}
