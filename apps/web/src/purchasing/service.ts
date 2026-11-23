import {
  inventoryRowSchema,
  pageSchema,
  purchaseDetailSchema,
  purchasePreviewSchema,
  purchaseSummarySchema,
  stockMovementSchema,
} from '@max-sport/shared';
import type {
  InventoryAdjustment,
  PaymentInput,
  PurchaseInput,
  ReceiveInput,
} from '@max-sport/shared';
import { z } from 'zod';
import { readJson, sendJson } from '../api';

const queryString = (query: Record<string, string>) => '?' + new URLSearchParams(query);
const purchasePath = (id: string) => '/purchases/' + encodeURIComponent(id);
const inventoryPath = (id: string) => '/inventory/' + encodeURIComponent(id);
export const getPurchases = (query: Record<string, string>, payables: boolean) =>
  readJson(
    '/purchases' + (payables ? '/payables' : '') + queryString(query),
    pageSchema(purchaseSummarySchema),
  );
export const getPurchase = (id: string) => readJson(purchasePath(id), purchaseDetailSchema);
export const previewDraft = (input: PurchaseInput) =>
  sendJson('/purchases/preview', purchasePreviewSchema, input, 'POST');
export const createDraft = (input: PurchaseInput) =>
  sendJson('/purchases', purchaseDetailSchema, input, 'POST');
export const updateDraft = (id: string, revision: number, draft: PurchaseInput) =>
  sendJson(purchasePath(id), purchaseDetailSchema, { revision, draft }, 'PUT');
export const receiveDraft = (id: string, input: ReceiveInput) =>
  sendJson(purchasePath(id) + '/receive', purchaseDetailSchema, input, 'POST');
export const voidDocument = (id: string, reason: string) =>
  sendJson(purchasePath(id) + '/void', purchaseDetailSchema, { reason }, 'POST');
export const paySupplier = (id: string, input: PaymentInput) =>
  sendJson(purchasePath(id) + '/payments', purchaseDetailSchema, input, 'POST');
export const reverseSupplierPayment = (id: string, paymentId: string, reason: string) =>
  sendJson(
    purchasePath(id) + '/payments/' + encodeURIComponent(paymentId) + '/reverse',
    purchaseDetailSchema,
    { reason },
    'POST',
  );
export const getQuote = (currencyCode: string, at: string) =>
  readJson(
    '/purchases/quote' + queryString({ currencyCode, at }),
    z.object({ id: z.uuid(), unitsPerUsd: z.string(), effectiveAt: z.iso.datetime() }).nullable(),
  );
export const getInventory = (query: Record<string, string>) =>
  readJson('/inventory' + queryString(query), pageSchema(inventoryRowSchema));
export const getStockMovements = (id: string, query: Record<string, string>) =>
  readJson(inventoryPath(id) + '/movements' + queryString(query), pageSchema(stockMovementSchema));
export const postAdjustment = (id: string, input: InventoryAdjustment) =>
  sendJson(inventoryPath(id) + '/adjustments', z.object({ id: z.uuid() }), input, 'POST');
