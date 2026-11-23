import {
  financeCategoryInput,
  financeDailyQuery,
  financeDebtQuery,
  financeEntryConfirmation,
  financeEntryInput,
  financeLedgerQuery,
  financeReportQuery,
  financeReversalInput,
  listQuerySchema,
} from '@max-sport/shared';
import type { FinanceReportFilters } from '@max-sport/shared';
import { json, Router } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import type { Transaction } from '../purchasing/transaction.js';
import { financeWindow } from './calendar.js';
import { categories, saveCategory } from './categories.js';
import { payables, receivables } from './debts.js';
import {
  confirmFinanceEntry,
  financeEntry,
  previewFinanceEntry,
  reverseFinanceEntry,
} from './entries.js';
import { ledgerPage } from './ledger.js';
import { balances, financeReport } from './report.js';

export function createFinanceRouter(db: Database, security: SessionSecurity) {
  const router = Router();
  const read = security.allow('finance.read');
  const body = json({ limit: '24kb' });
  const snapshot = <T>(run: (tx: Transaction) => Promise<T>) =>
    db.$transaction(run, { isolationLevel: 'RepeatableRead', timeout: 15_000 });
  const range = (query: FinanceReportFilters, actor: ReturnType<typeof sessionActor>) =>
    snapshot(async (tx) => financeReport(tx, await financeWindow(tx, query), query, actor));

  router.get('/report', ...read, async (request, response) => {
    response.json(await range(validate(financeReportQuery, request.query), sessionActor(response)));
  });
  router.get('/daily', ...read, async (request, response) => {
    const input = { ...validate(financeDailyQuery, request.query), period: 'DAY' as const };
    response.json(await range(input, sessionActor(response)));
  });
  router.get('/accounts', ...read, async (request, response) => {
    const input = validate(financeReportQuery, request.query);
    response.json(
      await snapshot(async (tx) => {
        const window = await financeWindow(tx, input);
        return { window, accounts: await balances(tx, window, input) };
      }),
    );
  });
  router.get('/movements', ...read, async (request, response) => {
    const input = validate(financeLedgerQuery, request.query);
    response.json(
      await snapshot(async (tx) => ledgerPage(tx, input, await financeWindow(tx, input))),
    );
  });
  router.get('/receivables', ...read, async (request, response) => {
    const input = validate(financeDebtQuery, request.query);
    response.json(await snapshot((tx) => receivables(tx, input)));
  });
  router.get(
    '/payables',
    ...security.allow('finance.read', 'costs.read'),
    async (request, response) => {
      const input = validate(financeDebtQuery, request.query);
      response.json(await snapshot((tx) => payables(tx, input)));
    },
  );
  router.get('/categories', ...read, async (request, response) => {
    response.json(await categories(db, validate(listQuerySchema, request.query)));
  });
  router.post(
    '/categories',
    security.requireOrigin,
    ...security.allow('finance.read', 'finance.categories.manage'),
    body,
    async (request, response) => {
      response
        .status(201)
        .json(
          await saveCategory(
            db,
            null,
            validate(financeCategoryInput, request.body),
            sessionActor(response),
          ),
        );
    },
  );
  router.put(
    '/categories/:id',
    security.requireOrigin,
    ...security.allow('finance.read', 'finance.categories.manage'),
    body,
    async (request, response) => {
      response.json(
        await saveCategory(
          db,
          validate(idSchema, request.params.id),
          validate(financeCategoryInput, request.body),
          sessionActor(response),
        ),
      );
    },
  );
  router.get('/entries/:id', ...read, async (request, response) => {
    response.json(await financeEntry(db, validate(idSchema, request.params.id)));
  });
  router.post(
    '/entries/preview',
    security.requireOrigin,
    ...read,
    body,
    async (request, response) => {
      const input = validate(financeEntryInput, request.body);
      const actor = sessionActor(response);
      response.json(await snapshot((tx) => previewFinanceEntry(tx, input, actor)));
    },
  );
  router.post('/entries', security.requireOrigin, ...read, body, async (request, response) => {
    const id = await confirmFinanceEntry(
      db,
      validate(financeEntryConfirmation, request.body),
      sessionActor(response),
    );
    response.status(201).json(await financeEntry(db, id));
  });
  router.post(
    '/entries/:id/reverse',
    security.requireOrigin,
    ...security.allow('finance.read', 'finance.reverse'),
    body,
    async (request, response) => {
      const id = await reverseFinanceEntry(
        db,
        validate(idSchema, request.params.id),
        validate(financeReversalInput, request.body),
        sessionActor(response),
      );
      response.status(201).json(await financeEntry(db, id));
    },
  );
  return router;
}
