import { Router } from 'express';
import { createAuditRouter } from '../audit/routes.js';
import type { SessionSecurity } from '../auth/session.js';
import { createUsersRouter } from '../auth/users.js';
import type { Database } from '../database.js';
import { accounts } from './accounts.js';
import { createCatalogRouter } from './catalog.js';
import { contacts } from './contacts.js';
import { brands, models, variants } from './products.js';
import { createRatesRouter } from './rates.js';
import { createSettingsRouter } from './settings.js';

export function createMasterDataRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  router.use('/brands', createCatalogRouter(database, security, 'brands', brands));
  router.use('/models', createCatalogRouter(database, security, 'models', models));
  router.use('/variants', createCatalogRouter(database, security, 'variants', variants));
  router.use(
    '/customers',
    createCatalogRouter(
      database,
      security,
      'customers',
      contacts('Customer', (db) => db.customer),
    ),
  );
  router.use(
    '/suppliers',
    createCatalogRouter(
      database,
      security,
      'suppliers',
      contacts('Supplier', (db) => db.supplier),
    ),
  );
  router.use('/accounts', createCatalogRouter(database, security, 'accounts', accounts));
  router.use('/rates', createRatesRouter(database, security));
  router.use('/users', createUsersRouter(database, security));
  router.use('/audit', createAuditRouter(database, security));
  router.use(createSettingsRouter(database, security));
  return router;
}
