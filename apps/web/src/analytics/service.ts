import {
  analyticsResponseSchema,
  catalogPreviewSchema,
  catalogVersionSchema,
  pageSchema,
} from '@max-sport/shared';
import type { CatalogPdfInput } from '@max-sport/shared';
import { downloadFile, readJson } from '../api';

const queryString = (query: Record<string, string>) => '?' + new URLSearchParams(query);
export const getAnalytics = (query: Record<string, string>) =>
  readJson('/analytics' + queryString(query), analyticsResponseSchema);
export const downloadReport = (query: Record<string, string>, format: 'CSV' | 'XLSX' | 'PDF') =>
  downloadFile(
    '/analytics/export' + queryString({ ...query, format }),
    'reporte.' + format.toLowerCase(),
  );
export const getCatalog = (query: Record<string, string>) =>
  readJson('/catalog/preview' + queryString(query), catalogPreviewSchema);
export const downloadCatalog = (input: CatalogPdfInput) =>
  downloadFile('/catalog/pdf', 'catalogo.pdf', input);
export const getCatalogVersions = (query: Record<string, string>) =>
  readJson('/catalog/versions' + queryString(query), pageSchema(catalogVersionSchema));
export const downloadVersion = (id: string, filename: string) =>
  downloadFile('/catalog/versions/' + encodeURIComponent(id), filename);
