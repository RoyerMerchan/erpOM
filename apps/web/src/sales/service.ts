import {
  pageSchema,
  saleDetailSchema,
  saleOperatorSchema,
  salePreviewSchema,
  saleSummarySchema,
} from '@max-sport/shared';
import type { ConfirmSaleInput, SaleInput } from '@max-sport/shared';
import { z } from 'zod';
import { readJson, sendJson } from '../api';

export const getSales = (query: Record<string, string>) =>
  readJson('/sales?' + new URLSearchParams(query), pageSchema(saleSummarySchema));
export const getSale = (id: string) =>
  readJson('/sales/' + encodeURIComponent(id), saleDetailSchema);
export const previewSale = (input: SaleInput) =>
  sendJson('/sales/preview', salePreviewSchema, input, 'POST');
export const postSale = (input: ConfirmSaleInput) =>
  sendJson('/sales', saleDetailSchema, input, 'POST');
export const getSaleOperators = (q: string) =>
  readJson(
    '/sales/operators?' + new URLSearchParams({ q, limit: '30' }),
    pageSchema(saleOperatorSchema),
  );
export const getSaleRate = (code: string) =>
  readJson(
    '/sales/rates/' + encodeURIComponent(code),
    z.object({ unitsPerUsd: z.string(), effectiveAt: z.iso.datetime() }).nullable(),
  );
