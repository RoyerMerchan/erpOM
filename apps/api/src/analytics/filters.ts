import type { AnalyticsQuery, SessionUser } from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';

export function filterVariants(query: Pick<AnalyticsQuery, 'brandId' | 'modelId' | 'size'>) {
  return Prisma.sql`
    ${query.brandId ? Prisma.sql`AND model.brand_id = ${query.brandId}::uuid` : Prisma.empty}
    ${query.modelId ? Prisma.sql`AND v.model_id = ${query.modelId}::uuid` : Prisma.empty}
    ${query.size === undefined ? Prisma.empty : Prisma.sql`AND v.size = ${query.size}`}
  `;
}

export function filterSale(query: AnalyticsQuery, actor: SessionUser) {
  return Prisma.sql`
    ${actor.permissions.includes('sales.read.all') ? Prisma.empty : Prisma.sql`AND s.seller_id = ${actor.id}::uuid`}
    ${query.sellerId ? Prisma.sql`AND s.seller_id = ${query.sellerId}::uuid` : Prisma.empty}
    ${query.customerId ? Prisma.sql`AND s.customer_id = ${query.customerId}::uuid` : Prisma.empty}
    ${
      query.accountId || query.currencyCode || query.method
        ? Prisma.sql`AND (
      EXISTS (SELECT 1 FROM sale_tenders t JOIN money_accounts a ON a.id = t.account_id
        WHERE t.sale_id = s.id AND t.kind = 'PAYMENT' ${filterAccount(query)})
      OR EXISTS (SELECT 1 FROM layaway_payments t
        JOIN layaway_actions la ON la.id = t.action_id JOIN money_accounts a ON a.id = t.account_id
        WHERE la.layaway_id = s.layaway_id AND t.kind = 'DEPOSIT' ${filterAccount(query)})
      OR EXISTS (SELECT 1 FROM correction_tenders t JOIN money_accounts a ON a.id = t.account_id
        WHERE t.correction_id = s.exchange_id AND t.kind = 'PAYMENT' ${filterAccount(query)})
    )`
        : Prisma.empty
    }
  `;
}

function filterAccount(query: AnalyticsQuery) {
  return Prisma.sql`
    ${query.accountId ? Prisma.sql`AND t.account_id = ${query.accountId}::uuid` : Prisma.empty}
    ${query.currencyCode ? Prisma.sql`AND t.currency_code = ${query.currencyCode}` : Prisma.empty}
    ${query.method ? Prisma.sql`AND a.kind::text = ${query.method}` : Prisma.empty}
  `;
}
