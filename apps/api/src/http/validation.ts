import type { ZodType } from 'zod';
import { z } from 'zod';
import { HttpError } from './errors.js';

export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new HttpError(400, 'INVALID_INPUT', result.error.issues[0]?.message ?? 'Revisa los datos.');
}

export const idSchema = z.uuid('El identificador no es válido.');
