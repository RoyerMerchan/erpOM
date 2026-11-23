import { z } from 'zod';

export * from './access.js';
export * from './identity.js';
export * from './master-data.js';
export * from './purchasing.js';
export * from './sales.js';

z.config(z.locales.es());

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const livenessSchema = z.object({ status: z.literal('ok') });
export const readinessSchema = z.object({ status: z.literal('ready') });
