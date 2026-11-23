import {
  auditRecord,
  currencyRecord,
  pageSchema,
  resourceRecords,
  roleRecord,
  shopRecord,
} from '@max-sport/shared';
import type { ResourceKey } from '@max-sport/shared';
import { z } from 'zod';
import { noContent, readJson, sendJson } from '../api';

export type ResourceRow = { id: string; active: boolean } & Record<string, unknown>;

function schemaFor(resource: ResourceKey): z.ZodType<ResourceRow> {
  return resourceRecords[resource];
}

export function listRecords(resource: ResourceKey, query: Record<string, string>) {
  return readJson(
    '/' + resource + '?' + new URLSearchParams(query),
    pageSchema(schemaFor(resource)),
  );
}
export function findRecord(resource: ResourceKey, id: string) {
  return readJson('/' + resource + '/' + encodeURIComponent(id), schemaFor(resource));
}
export function saveRecord(resource: ResourceKey, id: string | null, input: unknown) {
  const uri = '/' + resource + (id ? '/' + encodeURIComponent(id) : '');
  return sendJson(uri, schemaFor(resource), input, id ? 'PUT' : 'POST');
}
export function recordStatus(resource: ResourceKey, id: string, active: boolean) {
  const uri = '/' + resource + '/' + encodeURIComponent(id);
  return active ? noContent(uri + '/restore', 'POST') : noContent(uri, 'DELETE');
}

export const getShop = () => readJson('/shop', shopRecord);
export const putShop = (input: unknown) => sendJson('/shop', shopRecord, input, 'PUT');
export const getCurrencies = () => readJson('/currencies', z.array(currencyRecord));
export const putCurrency = (code: string, input: unknown) =>
  sendJson('/currencies/' + encodeURIComponent(code), currencyRecord, input, 'PUT');
export const getRoles = () => readJson('/roles', z.array(roleRecord));
export const putFinancialPermissions = (code: string, input: unknown) =>
  sendJson(
    '/roles/' + encodeURIComponent(code) + '/financial-permissions',
    roleRecord,
    input,
    'PUT',
  );
export const getAudit = (query: Record<string, string>) =>
  readJson('/audit?' + new URLSearchParams(query), pageSchema(auditRecord));
