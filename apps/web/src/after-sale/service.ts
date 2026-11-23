import {
  correctionDetail,
  correctionPreview,
  correctionSummary,
  layawayDetail,
  layawaySummary,
  pageSchema,
} from '@max-sport/shared';
import type {
  CloseLayawayInput,
  ConfirmCorrectionInput,
  CorrectionInput,
  CreateLayawayInput,
  DepositLayawayInput,
} from '@max-sport/shared';
import { readJson, sendJson } from '../api';

const layawayPath = (id: string) => '/layaways/' + encodeURIComponent(id);
export const getLayaways = (query: Record<string, string>) =>
  readJson('/layaways?' + new URLSearchParams(query), pageSchema(layawaySummary));
export const getLayaway = (id: string) => readJson(layawayPath(id), layawayDetail);
export const createLayaway = (input: CreateLayawayInput) =>
  sendJson('/layaways', layawayDetail, input, 'POST');
export const payLayaway = (id: string, input: DepositLayawayInput) =>
  sendJson(layawayPath(id) + '/payments', layawayDetail, input, 'POST');
export const deliverLayaway = (id: string, operationId: string) =>
  sendJson(layawayPath(id) + '/deliver', layawayDetail, { operationId }, 'POST');
export const closeLayaway = (id: string, expired: boolean, input: CloseLayawayInput) =>
  sendJson(layawayPath(id) + (expired ? '/expire' : '/cancel'), layawayDetail, input, 'POST');

export const getCorrections = (query: Record<string, string>) =>
  readJson('/returns?' + new URLSearchParams(query), pageSchema(correctionSummary));
export const getCorrection = (id: string) =>
  readJson('/returns/' + encodeURIComponent(id), correctionDetail);
export const previewCorrection = (input: CorrectionInput) =>
  sendJson('/returns/preview', correctionPreview, input, 'POST');
export const confirmCorrection = (input: ConfirmCorrectionInput) =>
  sendJson('/returns', correctionDetail, input, 'POST');
