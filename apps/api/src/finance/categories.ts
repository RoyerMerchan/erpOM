import type { ListQuery, SessionUser } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import {
  buildPage,
  filterActive,
  insensitive,
  masterNotFound,
  normalizedKey,
  pageArgs,
} from '../master-data/catalog.js';
import { operation } from '../purchasing/transaction.js';

const select = { id: true, name: true, active: true } as const;
export function categories(db: Database, query: ListQuery) {
  const where = {
    ...filterActive(query.status),
    ...(query.q ? { name: insensitive(query.q) } : {}),
  };
  return buildPage(
    db.financeCategory.findMany({
      where,
      select,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...pageArgs(query),
    }),
    db.financeCategory.count({ where }),
  );
}

export function saveCategory(
  db: Database,
  id: string | null,
  input: { name: string; active: boolean },
  actor: SessionUser,
) {
  const data = { ...input, nameKey: normalizedKey(input.name) };
  return operation(db, async (tx) => {
    const previous = id ? await tx.financeCategory.findUnique({ where: { id }, select }) : null;
    if (id && !previous) throw masterNotFound();
    const saved = id
      ? await tx.financeCategory.update({ where: { id }, data, select })
      : await tx.financeCategory.create({ data, select });
    await writeAudit(tx, actor.id, {
      action: id ? 'finance.categories.update' : 'finance.categories.create',
      entity: 'FinanceCategory',
      entityId: saved.id,
      before: previous ?? undefined,
      after: saved,
    });
    return saved;
  });
}
